-- Refine clients policy to allow receivers to see the client in BOTH pending and accepted states
-- (so they can view the invitation name in their SharedWithMe screen)
DROP POLICY IF EXISTS "Users can view shared clients" ON public.clients;
CREATE POLICY "Users can view shared clients" ON public.clients
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.client_shares
            WHERE client_shares.client_id = id
            AND LOWER(client_shares.receiver_email) = LOWER(auth.jwt()->>'email')
            AND client_shares.status IN ('pending', 'accepted')
        )
    );

-- Refine financial transactions policy to STRICTLY allow viewing history ONLY for accepted shares
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
