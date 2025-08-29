-- Migration: Cria a função RPC `get_subscription_page_data`
--
-- Motivo:
-- Fornece um único endpoint para a página de assinatura buscar todos os dados necessários:
-- 1. Preços de todos os planos.
-- 2. Dados da assinatura atual do usuário (plano, validade, créditos).
-- Isso simplifica a lógica do frontend e melhora a performance.

CREATE OR REPLACE FUNCTION public.get_subscription_page_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    result JSONB;
    price_basico_val TEXT;
    price_pro_val TEXT;
    price_premium_val TEXT;
    user_credits NUMERIC;
    user_plan TEXT;
    user_valid_until TIMESTAMPTZ;
BEGIN
    -- Garante que o usuário esteja autenticado
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Usuário não autenticado.';
    END IF;

    -- Coleta os preços dos planos
    SELECT value INTO price_basico_val FROM app_settings WHERE key = 'price_basico';
    SELECT value INTO price_pro_val FROM app_settings WHERE key = 'price_pro';
    SELECT value INTO price_premium_val FROM app_settings WHERE key = 'price_premium';

    -- Coleta os dados do perfil do usuário
    SELECT referral_credits, plano, valid_until
    INTO user_credits, user_plan, user_valid_until
    FROM profiles
    WHERE id = auth.uid();

    -- Monta o objeto JSON de retorno
    result := jsonb_build_object(
        'prices', jsonb_build_object(
            'basico', COALESCE(price_basico_val, '0')::NUMERIC,
            'pro', COALESCE(price_pro_val, '0')::NUMERIC,
            'premium', COALESCE(price_premium_val, '0')::NUMERIC
        ),
        'user', jsonb_build_object(
            'credits', COALESCE(user_credits, 0),
            'plan', user_plan,
            'valid_until', user_valid_until
        )
    );

    RETURN result;
END;
$$;
