import { supabase } from '../supabase';
import { mudarModalidadeTransacao } from './mudarModalidade';

// Campos opcionais que o formulário envia como undefined quando o usuário os limpa:
// precisam chegar ao banco como null, senão a série nova herdaria o valor antigo.
const CAMPOS_LIMPAVEIS = ['client_id', 'destination_account_id', 'card_holder_name'];

/** Prepara um update para JSONB: undefined = "não alterar", exceto nos campos limpáveis. */
function paraJsonb(update: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(update)) {
    if (value !== undefined) result[key] = value;
    else if (CAMPOS_LIMPAVEIS.includes(key)) result[key] = null;
  }
  return result;
}

export type EditScope = 'this' | 'following' | 'all';

export interface TransactionUpdate {
  description?: string;
  amount?: number;
  category_id?: string;
  account_id?: string | null;
  destination_account_id?: string | null;
  client_id?: string;
  date?: string;
  status?: string;
  modalidade?: 'unica' | 'parcelada' | 'recorrente';
  recurrence_period?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  recurrence_interval?: number;
  due_day?: number;
  installment_total?: number;
  installment_current?: number;
  parent_id?: string;
  is_customized?: boolean;
  invoice_month?: string | null;
  card_holder_name?: string | null;
  // Campos exclusivos de criação de parcelas: chegam no payload mas não existem na tabela.
  start_installment?: number;
  is_total_value?: boolean;
  tags?: string[];
}

export interface EditOptions {
  /**
   * Data da ocorrência antes da edição (instância exibida na UI). Necessária para
   * ocorrências virtuais, em que `transactionId` é o template e a data do registro é
   * a data-âncora da série, não a da ocorrência.
   */
  originalDate?: string;
}

export async function editarTransacao(
  transactionId: string,
  update: TransactionUpdate,
  scope: EditScope = 'this',
  options: EditOptions = {}
) {
  // Higienizar payload removendo propriedades exclusivas de criação de parcelas que não existem na tabela
  const { start_installment: _start_installment, is_total_value: _is_total_value, ...cleanUpdate } = update;

  if (cleanUpdate.account_id === 'sem-conta') {
    cleanUpdate.account_id = null;
  }
  if (cleanUpdate.destination_account_id === 'sem-conta') {
    cleanUpdate.destination_account_id = null;
  }
  // 1. Buscar a transação atual para saber o contexto
  const { data: current, error: fetchError } = await supabase
    .from('financial_transactions')
    .select('*')
    .eq('id', transactionId)
    .single();

  if (fetchError || !current) throw new Error('Erro ao buscar transação');

  const { modalidade: currentModalidade, parent_id, date: currentDate, type } = current as unknown as {
    modalidade: 'unica' | 'parcelada' | 'recorrente';
    parent_id: string | null;
    date: string;
    type: 'income' | 'expense' | 'transfer';
  };

  // ── MUDANÇA ESTRUTURAL DE MODALIDADE ────────────────────────────────
  // Qualquer troca de modalidade é uma operação estrutural: ignora o
  // parâmetro scope (this/following/all não fazem sentido aqui) e
  // generaliza o que antes só existia como caso especial unica→recorrente.
  if (cleanUpdate.modalidade && cleanUpdate.modalidade !== currentModalidade) {
    return mudarModalidadeTransacao(transactionId, current, cleanUpdate);
  }

  // Se for única ou escopo 'este', apenas atualiza uma
  if (currentModalidade === 'unica' || scope === 'this') {
    // Protect tags from direct insert into financial_transactions table
    const { tags: inputTags, ...dbUpdate } = cleanUpdate;

    // Se for o registro mãe de uma recorrência e o escopo for 'somente este',
    // nós não atualizamos a mãe diretamente. Em vez disso, inserimos um novo filho físico
    // mantendo a mãe original intacta como geradora de recorrências futuras.
    if (currentModalidade === 'recorrente' && !parent_id && current.recurrence_enabled && !current.is_template) {
      const { id: _, created_at: __, ...parentFields } = current;
      const newChildPayload = {
        ...parentFields,
        ...dbUpdate,
        date: dbUpdate.date || currentDate,
        user_id: current.user_id,
        type: dbUpdate.type || type,
        parent_id: current.id,
        modalidade: 'unica', // o filho físico é isolado
        is_customized: true,
        installment_current: current.installment_current || 1,
        recurrence_enabled: false,
        is_template: false,
      };

      const { data: newChild, error: insertError } = await supabase
        .from('financial_transactions')
        .insert(newChildPayload)
        .select('id')
        .single();

      if (insertError) return { data: null, error: insertError };

      // Copiar tags para o novo filho físico
      if (inputTags && newChild) {
        if (inputTags.length > 0) {
          const junctionRows = inputTags.map(tagId => ({
            transaction_id: newChild.id,
            tag_id: tagId
          }));
          await supabase.from('transaction_tags').insert(junctionRows);
        }
      }

      return { data: newChild, error: null };
    }

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

    return { data, error: null };
  }

  // Lógica para Parcelas e Recorrências
  const refId = parent_id || current.id; // ID da transação "mãe" ou referência

  // Protect invoice_month and date from uniform overwrite on bulk updates.
  // Each installment/occurrence has its own invoice cycle and date.
  // A UI trava periodicidade e intervalo de uma série (parcelada ou recorrente) já
  // ativa (ver aviso "Alteração de Recorrência Não Permitida"): esses campos só podem
  // ser definidos na criação. Um formulário reaproveitado entre edições pode reter
  // valores obsoletos em campos desabilitados e ainda assim enviá-los aqui — reforça a
  // trava no backend para que isso nunca sobrescreva a periodicidade real da série
  // (causou duplicação semanal de uma recorrência mensal em produção).
  const {
    invoice_month: _removedInvoiceMonth,
    date: _removedDate,
    tags: inputTags,
    recurrence_period: _ignoredRecurrencePeriod,
    recurrence_interval: _ignoredRecurrenceInterval,
    ...safeBulkUpdate
  } = cleanUpdate;

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
      // `effectiveDate` = nova data escolhida no formulário.
      // `originalDate` = data em que a ocorrência editada estava antes da edição.
      // Nunca usar o `currentDate` cru para ocorrências virtuais: aí `current` é o
      // próprio template da série (ver instanceExpansion.ts, instâncias virtuais
      // reusam o id do template) e `currentDate` é a data-âncora da série (ex.: 2024).
      // Para filhas físicas, `currentDate` já é a data original da ocorrência.
      const effectiveDate = cleanUpdate.date || currentDate;
      const originalDate = options.originalDate || (parent_id ? currentDate : effectiveDate);

      // Campos de regra da série não se aplicam a uma ocorrência isolada (usado só
      // quando a ocorrência editada está paga e continua na série antiga).
      const {
        tags: _tags,
        recurrence_period: _period,
        recurrence_interval: _interval,
        due_day: _dueDay,
        installment_total: _installmentTotal,
        ...occurrenceUpdate
      } = cleanUpdate;

      // A divisão inteira (encerrar a série antiga, criar a nova mãe, a primeira filha e
      // as próximas ocorrências) roda numa única transação no banco. Feita em chamadas
      // separadas, uma falha no meio apagaria os futuros sem criar a série nova
      // (ver supabase/migrations/20261013180000_atomic_recurring_series_split.sql).
      const { data: firstChildId, error: splitError } = await supabase.rpc('fn_dividir_serie_recorrente' as never, {
        p_transaction_id: transactionId,
        p_original_date: originalDate,
        p_new_date: effectiveDate,
        p_series_update: paraJsonb({
          ...safeBulkUpdate,
          ...(cleanUpdate.invoice_month !== undefined ? { invoice_month: cleanUpdate.invoice_month } : {}),
        }),
        p_occurrence_update: paraJsonb(occurrenceUpdate),
        p_tags: inputTags ?? null,
      } as never);

      if (splitError) return { data: null, error: splitError };

      return { data: [{ id: firstChildId as unknown as string }], error: null };
    }

    // Comportamento original para parcelas físicas
    const { data: futureTransactions, error: listError } = await supabase
      .from('financial_transactions')
      .select('id, date, status')
      .or(`id.eq.${refId},parent_id.eq.${refId}`)
      .gte('date', currentDate)
      .neq('is_customized', true);

    if (listError) return { data: null, error: listError };

    if (cleanUpdate.date && futureTransactions) {
      const newDateObj = new Date(cleanUpdate.date + 'T12:00:00');
      const targetDay = newDateObj.getDate();

      const dateUpdates = futureTransactions.map((t) => {
        if (t.status === 'paid') {
          return supabase
            .from('financial_transactions')
            .update(safeBulkUpdate)
            .eq('id', t.id);
        }

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
