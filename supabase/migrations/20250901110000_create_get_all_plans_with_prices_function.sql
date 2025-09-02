-- Migration: Cria a função `get_all_plans_with_prices` para acesso público aos preços.
--
-- Motivo:
-- Centralizar a forma como os preços dos planos são buscados, tanto para a página
-- de configurações do admin quanto para a landing page pública. Isso garante que
-- os dados sejam consistentes em todo o sistema.

CREATE OR REPLACE FUNCTION public.get_all_plans_with_prices()
RETURNS TABLE (
    name TEXT,
    price_monthly NUMERIC,
    price_yearly NUMERIC,
    features JSONB
)
AS $$
BEGIN
    -- Esta função é pública e busca os dados da tabela de planos.
    -- A segurança é garantida pela política de RLS na tabela `plans`,
    -- que deve permitir a leitura para usuários não autenticados (anon).
    RETURN QUERY 
    SELECT 
        p.name,
        p.price_monthly,
        p.price_yearly,
        p.features
    FROM public.plans p
    ORDER BY p.price_monthly;
END;
$$ LANGUAGE plpgsql STABLE;

-- Garante que a role `anon` (usuários não autenticados) possa executar esta função.
-- A política na tabela `plans` já deve permitir a leitura, mas isso é uma segurança adicional.
GRANT EXECUTE ON FUNCTION public.get_all_plans_with_prices() TO anon;
