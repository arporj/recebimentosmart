-- Migração: Sincronização robusta de exclusões físicas em transações compartilhadas
-- Cria trigger BEFORE DELETE para converter exclusão física de transações compartilhadas em exclusão lógica (status = 'cancelled'),
-- permitindo que a trigger AFTER UPDATE crie a proposta de exclusão bilateral e evitando deleções silenciosas via cascade.

CREATE OR REPLACE FUNCTION public.fn_prevent_physical_delete_on_shared()
RETURNS TRIGGER AS $$
DECLARE
    v_has_clones BOOLEAN;
    v_is_shared BOOLEAN;
BEGIN
    -- Se a transação já estiver com status 'cancelled', permitimos a deleção física real (por exemplo, quando a RPC de resolução é aceita)
    IF OLD.status = 'cancelled' THEN
        RETURN OLD;
    END IF;

    -- Verificar se ela é um clone (possui transação original associada)
    IF OLD.shared_original_transaction_id IS NOT NULL THEN
        v_is_shared := TRUE;
    ELSE
        -- Verificar se ela possui clones no banco (ela é a original)
        SELECT EXISTS (
            SELECT 1 FROM public.financial_transactions 
            WHERE shared_original_transaction_id = OLD.id
        ) INTO v_has_clones;
        
        -- Se ela tiver clones ou o client_id dela pertencer a um cliente compartilhado ativamente
        SELECT EXISTS (
            SELECT 1 FROM public.client_shares
            WHERE client_id = OLD.client_id AND status = 'accepted'
        ) INTO v_is_shared;

        v_is_shared := v_is_shared OR v_has_clones;
    END IF;

    -- Se for transação compartilhada e estiver ativa (status não é cancelled)
    IF v_is_shared THEN
        -- Em vez de deletar fisicamente, fazemos um UPDATE para 'cancelled' e 'modified'
        -- Isso disparará a trigger AFTER UPDATE (fn_handle_shared_transaction) que gera a proposta bilateral de exclusão pendente
        UPDATE public.financial_transactions
        SET status = 'cancelled',
            shared_status = 'modified'
        WHERE id = OLD.id;

        RETURN NULL; -- Impede a deleção física do registro agora
    END IF;

    -- Se não for compartilhada, permite a exclusão física normal
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Associar a trigger BEFORE DELETE na tabela financial_transactions
DROP TRIGGER IF EXISTS trg_prevent_physical_delete_on_shared ON public.financial_transactions;
CREATE TRIGGER trg_prevent_physical_delete_on_shared
BEFORE DELETE ON public.financial_transactions
FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_physical_delete_on_shared();
