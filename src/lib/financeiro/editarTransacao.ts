import { supabase } from '../supabase';

export type EditScope = 'this' | 'following' | 'all';

export interface TransactionUpdate {
  description?: string;
  amount?: number;
  category_id?: string;
  account_id?: string;
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

  const { modalidade, parent_id, date: currentDate } = current as any;

  // Se for única ou escopo 'este', apenas atualiza uma
  if (modalidade === 'unica' || scope === 'this') {
    return await supabase
      .from('financial_transactions')
      .update({ ...update, is_customized: modalidade !== 'unica' })
      .eq('id', transactionId);
  }

  // Lógica para Parcelas e Recorrências
  const refId = parent_id || current.id; // ID da transação "mãe" ou referência

  if (scope === 'all') {
    // Atualiza todas que pertencem ao mesmo grupo
    // Para parcelas: compartilhamos as mesmas propriedades de parcelamento
    // Para recorrências: compartilhamos o parent_id
    let query = supabase.from('financial_transactions').update(update);
    
    if (modalidade === 'parcelada') {
      // Como não temos installment_group_id, filtramos por parent_id ou descrição similar se necessário
      // Mas o ideal é que todas as parcelas tenham o mesmo parent_id se forem criadas juntas
      // Na nossa criarTransacao.ts, não definimos parent_id para parcelas. 
      // VOU AJUSTAR criarTransacao para definir um parent_id para parcelas também.
      query = query.or(`id.eq.${refId},parent_id.eq.${refId}`);
    } else {
      query = query.or(`id.eq.${refId},parent_id.eq.${refId}`);
    }
    
    return await query.neq('is_customized', true); // Não sobrescreve as que foram customizadas individualmente
  }

  if (scope === 'following') {
    // Atualiza a atual e as futuras que não estão customizadas
    return await supabase
      .from('financial_transactions')
      .update(update)
      .or(`id.eq.${refId},parent_id.eq.${refId}`)
      .gte('date', currentDate)
      .neq('is_customized', true);
  }

  return { data: null, error: new Error('Escopo inválido') };
}
