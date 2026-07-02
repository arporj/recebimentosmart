import { supabase } from '../supabase';

/**
 * Busca o ID da conta padrão (is_default = true) do usuário.
 * Se não existir nenhuma conta padrão, cria uma conta "Conta Principal"
 * marcada como padrão e retorna seu ID.
 */
export async function getOrCreateContaPrincipal(userId: string): Promise<string> {
  // 1. Tenta buscar conta com is_default = true
  const { data: defaultAccount, error: fetchError } = await supabase
    .from('financial_accounts')
    .select('id')
    .eq('user_id', userId)
    .eq('is_default', true)
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Erro ao buscar conta padrão: ${fetchError.message}`);
  }

  if (defaultAccount) {
    return defaultAccount.id;
  }

  // 2. Nenhuma conta padrão — cria uma nova "Conta Principal"
  const { data: created, error: createError } = await supabase
    .from('financial_accounts')
    .insert({
      user_id: userId,
      name: 'Conta Principal',
      type: 'checking',
      initial_balance: 0,
      is_default: true,
    })
    .select('id')
    .single();

  if (createError || !created) {
    throw new Error(`Erro ao criar conta principal: ${createError?.message}`);
  }

  return created.id;
}

/**
 * Lista todas as contas do usuário, marcando qual é a padrão.
 * Útil para popular seletores de conta.
 */
export async function listarContas(userId: string) {
  const { data, error } = await supabase
    .from('financial_accounts')
    .select('id, name, type, is_default, initial_balance')
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`Erro ao listar contas: ${error.message}`);
  }

  return data || [];
}

/**
 * Define uma conta como padrão (is_default = true).
 * O trigger no banco garante que as outras contas do usuário
 * terão is_default = false automaticamente.
 */
export async function definirContaPadrao(accountId: string): Promise<void> {
  const { error } = await supabase
    .from('financial_accounts')
    .update({ is_default: true })
    .eq('id', accountId);

  if (error) {
    throw new Error(`Erro ao definir conta padrão: ${error.message}`);
  }
}
