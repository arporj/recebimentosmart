-- Migration: Cria a função RPC `update_plan_prices` para salvar os preços dos planos.
--
-- Motivo:
-- Abstrai a lógica de atualização dos preços em uma única função no backend,
-- tornando a operação mais segura e eficiente a partir do frontend.

CREATE OR REPLACE FUNCTION public.update_plan_prices(prices_data JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    -- Garante que apenas administradores possam executar esta função
    IF NOT is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Apenas administradores podem atualizar os preços dos planos.';
    END IF;

    -- Insere ou atualiza o preço do plano Básico
    INSERT INTO public.app_settings (key, value, description)
    VALUES ('price_basico', prices_data->>'basico', 'Preço do plano Básico em BRL.')
    ON CONFLICT (key) DO UPDATE SET value = excluded.value;

    -- Insere ou atualiza o preço do plano Pró
    INSERT INTO public.app_settings (key, value, description)
    VALUES ('price_pro', prices_data->>'pro', 'Preço do plano Pró em BRL.')
    ON CONFLICT (key) DO UPDATE SET value = excluded.value;

    -- Insere ou atualiza o preço do plano Premium
    INSERT INTO public.app_settings (key, value, description)
    VALUES ('price_premium', prices_data->>'premium', 'Preço do plano Premium em BRL.')
    ON CONFLICT (key) DO UPDATE SET value = excluded.value;

END;
$$;
