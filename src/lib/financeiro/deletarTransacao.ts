import { supabase } from '../supabase';

export type DeleteScope = 'this' | 'following' | 'all';

export async function deletarTransacao(
  transactionId: string,
  scope: DeleteScope = 'this'
) {
  // 1. Buscar contexto
  const { data: current, error: fetchError } = await supabase
    .from('financial_transactions')
    .select('*')
    .eq('id', transactionId)
    .single();

  if (fetchError || !current) throw new Error('Erro ao buscar transação');

  const { modalidade, parent_id, date: currentDate } = current as any;

  if (modalidade === 'unica' || scope === 'this') {
    return await supabase.from('financial_transactions').delete().eq('id', transactionId);
  }

  const refId = parent_id || current.id;

  if (scope === 'all') {
    // Deleta todas do grupo (mãe e filhas)
    return await supabase
      .from('financial_transactions')
      .delete()
      .or(`id.eq.${refId},parent_id.eq.${refId}`);
  }

  if (scope === 'following') {
    // Deleta do grupo que sejam >= data atual
    return await supabase
      .from('financial_transactions')
      .delete()
      .or(`id.eq.${refId},parent_id.eq.${refId}`)
      .gte('date', currentDate);
  }

  return { data: null, error: new Error('Escopo inválido') };
}
