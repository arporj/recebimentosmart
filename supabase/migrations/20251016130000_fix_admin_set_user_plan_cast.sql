-- Migration: Corrige a lógica da função `admin_set_user_plan` com o cast para plan_type.
--
-- Motivo:
-- A versão anterior da função falhou porque tentava atribuir um valor do tipo TEXT à coluna `plano`,
-- que é do tipo ENUM `plan_type`. Esta migração corrige a função adicionando um cast explícito
-- do valor de entrada para `public.plan_type`.

CREATE OR REPLACE FUNCTION public.admin_set_user_plan(user_id_to_update UUID, new_plan_name TEXT)
RETURNS VOID
AS $$
BEGIN
    -- 1. Verifica se o chamador é um administrador
    IF NOT is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Apenas administradores podem executar esta ação.';
    END IF;

    -- 2. Atualiza o perfil do usuário com o novo plano e data de validade
    -- Adiciona o cast para o tipo correto da coluna `plano`.
    UPDATE public.profiles
    SET
        plano = new_plan_name::public.plan_type,
        valid_until = now() + interval '30 days'
    WHERE id = user_id_to_update;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comentário:
-- Esta função agora deve ser compatível com o esquema da tabela `profiles`, incluindo o tipo customizado da coluna `plano`.
