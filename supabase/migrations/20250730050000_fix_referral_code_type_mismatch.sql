-- supabase/migrations/20250730050000_fix_referral_code_type_mismatch.sql

-- Correção da função get_full_referral_stats para resolver o erro de tipo de retorno
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
    -- Pega o código de indicação do próprio usuário da tabela profiles e faz o cast para TEXT
    SELECT p.referral_code::TEXT AS user_ref_code -- Cast explícito para TEXT
    FROM public.profiles p
    WHERE p.id = p_user_id
    LIMIT 1
  ),
  referral_counts AS (
    -- Conta quantos usuários se registraram com o código e quantos pagaram
    SELECT
      COUNT(*) AS registered,
      COUNT(CASE WHEN p.valid_until > NOW() THEN 1 END) AS paid
    FROM auth.users u
    LEFT JOIN public.profiles p ON u.id = p.id
    WHERE u.raw_user_meta_data->>'referral_code' = (SELECT user_ref_code FROM user_referral_code)
  ),
  referral_info AS (
    -- Verifica se o usuário atual foi indicado por alguém
    SELECT
      EXISTS(SELECT 1 FROM public.referrals WHERE referred_id = p_user_id) as referred,
      (SELECT pr.name FROM public.profiles pr JOIN public.referrals r ON pr.id = r.referrer_id WHERE r.referred_id = p_user_id LIMIT 1) as ref_name
  ),
  credits_info AS (
    -- Calcula os créditos disponíveis
    SELECT
      COUNT(*) AS credits
    FROM public.referral_credits
    WHERE referrer_user_id = p_user_id AND status = 'credited'
  )
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