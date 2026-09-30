import { supabase } from '../supabase';
import { format, subDays, parseISO } from 'date-fns';

interface EncerrarSerieOptions {
  /** Mãe (template) da ocorrência que o usuário editou/excluiu. */
  motherId: string;
  userId: string;
  /** Primeira data (yyyy-MM-dd, inclusive) que deixa de pertencer à série antiga. */
  cutFrom: string;
  /** Edição preserva filhas já pagas (histórico); exclusão remove tudo a partir do corte. */
  keepPaidChildren: boolean;
  /** Recorrência compartilhada: cancela as filhas em vez de apagá-las. */
  cancelChildren?: boolean;
}

/**
 * Encerra, a partir de `cutFrom`, TODOS os pedaços (mães) da mesma série recorrente —
 * não só a mãe da ocorrência editada.
 *
 * Cada edição "este e os futuros" divide a série: encerra a mãe atual e cria uma nova
 * (com o mesmo `series_id`). Uma ocorrência anterior à divisão continua pertencendo à
 * mãe antiga, então uma segunda edição/exclusão "este e os futuros" feita nela precisa
 * encerrar também as mães criadas depois — senão elas seguem ativas junto com a nova
 * e o lançamento aparece duplicado todo mês.
 *
 * Retorna o `series_id` que a nova mãe (se houver) deve herdar.
 */
export async function encerrarSerieAPartirDe({
  motherId,
  userId,
  cutFrom,
  keepPaidChildren,
  cancelChildren = false,
}: EncerrarSerieOptions): Promise<string> {
  // Os tipos gerados de financial_transactions estão desatualizados (sem series_id,
  // recurrence_end_date etc.), por isso os casts — mesmo padrão do restante de lib/financeiro.
  const { data: motherData, error: motherError } = await supabase
    .from('financial_transactions')
    .select('id, series_id')
    .eq('id', motherId)
    .single();
  if (motherError || !motherData) throw motherError || new Error('Série recorrente não encontrada');

  const mother = motherData as unknown as { id: string; series_id: string | null };
  const seriesId = mother.series_id || mother.id;

  const { data: segmentsData, error: segmentsError } = await supabase
    .from('financial_transactions')
    .select('id, date, recurrence_end_date')
    .eq('user_id', userId)
    .is('parent_id', null)
    .or(`id.eq.${motherId},series_id.eq.${seriesId}`);
  if (segmentsError) throw segmentsError;

  const segments = (segmentsData || []) as unknown as Array<{
    id: string;
    date: string;
    recurrence_end_date: string | null;
  }>;

  const endBeforeCut = format(subDays(parseISO(cutFrom), 1), 'yyyy-MM-dd');

  for (const segment of segments) {
    // 1. Filhas físicas do pedaço a partir do corte
    let childrenQuery = cancelChildren
      ? supabase.from('financial_transactions').update({ status: 'cancelled', shared_status: 'modified' })
      : supabase.from('financial_transactions').delete();
    childrenQuery = childrenQuery.eq('parent_id', segment.id).gte('date', cutFrom);
    if (keepPaidChildren) childrenQuery = childrenQuery.neq('status', 'paid');
    const { error: childrenError } = await childrenQuery;
    if (childrenError) throw childrenError;

    if (segment.date >= cutFrom) {
      // 2a. Pedaço inteiro depois do corte: não pode gerar mais nada. Só apaga a mãe se
      // não sobrou nenhuma filha (ex.: já paga) — apagar com filhas deixaria as filhas
      // órfãs (parent_id ON DELETE SET NULL).
      const { count, error: countError } = await supabase
        .from('financial_transactions')
        .select('id', { count: 'exact', head: true })
        .eq('parent_id', segment.id);
      if (countError) throw countError;

      const { error: segmentError } = count
        ? await supabase
            .from('financial_transactions')
            .update({ recurrence_end_date: endBeforeCut } as never)
            .eq('id', segment.id)
        : await supabase.from('financial_transactions').delete().eq('id', segment.id);
      if (segmentError) throw segmentError;
    } else if (!segment.recurrence_end_date || segment.recurrence_end_date >= cutFrom) {
      // 2b. Pedaço que atravessa o corte: termina na véspera
      const { error: endError } = await supabase
        .from('financial_transactions')
        .update({ recurrence_end_date: endBeforeCut } as never)
        .eq('id', segment.id);
      if (endError) throw endError;
    }
  }

  return seriesId;
}
