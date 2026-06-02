import { supabase } from '../supabase';
import { gerarInstanciasRecorrentes } from './recorrenciaUtils';
import { format, subDays, parseISO } from 'date-fns';

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
  // Higienizar payload removendo propriedades exclusivas de criação de parcelas que não existem na tabela
  const { start_installment, is_total_value, ...cleanUpdate } = update as any;
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
    const { tags: inputTags, ...dbUpdate } = cleanUpdate;

    const { data, error } = await supabase
      .from('financial_transactions')
      .update({ ...dbUpdate, is_customized: currentModalidade !== 'unica' })
      .eq('id', transactionId)
      .select('id')
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
    if (currentModalidade === 'unica' && cleanUpdate.modalidade === 'recorrente') {
      const baseTransaction = {
        user_id: current.user_id,
        description: cleanUpdate.description || current.description,
        amount: cleanUpdate.amount || current.amount,
        type: type,
        category_id: cleanUpdate.category_id || current.category_id,
        account_id: cleanUpdate.account_id || current.account_id,
        destination_account_id: cleanUpdate.destination_account_id || current.destination_account_id,
        modalidade: 'recorrente',
        status: 'pending',
      };

      try {
        await gerarInstanciasRecorrentes(
          data, // A própria transação atualizada (mãe)
          baseTransaction,
          cleanUpdate.recurrence_period || 'monthly',
          cleanUpdate.recurrence_interval || 1,
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
  const { invoice_month: _removedInvoiceMonth, date: _removedDate, tags: inputTags, ...safeBulkUpdate } = cleanUpdate;

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
    // Se for recorrente infinita, aplica a fragmentação elegante
    if (currentModalidade === 'recorrente') {
      const effectiveDate = cleanUpdate.date || currentDate;
      const parsedEffectiveDate = parseISO(effectiveDate);
      
      // 1. Finalizar a mãe atual definindo a data de término como o dia anterior à nova data de corte
      const endDate = format(subDays(parsedEffectiveDate, 1), 'yyyy-MM-dd');
      
      await supabase
        .from('financial_transactions')
        .update({ recurrence_end_date: endDate })
        .eq('id', refId);

      // Deletar filhas físicas futuras da mãe antiga que estejam na data de corte ou depois
      await supabase
        .from('financial_transactions')
        .delete()
        .eq('parent_id', refId)
        .gte('date', effectiveDate);

      // 2. Criar a nova mãe com as novas regras começando a partir da data de corte
      const newMotherPayload = {
        user_id: current.user_id,
        client_id: cleanUpdate.client_id !== undefined ? cleanUpdate.client_id : current.client_id,
        description: cleanUpdate.description !== undefined ? cleanUpdate.description : current.description,
        amount: cleanUpdate.amount !== undefined ? cleanUpdate.amount : current.amount,
        type: type,
        category_id: cleanUpdate.category_id !== undefined ? cleanUpdate.category_id : current.category_id,
        account_id: cleanUpdate.account_id !== undefined ? cleanUpdate.account_id : current.account_id,
        destination_account_id: cleanUpdate.destination_account_id !== undefined ? cleanUpdate.destination_account_id : current.destination_account_id,
        date: effectiveDate,
        status: cleanUpdate.status || 'pending',
        paid_date: cleanUpdate.paid_date || null,
        modalidade: 'recorrente',
        recurrence_enabled: true,
        recurrence_period: cleanUpdate.recurrence_period !== undefined ? cleanUpdate.recurrence_period : current.recurrence_period,
        recurrence_interval: cleanUpdate.recurrence_interval !== undefined ? cleanUpdate.recurrence_interval : current.recurrence_interval,
        installment_current: 1, // Recomeça como ciclo 1 da nova série
        invoice_month: cleanUpdate.invoice_month !== undefined ? cleanUpdate.invoice_month : current.invoice_month,
        card_holder_name: cleanUpdate.card_holder_name !== undefined ? cleanUpdate.card_holder_name : current.card_holder_name
      };

      const { data: newMother, error: createError } = await supabase
        .from('financial_transactions')
        .insert(newMotherPayload)
        .select('id')
        .single();

      if (createError) throw createError;

      // Vincular as tags à nova transação mãe se fornecidas
      if (inputTags && newMother) {
        if (inputTags.length > 0) {
          const junctionRows = inputTags.map(tagId => ({
            transaction_id: newMother.id,
            tag_id: tagId
          }));
          await supabase.from('transaction_tags').insert(junctionRows);
        }
      }

      return { data: [newMother], error: null };
    }

    // Comportamento original para parcelas físicas
    const { data: futureTransactions, error: listError } = await supabase
      .from('financial_transactions')
      .select('id, date')
      .or(`id.eq.${refId},parent_id.eq.${refId}`)
      .gte('date', currentDate)
      .neq('is_customized', true);

    if (listError) return { data: null, error: listError };

    if (cleanUpdate.date && futureTransactions) {
      const newDateObj = new Date(cleanUpdate.date + 'T12:00:00');
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
