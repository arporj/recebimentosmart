import { supabase } from '../supabase';
import { format } from 'date-fns';
import { addPeriod, parseLocalDate, gerarInstanciasRecorrentes } from './recorrenciaUtils';
import { calcularMesFatura, type AccountInvoiceConfig } from './faturaUtils';

export interface TransactionInput {
  description: string;
  amount: number;
  type: 'income' | 'expense';
  date: string;
  category_id?: string;
  account_id?: string;
  modalidade: 'unica' | 'parcelada' | 'recorrente';
  installment_total?: number;
  recurrence_period?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  start_installment?: number;
  is_total_value?: boolean;
  due_day?: number;
  recurrence_interval?: number;
  invoice_month?: string | null;
  card_holder_name?: string | null;
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
  const accountConfig = await fetchAccountConfig(input.account_id);

  const baseTransaction = {
    user_id: userData.user.id,
    description: input.description,
    amount: finalAmount,
    type: input.type,
    category_id: input.category_id,
    account_id: input.account_id,
    modalidade: input.modalidade,
    status: 'pending',
    invoice_month: input.invoice_month || null,
    card_holder_name: input.card_holder_name || null,
  };

  if (input.modalidade === 'unica') {
    return await supabase.from('financial_transactions').insert({
      ...baseTransaction,
      date: input.date,
      amount: input.amount // Single transaction doesn't split
    });
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
        });
    }
    
    if (parcels.length === 0) return { data: null, error: new Error('Nenhuma parcela a criar') };

    const { data: firstData, error: firstError } = await supabase.from('financial_transactions').insert(parcels[0]).select().single();
    if (firstError) return { data: null, error: firstError };

    if (parcels.length > 1) {
        const remainingParcels = parcels.slice(1).map(p => ({ ...p, parent_id: firstData.id }));
        return await supabase.from('financial_transactions').insert(remainingParcels);
    }

    return { data: firstData, error: null };
  }

  if (input.modalidade === 'recorrente') {
    const recurrenceInterval = input.recurrence_interval || 1;
    
    const { data: parentData, error: parentError } = await supabase.from('financial_transactions').insert({
      ...baseTransaction,
      date: input.date,
      recurrence_period: recurrencePeriod,
      recurrence_interval: recurrenceInterval,
      recurrence_enabled: true,
    }).select().single();

    if (parentError) return { data: null, error: parentError };

    try {
      await gerarInstanciasRecorrentes(
        parentData,
        baseTransaction,
        recurrencePeriod,
        recurrenceInterval,
        12,
        accountConfig
      );
      return { data: parentData, error: null };
    } catch (error: any) {
      return { data: parentData, error };
    }
  }

  return { data: null, error: new Error('Modalidade inválida') };
}
