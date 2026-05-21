-- 1. Removemos a politica de Admin da tabela profiles para EVITAR QUALQUER RISCO de loop infinito.
-- O painel de admin ja usa a RPC 'get_all_users_admin' para listar os usuarios, entao essa politica nao e necessaria.
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

-- 2. Garantimos que a politica basica do usuario ver seu proprio perfil exista.
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
    ON public.profiles FOR SELECT
    USING ( id = auth.uid() );

-- 3. Recriamos a view de transacoes financeiras da forma mais robusta e a prova de falhas possivel.
-- Retiramos o "security_invoker = true" para que a view nao dependa das politicas das tabelas subjacentes (evitando bloqueios silenciosos).
-- Em vez disso, aplicamos a regra de seguranca diretamente no WHERE da view!
DROP VIEW IF EXISTS public.v_financial_transactions;

CREATE OR REPLACE VIEW public.v_financial_transactions AS
SELECT 
    ft.*,
    a.name AS account_name,
    a.type AS account_type,
    da.name AS destination_account_name,
    da.type AS destination_account_type,
    c.name AS client_name,
    cat.name AS category_name,
    cat.icon AS category_icon,
    cat.parent_id AS category_parent_id
FROM public.financial_transactions ft
LEFT JOIN public.financial_accounts a ON ft.account_id = a.id
LEFT JOIN public.financial_accounts da ON ft.destination_account_id = da.id
LEFT JOIN public.clients c ON ft.client_id = c.id
LEFT JOIN public.financial_categories cat ON ft.category_id = cat.id
WHERE ft.user_id = auth.uid() OR public.fn_is_admin();

COMMENT ON VIEW public.v_financial_transactions IS 'View de transacoes com filtro de seguranca direto na view (para suportar impersonate de forma robusta).';
