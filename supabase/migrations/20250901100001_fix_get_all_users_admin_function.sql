-- Migration: Corrige a função `get_all_users_admin` para resolver o erro "column s.plan_name does not exist"
--
-- Motivo:
-- A função anterior tinha um erro de sintaxe na cláusula CASE que estava causando falha na consulta.
-- Esta correção adiciona o END que estava faltando na cláusula CASE.

DROP FUNCTION IF EXISTS public.get_all_users_admin();

CREATE OR REPLACE FUNCTION public.get_all_users_admin()
RETURNS TABLE (
    id UUID,
    name TEXT,
    email TEXT,
    plan_name TEXT,
    subscription_status TEXT,
    subscription_end_date TIMESTAMPTZ,
    is_admin BOOLEAN,
    created_at TIMESTAMPTZ
)
AS $$
BEGIN
    -- Verifica se o chamador é um administrador
    IF NOT is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Apenas administradores podem acessar esta informação.';
    END IF;

    -- Retorna a tabela com os dados dos usuários e suas assinaturas mais recentes
    RETURN QUERY 
    WITH latest_subscription AS (
        SELECT 
            s.user_id,
            s.plan_name,
            s.status,
            s.end_date,
            -- Ordena as assinaturas para pegar a mais relevante primeiro
            -- Prioriza 'active' e 'trialing', e depois a mais recente
            ROW_NUMBER() OVER(
                PARTITION BY s.user_id 
                ORDER BY 
                    CASE s.status
                        WHEN 'active' THEN 1
                        WHEN 'trialing' THEN 2
                        ELSE 3
                    END,
                    s.end_date DESC
            ) as rn
        FROM public.subscriptions s
    )
    SELECT 
        u.id,
        p.name,
        u.email::TEXT,
        ls.plan_name,
        ls.status AS subscription_status,
        ls.end_date AS subscription_end_date,
        p.is_admin,
        u.created_at
    FROM auth.users u
    LEFT JOIN public.profiles p ON u.id = p.id
    LEFT JOIN latest_subscription ls ON u.id = ls.user_id AND ls.rn = 1
    ORDER BY u.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;