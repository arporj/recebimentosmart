-- Corrige o tipo de retorno da função get_all_plans_with_prices de text[] para jsonb
DROP FUNCTION IF EXISTS public.get_all_plans_with_prices();

CREATE OR REPLACE FUNCTION public.get_all_plans_with_prices()
 RETURNS TABLE(name text, price_monthly numeric, price_yearly numeric, features jsonb, slug text, limit_transactions integer, limit_clients integer, limit_tags integer, limit_accounts integer, description text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY 
    SELECT 
        p.name::text,
        p.price_monthly,
        p.price_yearly,
        p.features, -- Retorna como jsonb diretamente, combinando com o tipo físico do banco
        p.slug::text,
        p.limit_transactions,
        p.limit_clients,
        p.limit_tags,
        p.limit_accounts,
        p.description::text
    FROM public.plans p;
END;
$function$;
