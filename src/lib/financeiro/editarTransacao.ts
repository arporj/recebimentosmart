import { supabase } from '../supabase';
import { gerarInstanciasRecorrentes, addPeriod } from './recorrenciaUtils';
import { format, subDays, parseISO } from 'date-fns';

function ajustarDiaDaData(dateStr: string, diaAlvo: number): string {
  const [year, month, _] = dateStr.split('-');
  const anoNum = Number(year);
  const mesNum = Number(month);
  
  // Obter o último dia do mês para não estourar (ex: dia 31 em fevereiro)
  const ultimoDia = new Date(anoNum, mesNum, 0).getDate();
  const diaSeguro = Math.min(diaAlvo, ultimoDia);
  
  return `${year}-${String(month).padStart(2, '0')}-${String(diaSeguro).padStart(2, '0')}`;
}

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

  const { modalidade: currentModalidade, parent_id, date: currentDate, type } = current as any;

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

    // LÓGICA ESPECIAL: Se mudou de única para recorrente, configura o template e gera os filhos
    if (currentModalidade === 'unica' && cleanUpdate.modalidade === 'recorrente') {
      // 1. Atualizar o registro original para se tornar template
      await supabase.from('financial_transactions').update({ 
        is_template: true,
        recurrence_enabled: true,
        recurrence_period: cleanUpdate.recurrence_period || 'monthly',
        recurrence_interval: cleanUpdate.recurrence_interval || 1,
        due_day: cleanUpdate.due_day || parseISO(currentDate).getDate(),
      }).eq('id', data.id);

      const baseTransaction = {
        user_id: current.user_id,
        description: cleanUpdate.description || current.description,
        amount: cleanUpdate.amount || current.amount,
        type: cleanUpdate.type || type,
        category_id: cleanUpdate.category_id || current.category_id,
        account_id: cleanUpdate.account_id || current.account_id,
        destination_account_id: cleanUpdate.destination_account_id || current.destination_account_id,
        modalidade: 'recorrente',
        status: 'pending',
      };

      // 2. Criar o primeiro filho físico correspondente para a data original
      const firstChildPayload = {
        ...baseTransaction,
        parent_id: data.id,
        date: currentDate,
        status: current.status || 'pending',
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
        console.error('Erro ao criar o primeiro filho na mudança de modalidade:', firstChildError);
      } else if (inputTags && firstChildData) {
        const junctionRows = inputTags.map(tagId => ({
          transaction_id: firstChildData.id,
          tag_id: tagId
        }));
        await supabase.from('transaction_tags').insert(junctionRows);
      }

      // 3. Gerar instâncias futuras
      try {
        const parentData = (await supabase.from('financial_transactions').select('*').eq('id', data.id).single()).data;
        await gerarInstanciasRecorrentes(
          parentData,
          baseTransaction,
          cleanUpdate.recurrence_period || 'monthly',
          cleanUpdate.recurrence_interval || 1,
          12,
          null,
          inputTags || undefined
        );
      } catch (genError: any) {
        console.error('Erro ao gerar instâncias recorrentes:', genError);
      }

      return { data: firstChildData || data, error: null };
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
      
      let newMotherStartDate = effectiveDate;
      let endDateOfOldMother = '';
      
      const isPaid = current.status === 'paid';
      
      if (isPaid) {
        // Se a ocorrência atual já foi paga:
        // 1. Ela mantém a sua data original (currentDate)
        endDateOfOldMother = currentDate;
        
        // 2. A nova mãe (ciclo futuro) começa no ciclo seguinte com o novo dia
        const nextCycleDate = addPeriod(parseISO(currentDate), 1 * (current.recurrence_interval || 1), current.recurrence_period || 'monthly');
        const nextCycleDateStr = format(nextCycleDate, 'yyyy-MM-dd');
        
        const targetDay = parseISO(effectiveDate).getDate();
        newMotherStartDate = ajustarDiaDaData(nextCycleDateStr, targetDay);
        
        // Finalizar a mãe atual definindo a data de término igual à data original da ocorrência editada
        await supabase
          .from('financial_transactions')
          .update({ recurrence_end_date: endDateOfOldMother })
          .eq('id', refId);

        // Deletar filhas físicas futuras (pendentes) maiores que a data original da ocorrência editada
        await supabase
          .from('financial_transactions')
          .delete()
          .eq('parent_id', refId)
          .gt('date', currentDate)
          .neq('status', 'paid');
      } else {
        // Se a ocorrência atual NÃO foi paga ainda:
        // 1. Ela assume a nova data (effectiveDate)
        // 2. A mãe antiga termina no dia anterior à data original da ocorrência editada
        endDateOfOldMother = format(subDays(parseISO(currentDate), 1), 'yyyy-MM-dd');
        
        await supabase
          .from('financial_transactions')
          .update({ recurrence_end_date: endDateOfOldMother })
          .eq('id', refId);

        // Deletar filhas físicas futuras (pendentes) maiores ou iguais à data original da ocorrência editada
        await supabase
          .from('financial_transactions')
          .delete()
          .eq('parent_id', refId)
          .gte('date', currentDate)
          .neq('status', 'paid');
      }

      // Se a transação mãe antiga ficou com término anterior à sua própria data,
      // significa que ela foi totalmente substituída pela nova mãe e deve ser removida.
      if (!current.parent_id && endDateOfOldMother < current.date) {
        await supabase
          .from('financial_transactions')
          .delete()
          .eq('id', refId);
      }


      // 3. Criar a nova mãe (template) com as novas regras
      const { id: _, created_at: __, recurrence_end_date: ___, ...parentFields } = current;
      const targetDay = parseISO(effectiveDate).getDate();
      const newMotherPayload = {
        ...parentFields,
        ...safeBulkUpdate,
        ...(cleanUpdate.invoice_month !== undefined ? { invoice_month: cleanUpdate.invoice_month } : {}),
        date: newMotherStartDate,
        due_day: targetDay,
        status: isPaid ? 'pending' : (cleanUpdate.status || 'pending'),
        paid_date: isPaid ? null : (cleanUpdate.paid_date || null),
        modalidade: 'recorrente',
        recurrence_enabled: true,
        is_template: true,
        installment_current: (current.installment_current || 1) + (isPaid ? 1 : 0),
      };

      const { data: newMother, error: createError } = await supabase
        .from('financial_transactions')
        .insert(newMotherPayload)
        .select()
        .single();

      if (createError) throw createError;

      // Vincular as tags ao template da nova mãe
      if (inputTags && newMother) {
        if (inputTags.length > 0) {
          const junctionRows = inputTags.map(tagId => ({
            transaction_id: newMother.id,
            tag_id: tagId
          }));
          await supabase.from('transaction_tags').insert(junctionRows);
        }
      }

      // 4. Criar o primeiro filho físico real da nova série recorrente
      const newFirstChildPayload = {
        ...newMotherPayload,
        is_template: false,
        parent_id: newMother.id,
      };

      const { data: newFirstChild, error: createChildError } = await supabase
        .from('financial_transactions')
        .insert(newFirstChildPayload)
        .select()
        .single();

      if (createChildError) {
        console.error('Erro ao criar o primeiro filho do novo ciclo recorrente:', createChildError);
      } else if (inputTags && newFirstChild) {
        // Vincular tags ao primeiro filho físico
        if (inputTags.length > 0) {
          const junctionRows = inputTags.map(tagId => ({
            transaction_id: newFirstChild.id,
            tag_id: tagId
          }));
          await supabase.from('transaction_tags').insert(junctionRows);
        }
      }

      // 5. Gerar as 12 próximas ocorrências físicas do novo template
      try {
        await gerarInstanciasRecorrentes(
          newMother,
          {
            user_id: newMother.user_id,
            description: newMother.description,
            amount: newMother.amount,
            type: newMother.type,
            category_id: newMother.category_id,
            account_id: newMother.account_id,
            destination_account_id: newMother.destination_account_id,
            client_id: newMother.client_id,
            modalidade: 'recorrente',
            status: 'pending',
          },
          current.recurrence_period || 'monthly',
          current.recurrence_interval || 1,
          12,
          null,
          inputTags || undefined
        );
      } catch (genError) {
        console.error('Erro ao gerar as instâncias futuras da nova recorrência editada:', genError);
      }

      return { data: [newFirstChild || newMother], error: null };
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
