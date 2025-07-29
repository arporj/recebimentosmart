
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
AS $$
BEGIN
  RETURN QUERY
  WITH user_referral_code AS (
    -- Pega o código de indicação do próprio usuário
    SELECT r.code
    FROM referrals r
    WHERE r.referrer_user_id = p_user_id
    LIMIT 1
  ),
  referral_counts AS (
    -- Conta quantos usuários se registraram com o código e quantos pagaram
    SELECT
      COUNT(*) AS registered,
      COUNT(CASE WHEN p.status = 'paid' THEN 1 END) AS paid
    FROM users u
    LEFT JOIN profiles p ON u.id = p.id
    WHERE u.raw_user_meta_data->>'referral_code' = (SELECT code FROM user_referral_code)
  ),
  referral_info AS (
    -- Verifica se o usuário atual foi indicado por alguém
    SELECT
      EXISTS(SELECT 1 FROM referrals WHERE referred_user_id = p_user_id) as referred,
      (SELECT p.name FROM profiles p JOIN referrals r ON p.id = r.referrer_user_id WHERE r.referred_user_id = p_user_id LIMIT 1) as ref_name
  ),
  credits_info AS (
    -- Calcula os créditos disponíveis
    SELECT
      COUNT(*) AS credits
    FROM referral_credits
    WHERE user_id = p_user_id AND is_used = FALSE
  )
  SELECT
    (SELECT code FROM user_referral_code) AS referral_code,
    rc.registered AS total_registered,
    rc.paid AS total_paid,
    ci.credits AS available_credits,
    ri.referred AS was_referred,
    ri.ref_name AS referrer_name
  FROM referral_counts rc, credits_info ci, referral_info ri;
END;
$$;
