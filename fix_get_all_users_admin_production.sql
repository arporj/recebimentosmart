-- Script para corrigir a função get_all_users_admin no ambiente de produção
-- Execute este script no console SQL do Supabase para resolver o erro "column s.plan_name does not exist"

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
            p.plano::TEXT as plan_name, -- Usa o plano do perfil já que a coluna não existe em subscriptions
            CASE 
                WHEN p.valid_until > NOW() THEN 'active'::TEXT
                ELSE 'expired'::TEXT
            END as status,
            p.valid_until as end_date,
            -- Ordena as assinaturas para pegar a mais relevante primeiro
            ROW_NUMBER() OVER(
                PARTITION BY s.user_id 
                ORDER BY s.subscription_date DESC
            ) as rn
        FROM public.subscriptions s
        JOIN public.profiles p ON s.user_id = p.id
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