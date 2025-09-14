-- Migration: Cria a função `update_user_subscription` para atualizar o plano do usuário.
--
-- Motivo:
-- Encapsula a lógica de atualização do perfil de um usuário após um pagamento bem-sucedido,
-- permitindo que o webhook altere o plano e a data de validade de forma segura.

CREATE OR REPLACE FUNCTION public.update_user_subscription(p_user_id UUID, p_plan_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    UPDATE public.profiles
    SET
        plan = p_plan_name,
        valid_until = now() + interval '31 days' -- Adiciona 31 dias para cobrir todos os meses
    WHERE id = p_user_id;
END;
$$;
