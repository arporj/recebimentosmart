-- Migration: Cria a função RPC `grant_referral_credit`
--
-- Motivo:
-- Encapsula a lógica de negócio para recompensar um usuário que indicou outro.
-- Esta função é chamada após um pagamento bem-sucedido do usuário indicado.

CREATE OR REPLACE FUNCTION public.grant_referral_credit(referred_user_id UUID, paid_plan TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    referrer_profile RECORD;
    plan_price NUMERIC;
    credit_percentage NUMERIC;
    credit_amount NUMERIC;
BEGIN
    -- 1. Verifica se o usuário indicado realmente foi referido por alguém
    SELECT p.* INTO referrer_profile
    FROM profiles p
    JOIN referrals r ON p.id = r.referrer_id
    WHERE r.referred_id = referred_user_id;

    -- Se não encontrou quem indicou, encerra a função
    IF referrer_profile IS NULL THEN
        RETURN;
    END IF;

    -- 2. Determina o percentual de crédito baseado no plano pago
    CASE lower(paid_plan)
        WHEN 'basico' THEN credit_percentage := 0.10; -- 10%
        WHEN 'pro' THEN credit_percentage := 0.15; -- 15%
        WHEN 'premium' THEN credit_percentage := 0.20; -- 20%
        ELSE credit_percentage := 0; -- Nenhum crédito para outros planos (ex: Trial)
    END CASE;

    -- Se não há crédito a dar, encerra
    IF credit_percentage = 0 THEN
        RETURN;
    END IF;

    -- 3. Busca o preço do plano correspondente em app_settings
    SELECT value::NUMERIC INTO plan_price
    FROM app_settings
    WHERE key = 'price_' || lower(paid_plan);

    -- Se não encontrou o preço, não faz nada para evitar erros
    IF plan_price IS NULL OR plan_price <= 0 THEN
        RETURN;
    END IF;

    -- 4. Calcula o valor do crédito
    credit_amount := plan_price * credit_percentage;

    -- 5. Adiciona o crédito ao perfil de quem indicou
    UPDATE profiles
    SET referral_credits = referral_credits + credit_amount
    WHERE id = referrer_profile.id;

END;
$$;
