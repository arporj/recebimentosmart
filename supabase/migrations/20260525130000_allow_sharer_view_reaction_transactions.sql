-- Migration: Permitir que o compartilhador (remetente) leia os clones das transações que ele compartilhou
-- Isso possibilita acompanhar em tempo real o status de aceitação física pelo receptor.

DROP POLICY IF EXISTS "Allow sharer to view clone transaction status" ON public.financial_transactions;
CREATE POLICY "Allow sharer to view clone transaction status" 
ON public.financial_transactions
FOR SELECT TO authenticated
USING (
    shared_by_user_id = auth.uid()
);
