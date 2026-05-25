-- Redefine a politica na tabela clients para permitir que recebedores leiam clientes compartilhados em status 'pending' ou 'accepted'
DROP POLICY IF EXISTS "Users can view shared clients" ON public.clients;
CREATE POLICY "Users can view shared clients" ON public.clients
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.client_shares
            WHERE client_shares.client_id = public.clients.id
            AND LOWER(client_shares.receiver_email) = LOWER(auth.jwt()->>'email')
            AND client_shares.status IN ('pending', 'accepted')
        )
    );

-- Redefine a politica na tabela financial_transactions para permitir que recebedores leiam transacoes compartilhadas em status 'pending' ou 'accepted'
DROP POLICY IF EXISTS "Users can view shared transactions" ON public.financial_transactions;
CREATE POLICY "Users can view shared transactions" ON public.financial_transactions
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.client_shares
            WHERE client_shares.client_id = financial_transactions.client_id
            AND LOWER(client_shares.receiver_email) = LOWER(auth.jwt()->>'email')
            AND client_shares.status IN ('pending', 'accepted')
        )
    );

-- Redefine a politica na tabela client_shares para permitir delecao pelo remetente (cancelar compartilhamento)
DROP POLICY IF EXISTS "Permitir delecao pelo remetente" ON public.client_shares;
CREATE POLICY "Permitir delecao pelo remetente" ON public.client_shares
    FOR DELETE TO authenticated
    USING (auth.uid() = sender_id);
