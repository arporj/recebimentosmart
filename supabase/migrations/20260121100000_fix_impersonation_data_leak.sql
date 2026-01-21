-- Migration: Altera a função `get_subscription_page_data` para aceitar um `p_user_id` opcional.
--
-- Motivo:
-- Permite que administradores, ao personificar outros usuários, possam visualizar
-- a página de assinatura como se fossem o usuário personificado.
-- Se `p_user_id` for nulo, a função usa o `auth.uid()` do usuário autenticado.

CREATE OR REPLACE FUNCTION public.get_subscription_page_data(p_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    result JSONB;
    target_user_id UUID := COALESCE(p_user_id, auth.uid());
    user_plan_details RECORD;
    referral_details RECORD;
    all_plans JSONB;
BEGIN
    -- Garante que o usuário esteja autenticado ou um ID seja fornecido
    IF target_user_id IS NULL THEN
        RAISE EXCEPTION 'ID do usuário não fornecido ou usuário não autenticado.';
    END IF;

    -- Coleta os dados de todos os planos da tabela `plans`
    SELECT jsonb_agg(jsonb_build_object(
        'name', p.name,
        'price_monthly', p.price_monthly,
        'description', p.description,
        'features', p.features
    ))
    INTO all_plans
    FROM public.plans p;

    -- Coleta os dados do perfil do usuário (plano e validade)
    SELECT p.plano, p.valid_until
    INTO user_plan_details
    FROM public.profiles p
    WHERE p.id = target_user_id;

    -- Coleta dados de indicação (lógica de get_full_referral_stats)
    SELECT
        EXISTS(SELECT 1 FROM public.referrals WHERE referred_id = target_user_id) as was_referred,
        (SELECT pr.name FROM public.profiles pr JOIN public.referrals r ON pr.id = r.referrer_id WHERE r.referred_id = target_user_id LIMIT 1) as referrer_name,
        (SELECT COUNT(*) FROM public.referral_credits WHERE referrer_user_id = target_user_id AND status = 'credited') AS available_credits
    INTO referral_details;

    -- Monta o objeto JSON de retorno
    result := jsonb_build_object(
        'plans', all_plans,
        'user', jsonb_build_object(
            'plan', user_plan_details.plano,
            'valid_until', user_plan_details.valid_until,
            'credits', COALESCE(referral_details.available_credits, 0),
            'was_referred', COALESCE(referral_details.was_referred, false),
            'referrer_name', referral_details.referrer_name
        )
    );

    RETURN result;
END;
$$;
