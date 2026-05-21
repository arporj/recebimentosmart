-- Fix para resolver o erro "infinite recursion detected in policy"
-- O erro ocorre porque a policy da tabela A consulta a tabela B, e a tabela B consulta a tabela A.
-- A solução é criar uma função SECURITY DEFINER que consulta a tabela profiles (bypassing RLS).

CREATE OR REPLACE FUNCTION public.fn_is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_admin boolean;
BEGIN
    SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
    RETURN COALESCE(v_is_admin, false);
END;
$$;

-- Atualizando todas as políticas de admin para usar a nova função:

DROP POLICY IF EXISTS "Admins can view all financial transactions" ON public.financial_transactions;
CREATE POLICY "Admins can view all financial transactions"
    ON public.financial_transactions FOR SELECT
    USING ( public.fn_is_admin() );

DROP POLICY IF EXISTS "Admins can view all financial accounts" ON public.financial_accounts;
CREATE POLICY "Admins can view all financial accounts"
    ON public.financial_accounts FOR SELECT
    USING ( public.fn_is_admin() );

DROP POLICY IF EXISTS "Admins can view all financial categories" ON public.financial_categories;
CREATE POLICY "Admins can view all financial categories"
    ON public.financial_categories FOR SELECT
    USING ( public.fn_is_admin() );

DROP POLICY IF EXISTS "Admins can view all financial tags" ON public.financial_tags;
CREATE POLICY "Admins can view all financial tags"
    ON public.financial_tags FOR SELECT
    USING ( public.fn_is_admin() );

DROP POLICY IF EXISTS "Admins can view all transaction tags" ON public.transaction_tags;
CREATE POLICY "Admins can view all transaction tags"
    ON public.transaction_tags FOR SELECT
    USING ( public.fn_is_admin() );

DROP POLICY IF EXISTS "Admins can view all clients" ON public.clients;
CREATE POLICY "Admins can view all clients"
    ON public.clients FOR SELECT
    USING ( public.fn_is_admin() );

DROP POLICY IF EXISTS "Admins can view all client shares" ON public.client_shares;
CREATE POLICY "Admins can view all client shares"
    ON public.client_shares FOR SELECT
    USING ( public.fn_is_admin() );

-- Opcionalmente adicionar em profiles também, para que admins possam buscar qualquer perfil
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
    ON public.profiles FOR SELECT
    USING ( public.fn_is_admin() );
