// API para obter informações de referência do usuário
// Arquivo: pages/api/user/referral-info.js

import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Método não permitido' });
  }

  const supabase = createServerSupabaseClient({ req, res });

  try {
    // Obter sessão do usuário
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      return res.status(401).json({ success: false, message: 'Não autorizado' });
    }

    const userId = session.user.id;

    // Buscar o código de referência do usuário
    // Assumindo que a coluna está em auth.users. Se estiver em public.profiles, ajuste a query
    const { data: userData, error: userError } = await supabase
      .from('users') // Cuidado: A tabela 'users' em auth geralmente não é diretamente acessível. 
                     // Se você tem uma tabela 'profiles' em public, use-a.
                     // Vamos assumir que você tem RLS na tabela 'profiles' que permite leitura do próprio perfil.
      .select('referral_code')
      .eq('id', userId)
      .single();

    // Alternativa se você não tem tabela 'profiles' e adicionou a coluna em auth.users (menos seguro)
    // Precisaria de uma função RPC para buscar o código de forma segura.
    // Exemplo de função RPC (precisa criar no Supabase):
    /*
    CREATE OR REPLACE FUNCTION get_my_referral_code()
    RETURNS TEXT AS $$
    DECLARE
      v_code TEXT;
    BEGIN
      SELECT referral_code INTO v_code
      FROM auth.users
      WHERE id = auth.uid();
      RETURN v_code;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
    */
    // const { data: referral_code, error: rpcError } = await supabase.rpc('get_my_referral_code');

    if (userError) {
        // Se o erro for porque a tabela 'users' não existe (comum se for a de auth)
        // ou se não há RLS permitindo a leitura, tente a função RPC
        const { data: referral_code_rpc, error: rpcError } = await supabase.rpc('get_my_referral_code');
        if (rpcError) throw rpcError;
        if (!referral_code_rpc) {
             return res.status(404).json({ success: false, message: 'Código de referência não encontrado ou não gerado.' });
        }
         return res.status(200).json({ success: true, referralCode: referral_code_rpc });
    }

    if (!userData?.referral_code) {
      // Pode acontecer se o código ainda não foi gerado para este usuário
      // Idealmente, o script SQL já deveria ter gerado para todos.
      // Poderia tentar gerar aqui, mas é melhor garantir no script inicial.
      return res.status(404).json({ success: false, message: 'Código de referência não encontrado ou não gerado.' });
    }

    return res.status(200).json({ success: true, referralCode: userData.referral_code });

  } catch (error) {
    console.error('Erro ao obter código de referência:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Falha ao obter código de referência',
      error: error.message
    });
  }
}

