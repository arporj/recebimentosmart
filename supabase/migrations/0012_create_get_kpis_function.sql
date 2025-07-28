-- supabase/migrations/0012_create_get_kpis_function.sql

-- Esta função busca os principais indicadores de desempenho (KPIs) para o dashboard administrativo.
-- Ela só pode ser executada por um administrador.
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_kpis()
RETURNS JSON AS $$
DECLARE
    kpi_data JSON;
BEGIN
    -- Verifica se o chamador é um administrador
    IF NOT is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Apenas administradores podem acessar esta informação.';
    END IF;

    -- Calcula todos os KPIs em uma única consulta
    SELECT json_build_object(
        'monthlyRevenue', COALESCE((SELECT SUM(amount) FROM public.payments WHERE payment_date >= date_trunc('month', NOW())), 0),
        'activeUsers', (SELECT COUNT(*) FROM public.profiles WHERE valid_until > NOW()),
        'newUsers', (SELECT COUNT(*) FROM auth.users WHERE created_at >= NOW() - INTERVAL '30 days'),
        'convertedTrials', (SELECT COUNT(DISTINCT user_id) FROM public.payments)
    ) INTO kpi_data;

    RETURN kpi_data;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
