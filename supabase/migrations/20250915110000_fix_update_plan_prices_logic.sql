-- Migration: Corrige a função `update_plan_prices` para atualizar a tabela `plans`.
--
-- Motivo:
-- A versão anterior da função estava salvando os preços na tabela `app_settings`
-- enquanto o resto da aplicação lia da tabela `plans`. Esta migração corrige
-- a função para que ela atualize a tabela correta, resolvendo a inconsistência de dados.

CREATE OR REPLACE FUNCTION public.update_plan_prices(prices_data JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    basico_price_cents INT;
    pro_price_cents INT;
    premium_price_cents INT;
BEGIN
    -- Garante que apenas administradores possam executar esta função
    IF NOT is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Apenas administradores podem atualizar os preços dos planos.';
    END IF;

    -- Extrai os preços em centavos do JSON
    basico_price_cents := (prices_data->>'basico')::INT;
    pro_price_cents := (prices_data->>'pro')::INT;
    premium_price_cents := (prices_data->>'premium')::INT;

    -- Atualiza o preço do plano Básico, convertendo centavos para NUMERIC
    UPDATE public.plans
    SET price_monthly = basico_price_cents / 100.0
    WHERE name = 'Básico';

    -- Atualiza o preço do plano Pró, convertendo centavos para NUMERIC
    UPDATE public.plans
    SET price_monthly = pro_price_cents / 100.0
    WHERE name = 'Pró';

    -- Atualiza o preço do plano Premium, convertendo centavos para NUMERIC
    UPDATE public.plans
    SET price_monthly = premium_price_cents / 100.0
    WHERE name = 'Premium';

END;
$$;
