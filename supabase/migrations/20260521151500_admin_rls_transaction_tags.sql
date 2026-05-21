-- Adiciona política de admin para a tabela associativa transaction_tags
DROP POLICY IF EXISTS "Admins can view all transaction tags" ON public.transaction_tags;
CREATE POLICY "Admins can view all transaction tags"
    ON public.transaction_tags FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );

-- Garantir que client_shares também pode ser vista pelo admin
DROP POLICY IF EXISTS "Admins can view all client shares" ON public.client_shares;
CREATE POLICY "Admins can view all client shares"
    ON public.client_shares FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );
