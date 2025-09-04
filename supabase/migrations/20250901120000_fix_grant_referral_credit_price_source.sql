-- Migration: Corrige a fonte do preço na função `grant_referral_credit`.
--
-- Motivo:
-- A função estava buscando o preço do plano da tabela `app_settings`, que está sendo descontinuada
-- para este propósito. Esta alteração corrige a função para buscar o preço diretamente da
-- tabela `plans`, garantindo consistência com o resto do sistema.

DROP FUNCTION IF EXISTS public.grant_referral_credit(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.grant_referral_credit(referred_user_id UUID, paid_plan_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    referrer_profile RECORD;
    plan_price NUMERIC;
    credit_percentage NUMERIC;
    credit_amount NUMERIC;
    _referrer_id UUID;
BEGIN
    -- 1. Encontra quem indicou o usuário (o referente)
    -- Assumindo que a tabela `profiles` tem uma coluna `used_referral_code`
    -- e que essa coluna armazena o CÓDIGO do referente.
    SELECT p_inner.id INTO _referrer_id
    FROM profiles p_outer
    JOIN profiles p_inner ON p_outer.used_referral_code = p_inner.referral_code
    WHERE p_outer.id = referred_user_id;

    -- Se não encontrou quem indicou, encerra a função
    IF _referrer_id IS NULL THEN
        RAISE LOG 'Nenhum referente encontrado para o usuário %', referred_user_id;
        RETURN;
    END IF;

    -- 2. Determina o percentual de crédito baseado no plano pago
    CASE lower(paid_plan_name)
        WHEN 'básico' THEN credit_percentage := 0.10; -- 10%
        WHEN 'pro' THEN credit_percentage := 0.15; -- 15%
        WHEN 'premium' THEN credit_percentage := 0.20; -- 20%
        ELSE credit_percentage := 0; -- Nenhum crédito para outros planos
    END CASE;

    -- Se não há crédito a dar, encerra
    IF credit_percentage = 0 THEN
        RAISE LOG 'Nenhum crédito a ser concedido para o plano %', paid_plan_name;
        RETURN;
    END IF;

    -- 3. Busca o preço do plano correspondente na tabela `plans`
    SELECT p.price_monthly INTO plan_price
    FROM public.plans p
    WHERE lower(p.name) = lower(paid_plan_name);

    -- Se não encontrou o preço, registra um log e encerra
    IF plan_price IS NULL OR plan_price <= 0 THEN
        RAISE WARNING 'Preço para o plano "%" não encontrado ou inválido na tabela `plans`.', paid_plan_name;
        RETURN;
    END IF;

    -- 4. Calcula o valor do crédito
    credit_amount := plan_price * credit_percentage;

    -- 5. Adiciona o crédito ao perfil de quem indicou
    UPDATE public.profiles
    SET referral_credits = referral_credits + credit_amount
    WHERE id = _referrer_id;

    RAISE LOG 'Crédito de R$ % concedido ao usuário % pela indicação do usuário %', credit_amount, _referrer_id, referred_user_id;

END;
$$;

-- Concede permissão de execução para o service_role, que é usado por Edge Functions
GRANT EXECUTE ON FUNCTION public.grant_referral_credit(UUID, TEXT) TO service_role;
