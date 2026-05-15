-- Refine clients policy to allow receivers to see the client only after accepted
DROP POLICY IF EXISTS "Users can view shared clients" ON public.clients;
CREATE POLICY "Users can view shared clients" ON public.clients
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.client_shares
            WHERE client_shares.client_id = id
            AND LOWER(client_shares.receiver_email) = LOWER(auth.jwt()->>'email')
            AND client_shares.status = 'accepted'
        )
    );

-- Refine financial transactions policy to allow viewing history only for accepted shares
DROP POLICY IF EXISTS "Users can view shared transactions" ON public.financial_transactions;
CREATE POLICY "Users can view shared transactions" ON public.financial_transactions
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.client_shares
            WHERE client_shares.client_id = financial_transactions.client_id
            AND LOWER(client_shares.receiver_email) = LOWER(auth.jwt()->>'email')
            AND client_shares.status = 'accepted'
        )
    );
