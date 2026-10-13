import { supabase } from '../supabase';

interface EncerrarSerieOptions {
  /** Mãe (template) da ocorrência que o usuário editou/excluiu. */
  motherId: string;
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
 * A lógica roda no banco (fn_encerrar_serie_recorrente, ver
 * supabase/migrations/20261013180000_atomic_recurring_series_split.sql) para que os
 * vários deletes/updates sejam uma única transação: falhar no meio deixava a série
 * pela metade.
 *
 * Retorna o `series_id` que uma nova mãe (se houver) deve herdar.
 */
export async function encerrarSerieAPartirDe({
  motherId,
  cutFrom,
  keepPaidChildren,
  cancelChildren = false,
}: EncerrarSerieOptions): Promise<string> {
  const { data, error } = await supabase.rpc('fn_encerrar_serie_recorrente' as never, {
    p_mother_id: motherId,
    p_cut_from: cutFrom,
    p_keep_paid_children: keepPaidChildren,
    p_cancel_children: cancelChildren,
  } as never);
  if (error) throw error;
  return data as unknown as string;
}
