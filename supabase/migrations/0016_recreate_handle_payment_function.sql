-- supabase/migrations/0016_recreate_handle_payment_function.sql

-- 1. Função para lidar com a lógica de pagamento de um usuário
CREATE OR REPLACE FUNCTION public.handle_user_payment(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
    current_valid_until TIMESTAMPTZ;
BEGIN
    -- Pega a data de validade atual do usuário
    SELECT valid_until INTO current_valid_until
    FROM public.profiles
    WHERE id = p_user_id;

    -- Se a assinatura já expirou, renova por 1 mês a partir de AGORA
    -- Se ainda está válida, estende por 1 mês a partir da data de validade atual
    IF current_valid_until IS NULL OR current_valid_until < NOW() THEN
        UPDATE public.profiles
        SET valid_until = NOW() + INTERVAL '1 month'
        WHERE id = p_user_id;
    ELSE
        UPDATE public.profiles
        SET valid_until = current_valid_until + INTERVAL '1 month'
        WHERE id = p_user_id;
    END IF;

    -- A lógica de indicação é tratada por um trigger na tabela 'subscriptions'.

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Ajuste no trigger para garantir que ele continue funcionando
-- A lógica em `handle_new_subscription_payment` agora é chamada após a inserção na tabela `subscriptions`.
-- Não são necessárias mais alterações aqui.
