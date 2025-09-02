-- Migration: Cria a função `admin_set_user_plan` para permitir que admins gerenciem planos de usuários.
--
-- Motivo:
-- Para atender à necessidade de negócio de permitir que um administrador promova um usuário
-- para um plano específico (ex: "Pró") diretamente pela interface de gerenciamento.

CREATE OR REPLACE FUNCTION public.admin_set_user_plan(user_id_to_update UUID, new_plan_name TEXT)
RETURNS VOID
AS $$
DECLARE
    _plan_exists BOOLEAN;
BEGIN
    -- 1. Verifica se o chamador é um administrador
    IF NOT is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Apenas administradores podem executar esta ação.';
    END IF;

    -- 2. Verifica se o plano para o qual se está mudando existe na tabela de planos
    SELECT EXISTS (SELECT 1 FROM public.plans WHERE name = new_plan_name) INTO _plan_exists;
    IF NOT _plan_exists THEN
        RAISE EXCEPTION 'Plano "%" não encontrado.', new_plan_name;
    END IF;

    -- 3. Cancela qualquer assinatura ativa ou em trial existente para o usuário
    UPDATE public.subscriptions
    SET status = 'canceled'
    WHERE user_id = user_id_to_update AND (status = 'active' OR status = 'trialing');

    -- 4. Insere a nova assinatura para o usuário
    INSERT INTO public.subscriptions (user_id, plan_name, status, start_date, end_date, is_trial)
    VALUES (
        user_id_to_update,
        new_plan_name,
        'active', -- Define o status como ativo
        now(), -- Data de início
        now() + interval '30 days', -- Data de término (30 dias a partir de agora)
        false -- Não é um trial
    );

    -- 5. (Opcional, mas recomendado) Atualiza a coluna `plan_name` em `profiles` para consistência
    UPDATE public.profiles
    SET plan_name = new_plan_name
    WHERE id = user_id_to_update;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
