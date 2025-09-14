-- Migration: Corrige a função `get_subscription_page_data` para ler da tabela `plans`.
--
-- Motivo:
-- A versão anterior lia os preços da tabela `app_settings`, que está obsoleta.
-- Esta correção alinha a função com o resto do sistema, que utiliza a tabela `plans`
-- como a única fonte de verdade para os preços, garantindo consistência dos dados.

CREATE OR REPLACE FUNCTION public.get_subscription_page_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    result JSONB;
    user_credits NUMERIC;
    user_plan TEXT;
    user_valid_until TIMESTAMPTZ;
    all_plans JSONB;
BEGIN
    -- Garante que o usuário esteja autenticado
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Usuário não autenticado.';
    END IF;

    -- Coleta os dados de todos os planos da tabela `plans`
    SELECT jsonb_agg(jsonb_build_object('name', p.name, 'price_monthly', p.price_monthly))
    INTO all_plans
    FROM public.plans p;

    -- Coleta os dados do perfil do usuário
    SELECT referral_credits, plan, valid_until
    INTO user_credits, user_plan, user_valid_until
    FROM public.profiles
    WHERE id = auth.uid();

    -- Monta o objeto JSON de retorno
    result := jsonb_build_object(
        'plans', all_plans,
        'user', jsonb_build_object(
            'credits', COALESCE(user_credits, 0),
            'plan', user_plan,
            'valid_until', user_valid_until
        )
    );

    RETURN result;
END;
$$;
