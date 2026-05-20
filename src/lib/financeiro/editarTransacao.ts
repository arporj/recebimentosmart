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
  tags?: string[];
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
    // Protect tags from direct insert into financial_transactions table
    const { tags: inputTags, ...dbUpdate } = update;

    const { data, error } = await supabase
      .from('financial_transactions')
      .update({ ...dbUpdate, is_customized: currentModalidade !== 'unica' })
      .eq('id', transactionId)
      .select()
      .single();

    if (error) return { data, error };

    // Sincronizar tags fisicamente no BD
    if (inputTags) {
      await supabase.from('transaction_tags').delete().eq('transaction_id', transactionId);

      if (inputTags.length > 0) {
        const junctionRows = inputTags.map(tagId => ({
          transaction_id: transactionId,
          tag_id: tagId
        }));
        const { error: tagError } = await supabase.from('transaction_tags').insert(junctionRows);
        if (tagError) console.error('Erro ao atualizar tags para escopo this:', tagError);
      }
    }

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
          update.recurrence_interval || 1,
          12,
          null,
          inputTags || undefined
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
  const { invoice_month: _removedInvoiceMonth, date: _removedDate, tags: inputTags, ...safeBulkUpdate } = update;

  if (scope === 'all') {
    let query = supabase.from('financial_transactions').update(safeBulkUpdate);
    
    query = query.or(`id.eq.${refId},parent_id.eq.${refId}`).neq('is_customized', true).select('id');
    const { data: updatedRows, error } = await query;
    if (error) return { data: null, error };

    if (inputTags && updatedRows && updatedRows.length > 0) {
      const ids = updatedRows.map(r => r.id);
      await supabase.from('transaction_tags').delete().in('transaction_id', ids);

      if (inputTags.length > 0) {
        const junctionRows = updatedRows.flatMap(row =>
          inputTags.map(tagId => ({
            transaction_id: row.id,
            tag_id: tagId
          }))
        );
        const { error: tagError } = await supabase.from('transaction_tags').insert(junctionRows);
        if (tagError) console.error('Erro ao atualizar tags para escopo all:', tagError);
      }
    }
    
    return { data: updatedRows, error: null };
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

      // Sincronizar tags para o escopo following (com data)
      if (inputTags && futureTransactions.length > 0) {
        const ids = futureTransactions.map(t => t.id);
        await supabase.from('transaction_tags').delete().in('transaction_id', ids);

        if (inputTags.length > 0) {
          const junctionRows = futureTransactions.flatMap(t =>
            inputTags.map(tagId => ({
              transaction_id: t.id,
              tag_id: tagId
            }))
          );
          const { error: tagError } = await supabase.from('transaction_tags').insert(junctionRows);
          if (tagError) console.error('Erro ao atualizar tags para escopo following:', tagError);
        }
      }

      return { data: futureTransactions, error: null };
    } else {
      const { data: updatedRows, error } = await supabase
        .from('financial_transactions')
        .update(safeBulkUpdate)
        .or(`id.eq.${refId},parent_id.eq.${refId}`)
        .gte('date', currentDate)
        .neq('is_customized', true)
        .select('id');

      if (error) return { data: null, error };

      // Sincronizar tags para o escopo following (sem data)
      if (inputTags && updatedRows && updatedRows.length > 0) {
        const ids = updatedRows.map(r => r.id);
        await supabase.from('transaction_tags').delete().in('transaction_id', ids);

        if (inputTags.length > 0) {
          const junctionRows = updatedRows.flatMap(row =>
            inputTags.map(tagId => ({
              transaction_id: row.id,
              tag_id: tagId
            }))
          );
          const { error: tagError } = await supabase.from('transaction_tags').insert(junctionRows);
          if (tagError) console.error('Erro ao atualizar tags para escopo following (sem data):', tagError);
        }
      }

      return { data: updatedRows, error };
    }
  }

  return { data: null, error: new Error('Escopo inválido') };
}
