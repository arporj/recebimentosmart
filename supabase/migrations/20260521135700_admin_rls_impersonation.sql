-- Migração: Permitir que admins visualizem dados de qualquer usuário (impersonação)
-- Problema: RLS usa auth.uid() = user_id, mas ao impersonar, auth.uid() continua sendo o admin.
-- Solução: Adicionar policy SELECT para admins em todas as tabelas financeiras relevantes.

-- 1. financial_transactions
CREATE POLICY "Admins can view all financial transactions"
    ON public.financial_transactions FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );

-- 2. financial_accounts
CREATE POLICY "Admins can view all financial accounts"
    ON public.financial_accounts FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );

-- 3. financial_categories
CREATE POLICY "Admins can view all financial categories"
    ON public.financial_categories FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );

-- 4. financial_tags
CREATE POLICY "Admins can view all financial tags"
    ON public.financial_tags FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );

-- 5. financial_transaction_tags
CREATE POLICY "Admins can view all transaction tags"
    ON public.financial_transaction_tags FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );

-- 6. clients
CREATE POLICY "Admins can view all clients"
    ON public.clients FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );
