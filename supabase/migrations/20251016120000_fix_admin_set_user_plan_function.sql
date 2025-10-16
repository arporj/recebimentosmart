-- Migration: Corrige a lógica da função `admin_set_user_plan`.
--
-- Motivo:
-- A versão anterior da função tentava manipular a tabela `subscriptions`, que é apenas um log de transações,
-- e usava colunas que não existem, como `status`. A lógica correta é atualizar a tabela `profiles`,
-- que contém o plano ativo (`plano`) e a data de validade da assinatura (`valid_until`).

CREATE OR REPLACE FUNCTION public.admin_set_user_plan(user_id_to_update UUID, new_plan_name TEXT)
RETURNS VOID
AS $$
BEGIN
    -- 1. Verifica se o chamador é um administrador
    IF NOT is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Apenas administradores podem executar esta ação.';
    END IF;

    -- 2. Atualiza o perfil do usuário com o novo plano e data de validade
    -- A data de validade é definida para 30 dias a partir de agora.
    UPDATE public.profiles
    SET
        plano = new_plan_name,
        valid_until = now() + interval '30 days'
    WHERE id = user_id_to_update;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comentário:
-- Esta função agora está alinhada com a lógica da `get_all_users_admin`, que deriva o status da assinatura
-- a partir da coluna `valid_until` na tabela `profiles`.
