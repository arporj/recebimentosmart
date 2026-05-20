import { supabase } from '../supabase';
import { gerarInstanciasRecorrentes } from './recorrenciaUtils';

export type EditScope = 'this' | 'following' | 'all';

export interface TransactionUpdate {
  description?: string;
  amount?: number;
  category_id?: string;
  account_id?: string;
  destination_account_id?: string;
  client_id?: string;
  date?: string;
  status?: string;
  modalidade?: 'unica' | 'parcelada' | 'recorrente';
  recurrence_period?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  recurrence_interval?: number;
  due_day?: number;
  installment_total?: number;
  installment_current?: number;
  parent_id?: string;
  is_customized?: boolean;
  invoice_month?: string | null;
  card_holder_name?: string | null;
}

export async function editarTransacao(
  transactionId: string,
  update: TransactionUpdate,
  scope: EditScope = 'this'
) {
  // 1. Buscar a transação atual para saber o contexto
  const { data: current, error: fetchError } = await supabase
    .from('financial_transactions')
    .select('*')
    .eq('id', transactionId)
    .single();

  if (fetchError || !current) throw new Error('Erro ao buscar transação');

  const { modalidade: currentModalidade, parent_id, date: currentDate, type } = current as any;

  // Se for única ou escopo 'este', apenas atualiza uma
  if (currentModalidade === 'unica' || scope === 'this') {
    const { data, error } = await supabase
      .from('financial_transactions')
      .update({ ...update, is_customized: currentModalidade !== 'unica' })
      .eq('id', transactionId)
      .select()
      .single();

    if (error) return { data, error };

    // LÓGICA ESPECIAL: Se mudou de única para recorrente, gera os filhos
    if (currentModalidade === 'unica' && update.modalidade === 'recorrente') {
      const baseTransaction = {
        user_id: current.user_id,
        description: update.description || current.description,
        amount: update.amount || current.amount,
        type: type,
        category_id: update.category_id || current.category_id,
        account_id: update.account_id || current.account_id,
        destination_account_id: update.destination_account_id || current.destination_account_id,
        modalidade: 'recorrente',
        status: 'pending',
      };

      try {
        await gerarInstanciasRecorrentes(
          data, // A própria transação atualizada (mãe)
          baseTransaction,
          update.recurrence_period || 'monthly',
          update.recurrence_interval || 1
        );
        
        // Habilitar recorrência no registro principal se não foi feito
        await supabase.from('financial_transactions').update({ recurrence_enabled: true }).eq('id', data.id);
      } catch (genError: any) {
        console.error('Erro ao gerar instâncias recorrentes:', genError);
      }
    }

    return { data, error: null };
  }

  // Lógica para Parcelas e Recorrências
  const refId = parent_id || current.id; // ID da transação "mãe" ou referência

  // Protect invoice_month and date from uniform overwrite on bulk updates.
  // Each installment/occurrence has its own invoice cycle and date.
  const { invoice_month: _removedInvoiceMonth, date: _removedDate, ...safeBulkUpdate } = update;

  if (scope === 'all') {
    let query = supabase.from('financial_transactions').update(safeBulkUpdate);
    
    if (currentModalidade === 'parcelada') {
      query = query.or(`id.eq.${refId},parent_id.eq.${refId}`);
    } else {
      query = query.or(`id.eq.${refId},parent_id.eq.${refId}`);
    }
    
    return await query.neq('is_customized', true);
  }

  if (scope === 'following') {
    const { data: futureTransactions, error: listError } = await supabase
      .from('financial_transactions')
      .select('id, date')
      .or(`id.eq.${refId},parent_id.eq.${refId}`)
      .gte('date', currentDate)
      .neq('is_customized', true);

    if (listError) return { data: null, error: listError };

    if (update.date && futureTransactions) {
      const newDateObj = new Date(update.date + 'T12:00:00');
      const targetDay = newDateObj.getDate();

      const dateUpdates = futureTransactions.map((t) => {
        const originalDateObj = new Date(t.date + 'T12:00:00');
        const year = originalDateObj.getFullYear();
        const month = originalDateObj.getMonth();
        const lastDay = new Date(year, month + 1, 0).getDate();
        const safeDay = Math.min(targetDay, lastDay);
        const safeNewDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;

        return supabase
          .from('financial_transactions')
          .update({
            ...safeBulkUpdate,
            date: safeNewDateStr,
          })
          .eq('id', t.id);
      });

      const results = await Promise.all(dateUpdates);
      const firstError = results.find(r => r.error)?.error;
      if (firstError) return { data: null, error: firstError };
      return { data: futureTransactions, error: null };
    } else {
      const { data, error } = await supabase
        .from('financial_transactions')
        .update(safeBulkUpdate)
        .or(`id.eq.${refId},parent_id.eq.${refId}`)
        .gte('date', currentDate)
        .neq('is_customized', true);
      return { data, error };
    }
  }

  return { data: null, error: new Error('Escopo inválido') };
}
