-- Create client_shares table for sharing clients and their financial summaries with other users
CREATE TABLE IF NOT EXISTS public.client_shares (
    id uuid DEFAULT extensions.gen_random_uuid() PRIMARY KEY,
    sender_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
    receiver_email text NOT NULL,
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE (sender_id, client_id, receiver_email)
);

-- Enable RLS on client_shares
ALTER TABLE public.client_shares ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to avoid conflicts during deployment
DROP POLICY IF EXISTS "Permitir insercao de compartilhamentos" ON public.client_shares;
DROP POLICY IF EXISTS "Permitir visualizacao de compartilhamentos enviados" ON public.client_shares;
DROP POLICY IF EXISTS "Permitir visualizacao de compartilhamentos recebidos" ON public.client_shares;
DROP POLICY IF EXISTS "Permitir atualizacao de status pelo receptor" ON public.client_shares;

-- Policies for client_shares
CREATE POLICY "Permitir insercao de compartilhamentos" ON public.client_shares
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Permitir visualizacao de compartilhamentos enviados" ON public.client_shares
    FOR SELECT TO authenticated
    USING (auth.uid() = sender_id);

CREATE POLICY "Permitir visualizacao de compartilhamentos recebidos" ON public.client_shares
    FOR SELECT TO authenticated
    USING (LOWER(receiver_email) = LOWER(auth.jwt()->>'email'));

CREATE POLICY "Permitir atualizacao de status pelo receptor" ON public.client_shares
    FOR UPDATE TO authenticated
    USING (LOWER(receiver_email) = LOWER(auth.jwt()->>'email'))
    WITH CHECK (LOWER(receiver_email) = LOWER(auth.jwt()->>'email'));

-- Extend Clients read policies to allow receivers to view the shared clients
DROP POLICY IF EXISTS "Users can view shared clients" ON public.clients;
CREATE POLICY "Users can view shared clients" ON public.clients
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.client_shares
            WHERE client_shares.client_id = id
            AND LOWER(client_shares.receiver_email) = LOWER(auth.jwt()->>'email')
            AND client_shares.status = 'pending'
        )
    );

-- Extend Financial Transactions read policies to allow receivers to view transaction history
DROP POLICY IF EXISTS "Users can view shared transactions" ON public.financial_transactions;
CREATE POLICY "Users can view shared transactions" ON public.financial_transactions
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.client_shares
            WHERE client_shares.client_id = financial_transactions.client_id
            AND LOWER(client_shares.receiver_email) = LOWER(auth.jwt()->>'email')
            AND client_shares.status = 'pending'
        )
    );
