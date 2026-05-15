-- Correção de sombreamento de coluna na política RLS de visualização de clientes compartilhados
-- Onde 'id' estava resolvendo para 'client_shares.id' em vez do 'clients.id' da tabela externa.

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
