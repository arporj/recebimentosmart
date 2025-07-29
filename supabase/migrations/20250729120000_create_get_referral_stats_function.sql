
CREATE OR REPLACE FUNCTION get_referral_stats(p_user_id UUID)
RETURNS TABLE (available_credits BIGINT, was_referred BOOLEAN, referrer_name TEXT)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH referral_info AS (
    -- Verifica se o usuário atual foi indicado
    SELECT
      EXISTS(SELECT 1 FROM referrals WHERE referred_user_id = p_user_id) as referred,
      (SELECT p.name FROM profiles p JOIN referrals r ON p.id = r.referrer_user_id WHERE r.referred_user_id = p_user_id LIMIT 1) as ref_name
  ),
  credits_info AS (
    -- Calcula os créditos disponíveis por indicações feitas pelo usuário
    SELECT
      COUNT(*) AS credits
    FROM referral_credits
    WHERE user_id = p_user_id AND is_used = FALSE
  )
  SELECT
    ci.credits AS available_credits,
    ri.referred AS was_referred,
    ri.ref_name AS referrer_name
  FROM credits_info ci, referral_info ri;
END;
$$;
