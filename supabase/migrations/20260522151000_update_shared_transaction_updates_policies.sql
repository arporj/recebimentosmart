-- Migração: Atualização de Políticas de RLS em shared_transaction_updates
-- Permite que o remetente (sender_id) atualize o escopo da atualização (de single para all_future) enquanto estiver pendente,
-- e o receptor (receiver_id) atualize o status (aceitar/recusar).

DROP POLICY IF EXISTS "Permitir atualização de status pelo receptor" ON public.shared_transaction_updates;

CREATE POLICY "Permitir update pelo remetente ou receptor" ON public.shared_transaction_updates
    FOR UPDATE TO authenticated
    USING (auth.uid() = sender_id OR auth.uid() = receiver_id)
    WITH CHECK (auth.uid() = sender_id OR auth.uid() = receiver_id);
