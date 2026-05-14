-- Migration: Extensões Administrativas para Limites e Transações
-- Data: 14/05/2026

-- 1. Redefinir get_all_users_admin para incluir total_transactions e fixar status 'free'
CREATE OR REPLACE FUNCTION public.get_all_users_admin()
RETURNS TABLE (
    id UUID,
    name TEXT,
    email TEXT,
    plan_name TEXT,
    subscription_status TEXT,
    subscription_end_date TIMESTAMPTZ,
    is_admin BOOLEAN,
    created_at TIMESTAMPTZ,
    last_sign_in_at TIMESTAMPTZ,
    total_transactions INTEGER
)
AS $$
BEGIN
    -- Verifica se o chamador é um administrador
    IF NOT is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Apenas administradores podem acessar esta informação.';
    END IF;

    RETURN QUERY
    SELECT
        u.id,
        p.name,
        u.email::TEXT,
        p.plano::TEXT AS plan_name,
        CASE
            WHEN p.plano::TEXT = 'free' THEN 'active' -- Usuários free sempre aparecem ativos no painel
            WHEN p.valid_until IS NULL THEN 'inactive'
            WHEN p.valid_until > now() THEN 'active'
            ELSE 'expired'
        END AS subscription_status,
        p.valid_until AS subscription_end_date,
        p.is_admin,
        u.created_at,
        u.last_sign_in_at,
        (SELECT count(*)::INTEGER FROM public.financial_transactions ft WHERE ft.user_id = u.id) AS total_transactions
    FROM auth.users u
    LEFT JOIN public.profiles p ON u.id = p.id
    ORDER BY u.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Redefinir get_all_plans_with_prices para retornar slug e limit_transactions
CREATE OR REPLACE FUNCTION public.get_all_plans_with_prices()
RETURNS TABLE (
    name TEXT,
    price_monthly NUMERIC,
    price_yearly NUMERIC,
    features JSONB,
    slug TEXT,
    limit_transactions INTEGER
)
AS $$
BEGIN
    RETURN QUERY 
    SELECT 
        p.name,
        p.price_monthly,
        p.price_yearly,
        p.features,
        p.slug,
        p.limit_transactions
    FROM public.plans p
    ORDER BY p.price_monthly;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION public.get_all_plans_with_prices() TO anon;
GRANT EXECUTE ON FUNCTION public.get_all_plans_with_prices() TO authenticated;

-- 3. Criar nova RPC update_plan_settings unificada para preços e limites
CREATE OR REPLACE FUNCTION public.update_plan_settings(prices_data JSONB, limits_data JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    -- Garante que apenas administradores possam executar
    IF NOT is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Apenas administradores podem atualizar as configurações dos planos.';
    END IF;

    -- 1. Atualizar preços (para basico, pro, premium)
    -- Converte centavos vindos do frontend para valor numérico (ex: 1990 -> 19.90)
    IF prices_data ? 'basico' THEN
        UPDATE public.plans
        SET price_monthly = (prices_data->>'basico')::INT / 100.0
        WHERE slug = 'basico';
    END IF;

    IF prices_data ? 'pro' THEN
        UPDATE public.plans
        SET price_monthly = (prices_data->>'pro')::INT / 100.0
        WHERE slug = 'pro';
    END IF;

    IF prices_data ? 'premium' THEN
        UPDATE public.plans
        SET price_monthly = (prices_data->>'premium')::INT / 100.0
        WHERE slug = 'premium';
    END IF;

    -- 2. Atualizar limites de transação (para os 4 planos: free, basico, pro, premium)
    IF limits_data ? 'free' THEN
        UPDATE public.plans
        SET limit_transactions = (limits_data->>'free')::INT
        WHERE slug = 'free';
    END IF;

    IF limits_data ? 'basico' THEN
        UPDATE public.plans
        SET limit_transactions = (limits_data->>'basico')::INT
        WHERE slug = 'basico';
    END IF;

    IF limits_data ? 'pro' THEN
        UPDATE public.plans
        SET limit_transactions = (limits_data->>'pro')::INT
        WHERE slug = 'pro';
    END IF;

    IF limits_data ? 'premium' THEN
        UPDATE public.plans
        SET limit_transactions = (limits_data->>'premium')::INT
        WHERE slug = 'premium';
    END IF;

END;
$$;

GRANT EXECUTE ON FUNCTION public.update_plan_settings(JSONB, JSONB) TO authenticated;
