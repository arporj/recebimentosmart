-- supabase/migrations/20250731120000_rewrite_referral_stats_logic.sql

-- Reescreve a função get_full_referral_stats para usar a tabela `referrals` como a fonte da verdade,
-- utilizando a coluna `is_converted` para contar os pagamentos confirmados, conforme a estrutura da tabela.

CREATE OR REPLACE FUNCTION get_full_referral_stats(p_user_id UUID)
RETURNS TABLE (
  referral_code TEXT,
  total_registered BIGINT,
  total_paid BIGINT,
  available_credits BIGINT,
  was_referred BOOLEAN,
  referrer_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH user_referral_code AS (
    -- Pega o código de indicação do próprio usuário a partir do seu perfil.
    SELECT p.referral_code::TEXT AS user_ref_code
    FROM public.profiles p
    WHERE p.id = p_user_id
    LIMIT 1
  ),
  referral_counts AS (
    -- CORRIGIDO: Conta indicações totais e convertidas diretamente da tabela `referrals`.
    SELECT
      -- Conta todos os registros onde o usuário é o indicador.
      COUNT(id) AS registered,
      -- Conta apenas os registros marcados como convertidos (pagos).
      COUNT(CASE WHEN is_converted = TRUE THEN 1 END) AS paid
    FROM public.referrals
    WHERE referrer_id = p_user_id
  ),
  referral_info AS (
    -- Verifica se o usuário atual foi, ele mesmo, indicado por alguém.
    SELECT
      EXISTS(SELECT 1 FROM public.referrals WHERE referred_id = p_user_id) as referred,
      (SELECT pr.name FROM public.profiles pr JOIN public.referrals r ON pr.id = r.referrer_id WHERE r.referred_id = p_user_id LIMIT 1) as ref_name
  ),
  credits_info AS (
    -- Calcula os créditos disponíveis a partir da tabela de créditos.
    SELECT
      COUNT(*) AS credits
    FROM public.referral_credits
    WHERE referrer_user_id = p_user_id AND status = 'credited'
  )
  -- Junta todas as informações para o resultado final.
  SELECT
    (SELECT user_ref_code FROM user_referral_code) AS referral_code,
    rc.registered AS total_registered,
    rc.paid AS total_paid,
    ci.credits AS available_credits,
    ri.referred AS was_referred,
    ri.ref_name AS referrer_name
  FROM referral_counts rc, credits_info ci, referral_info ri;
END;
$$;
