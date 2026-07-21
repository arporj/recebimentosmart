-- Correção crítica: as tabelas legadas (V1) `clients` e `payments` nunca tiveram
-- Row Level Security habilitado. Isso permitia que qualquer usuário autenticado
-- lesse (e escrevesse) os clientes e o histórico de pagamentos de QUALQUER outro
-- usuário via PostgREST, bastando omitir o filtro `user_id` na query.
--
-- Políticas de SELECT específicas para "clientes compartilhados" e "admin vê tudo"
-- já existiam (ver 20260515123856, 20260521135700), mas eram inertes porque RLS
-- nunca foi ligado na tabela. Ao habilitar RLS aqui, essas policies passam a
-- funcionar como já era o esperado, e adicionamos a policy básica de dono da linha
-- que nunca existiu.

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own clients" ON public.clients;
CREATE POLICY "Users can manage their own clients"
    ON public.clients FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own payments" ON public.payments;
CREATE POLICY "Users can manage their own payments"
    ON public.payments FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
