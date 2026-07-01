import { supabase } from '../supabase';
import { format } from 'date-fns';
import { addPeriod, parseLocalDate, gerarInstanciasRecorrentes } from './recorrenciaUtils';
import { calcularMesFatura, type AccountInvoiceConfig } from './faturaUtils';

export interface TransactionInput {
  description: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  date: string;
  category_id?: string;
  account_id?: string;
  destination_account_id?: string;
  client_id?: string;
  modalidade: 'unica' | 'parcelada' | 'recorrente';
  installment_total?: number;
  recurrence_period?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  start_installment?: number;
  is_total_value?: boolean;
  due_day?: number;
  recurrence_interval?: number;
  invoice_month?: string | null;
  card_holder_name?: string | null;
  status?: 'pending' | 'paid' | 'partial';
  tags?: string[];
  auto_confirm?: boolean;
}

/**
 * Fetches the account configuration needed for invoice month calculation.
 * Returns null if account_id is missing or query fails.
 */
async function fetchAccountConfig(accountId?: string): Promise<AccountInvoiceConfig | null> {
  if (!accountId) return null;

  const { data, error } = await supabase
    .from('financial_accounts')
    .select('type, due_day, closing_days_before')
    .eq('id', accountId)
    .single();

  if (error || !data) return null;
  return data as AccountInvoiceConfig;
}

export async function criarTransacao(input: TransactionInput) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Usuário não autenticado');

  const installmentTotal = input.installment_total || 1;
  const startInstallment = input.start_installment || 1;
  const recurrencePeriod = input.recurrence_period || 'monthly';
  
  // Adjust value if total was provided
  const finalAmount = input.is_total_value 
    ? Number((input.amount / installmentTotal).toFixed(2))
    : input.amount;

  // Fetch account config for credit card invoice calculation
  const accountConfig = input.account_id && input.account_id !== 'sem-conta'
    ? await fetchAccountConfig(input.account_id)
    : null;

  const baseTransaction = {
    user_id: userData.user.id,
    description: input.description,
    amount: finalAmount,
    type: input.type,
    category_id: input.category_id,
    account_id: input.account_id === 'sem-conta' ? null : (input.account_id || null),
    destination_account_id: input.destination_account_id === 'sem-conta' ? null : (input.destination_account_id || null),
    client_id: input.client_id,
    modalidade: input.modalidade,
    status: input.status || 'pending',
    invoice_month: input.invoice_month || null,
    card_holder_name: input.card_holder_name || null,
    auto_confirm: input.auto_confirm ?? false,
  };

  if (input.modalidade === 'unica') {
    const { data: created, error } = await supabase
      .from('financial_transactions')
      .insert({
        ...baseTransaction,
        date: input.date,
        amount: input.amount // Single transaction doesn't split
      })
      .select()
      .single();

    if (error) return { data: null, error };

    if (input.tags && input.tags.length > 0 && created) {
      const junctionRows = input.tags.map(tagId => ({
        transaction_id: created.id,
        tag_id: tagId
      }));
      const { error: tagError } = await supabase.from('transaction_tags').insert(junctionRows);
      if (tagError) console.error('Erro ao salvar tags da transação única:', tagError);
    }

    return { data: created, error: null };
  }

  if (input.modalidade === 'parcelada') {
    const startDate = parseLocalDate(input.date);
    const parcels = [];

    for (let i = startInstallment; i <= installmentTotal; i++) {
        const indexOffset = i - startInstallment;
        const dueDate = addPeriod(startDate, indexOffset, recurrencePeriod);
        const dueDateStr = format(dueDate, 'yyyy-MM-dd');
        
        // Dynamically calculate invoice_month for each installment
        const invoiceMonth = accountConfig
          ? calcularMesFatura(dueDateStr, accountConfig)
          : baseTransaction.invoice_month;

        parcels.push({
          ...baseTransaction,
          description: `${input.description} (${i}/${installmentTotal})`,
          date: dueDateStr,
          installment_current: i,
          installment_total: installmentTotal,
          modalidade: 'parcelada',
          invoice_month: invoiceMonth,
          status: i === startInstallment ? baseTransaction.status : 'pending',
        });
    }
    
    if (parcels.length === 0) return { data: null, error: new Error('Nenhuma parcela a criar') };

    const { data: firstData, error: firstError } = await supabase
      .from('financial_transactions')
      .insert(parcels[0])
      .select()
      .single();
    
    if (firstError) return { data: null, error: firstError };

    // Salvar tags para a primeira parcela
    if (input.tags && input.tags.length > 0 && firstData) {
      const junctionRows = input.tags.map(tagId => ({
        transaction_id: firstData.id,
        tag_id: tagId
      }));
      const { error: tagError } = await supabase.from('transaction_tags').insert(junctionRows);
      if (tagError) console.error('Erro ao salvar tags da primeira parcela:', tagError);
    }

    if (parcels.length > 1) {
        const remainingParcels = parcels.slice(1).map(p => ({ ...p, parent_id: firstData.id }));
        const { data: remainingData, error: remainingError } = await supabase
          .from('financial_transactions')
          .insert(remainingParcels)
          .select('id');

        if (remainingError) return { data: firstData, error: remainingError };

        // Salvar tags para as parcelas filhas
        if (input.tags && input.tags.length > 0 && remainingData) {
          const junctionRows = remainingData.flatMap(p => 
            input.tags!.map(tagId => ({
              transaction_id: p.id,
              tag_id: tagId
            }))
          );
          const { error: tagError } = await supabase.from('transaction_tags').insert(junctionRows);
          if (tagError) console.error('Erro ao salvar tags das parcelas filhas:', tagError);
        }
    }

    return { data: firstData, error: null };
  }

  if (input.modalidade === 'recorrente') {
    const recurrenceInterval = input.recurrence_interval || 1;
    
    // 1. Inserir a transação mãe como template (is_template = true)
    const { data: parentData, error: parentError } = await supabase.from('financial_transactions').insert({
      ...baseTransaction,
      date: input.date,
      recurrence_period: recurrencePeriod,
      recurrence_interval: recurrenceInterval,
      recurrence_enabled: true,
      installment_current: 1,
      installment_total: 1,
      is_template: true,
    }).select().single();

    if (parentError) return { data: null, error: parentError };

    // 2. Salvar tags para o template de recorrência mãe
    if (input.tags && input.tags.length > 0 && parentData) {
      const junctionRows = input.tags.map(tagId => ({
        transaction_id: parentData.id,
        tag_id: tagId
      }));
      const { error: tagError } = await supabase.from('transaction_tags').insert(junctionRows);
      if (tagError) console.error('Erro ao salvar tags do template de recorrência mãe:', tagError);
    }

    // 3. Inserir imediatamente o primeiro lançamento físico real (Filho 1, com is_template = false)
    const firstChildPayload = {
      ...baseTransaction,
      parent_id: parentData.id,
      date: input.date,
      status: input.status || 'pending',
      installment_current: 1,
      installment_total: 1,
      is_template: false,
    };

    const { data: firstChildData, error: firstChildError } = await supabase
      .from('financial_transactions')
      .insert(firstChildPayload)
      .select()
      .single();

    if (firstChildError) {
      console.error('Erro ao criar primeiro lançamento físico da recorrência:', firstChildError);
      return { data: parentData, error: firstChildError };
    }

    // Salvar tags para o primeiro lançamento físico
    if (input.tags && input.tags.length > 0 && firstChildData) {
      const junctionRows = input.tags.map(tagId => ({
        transaction_id: firstChildData.id,
        tag_id: tagId
      }));
      const { error: tagError } = await supabase.from('transaction_tags').insert(junctionRows);
      if (tagError) console.error('Erro ao salvar tags do primeiro lançamento físico:', tagError);
    }

    // 4. Gerar as 12 ocorrências subsequentes físicas futuras
    try {
      await gerarInstanciasRecorrentes(
        parentData,
        baseTransaction,
        recurrencePeriod,
        recurrenceInterval,
        12,
        accountConfig,
        input.tags
      );
      return { data: firstChildData, error: null };
    } catch (error: any) {
      return { data: firstChildData, error };
    }
  }

  return { data: null, error: new Error('Modalidade inválida') };
}
