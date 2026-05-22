-- Migração: Refatoração Estrutural de Compartilhamentos v3
-- Cria colunas necessárias na tabela de transações e a tabela de atualizações de compartilhamentos.

-- 1. Garantir que as colunas de compartilhamento existam na tabela financial_transactions
ALTER TABLE public.financial_transactions
ADD COLUMN IF NOT EXISTS shared_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS shared_original_transaction_id UUID REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS shared_status TEXT CHECK (shared_status IN ('pending', 'accepted', 'rejected', 'modified'));

-- 2. Criar a tabela de atualizações de compartilhamentos
CREATE TABLE IF NOT EXISTS public.shared_transaction_updates (
    id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    transaction_id UUID REFERENCES public.financial_transactions(id) ON DELETE CASCADE,
    original_transaction_id UUID REFERENCES public.financial_transactions(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    receiver_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    update_type TEXT CHECK (update_type IN ('update', 'delete')) NOT NULL,
    scope TEXT CHECK (scope IN ('single', 'all_future')) DEFAULT 'single' NOT NULL,
    old_amount NUMERIC,
    new_amount NUMERIC,
    old_date DATE,
    new_date DATE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 3. Habilitar RLS na tabela shared_transaction_updates
ALTER TABLE public.shared_transaction_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir visualizar atualizações envolvidas" ON public.shared_transaction_updates;
CREATE POLICY "Permitir visualizar atualizações envolvidas" ON public.shared_transaction_updates
    FOR SELECT TO authenticated
    USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS "Permitir inserção de atualizações envolvidas" ON public.shared_transaction_updates;
CREATE POLICY "Permitir inserção de atualizações envolvidas" ON public.shared_transaction_updates
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "Permitir atualização de status pelo receptor" ON public.shared_transaction_updates;
CREATE POLICY "Permitir atualização de status pelo receptor" ON public.shared_transaction_updates
    FOR UPDATE TO authenticated
    USING (auth.uid() = receiver_id)
    WITH CHECK (auth.uid() = receiver_id);

-- 4. Habilitar Realtime para as tabelas relevantes
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_transaction_updates;
EXCEPTION WHEN OTHERS THEN
    -- Ignorar erro caso a tabela já esteja na publicação
    NULL;
END $$;

-- 5. Função para aceitar/resolver a atualização de compartilhamento
CREATE OR REPLACE FUNCTION public.fn_resolve_shared_update(
    p_update_id UUID,
    p_action TEXT -- 'accepted' ou 'rejected'
) RETURNS VOID AS $$
DECLARE
    v_update RECORD;
    v_original_parent_id UUID;
    v_clone_parent_id UUID;
BEGIN
    -- Obter detalhes da atualização
    SELECT * INTO v_update FROM public.shared_transaction_updates WHERE id = p_update_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Atualização não encontrada.';
    END IF;

    IF p_action NOT IN ('accepted', 'rejected') THEN
        RAISE EXCEPTION 'Ação inválida. Use accepted ou rejected.';
    END IF;

    -- Atualizar status da notificação
    UPDATE public.shared_transaction_updates SET status = p_action WHERE id = p_update_id;

    -- Obter os IDs de recorrência pai (se houver) para ações em lote
    SELECT parent_id INTO v_original_parent_id 
    FROM public.financial_transactions 
    WHERE id = v_update.original_transaction_id;

    SELECT parent_id INTO v_clone_parent_id 
    FROM public.financial_transactions 
    WHERE id = v_update.transaction_id;

    IF p_action = 'accepted' THEN
        IF v_update.update_type = 'update' THEN
            -- Atualizar a transação correspondente
            IF v_update.sender_id = (SELECT user_id FROM public.financial_transactions WHERE id = v_update.original_transaction_id) THEN
                -- Remetente alterou, atualizar o clone do receptor
                IF v_update.scope = 'all_future' AND v_clone_parent_id IS NOT NULL THEN
                    -- Atualizar todas as futuras recorrências/parcelas correspondentes
                    UPDATE public.financial_transactions
                    SET amount = v_update.new_amount,
                        shared_status = 'accepted'
                    WHERE (parent_id = v_clone_parent_id OR id = v_clone_parent_id)
                      AND date >= v_update.new_date;
                ELSE
                    -- Atualizar apenas esta transação
                    UPDATE public.financial_transactions
                    SET amount = v_update.new_amount,
                        date = v_update.new_date,
                        shared_status = 'accepted'
                    WHERE id = v_update.transaction_id;
                END IF;
            ELSE
                -- Receptor alterou, atualizar a original do remetente
                IF v_update.scope = 'all_future' AND v_original_parent_id IS NOT NULL THEN
                    UPDATE public.financial_transactions
                    SET amount = v_update.new_amount,
                        shared_status = 'accepted'
                    WHERE (parent_id = v_original_parent_id OR id = v_original_parent_id)
                      AND date >= v_update.new_date;
                ELSE
                    UPDATE public.financial_transactions
                    SET amount = v_update.new_amount,
                        date = v_update.new_date,
                        shared_status = 'accepted'
                    WHERE id = v_update.original_transaction_id;
                END IF;
                
                -- Marcar o clone como aceito também
                UPDATE public.financial_transactions SET shared_status = 'accepted' WHERE id = v_update.transaction_id;
            END IF;

        ELSIF v_update.update_type = 'delete' THEN
            -- Excluir transação(ões) correspondente(s)
            IF v_update.scope = 'all_future' THEN
                -- Excluir o lote do receptor
                IF v_clone_parent_id IS NOT NULL THEN
                    DELETE FROM public.financial_transactions 
                    WHERE (parent_id = v_clone_parent_id OR id = v_clone_parent_id)
                      AND date >= (SELECT date FROM public.financial_transactions WHERE id = v_update.transaction_id);
                END IF;
                
                -- Excluir o lote do remetente
                IF v_original_parent_id IS NOT NULL THEN
                    DELETE FROM public.financial_transactions 
                    WHERE (parent_id = v_original_parent_id OR id = v_original_parent_id)
                      AND date >= (SELECT date FROM public.financial_transactions WHERE id = v_update.original_transaction_id);
                END IF;
            ELSE
                -- Excluir apenas a transação clonada e original envolvidas
                DELETE FROM public.financial_transactions WHERE id = v_update.transaction_id;
                DELETE FROM public.financial_transactions WHERE id = v_update.original_transaction_id;
            END IF;
        END IF;
    ELSE
        -- Se foi rejeitado
        IF v_update.update_type = 'update' THEN
            -- Reverter os dados no clone se o receptor alterou
            IF v_update.sender_id = (SELECT user_id FROM public.financial_transactions WHERE id = v_update.transaction_id) THEN
                UPDATE public.financial_transactions
                SET amount = v_update.old_amount,
                    date = v_update.old_date,
                    shared_status = 'accepted'
                WHERE id = v_update.transaction_id;
            ELSE
                -- Se o remetente alterou e o receptor rejeitou, restaurar o status do clone para aceito (com os dados anteriores que ele manteve)
                UPDATE public.financial_transactions
                SET shared_status = 'accepted'
                WHERE id = v_update.transaction_id;
            END IF;
        ELSIF v_update.update_type = 'delete' THEN
            -- Se rejeitou exclusão, mantém os lançamentos e apenas remove o status de pendente
            UPDATE public.financial_transactions SET shared_status = 'accepted' WHERE id = v_update.transaction_id;
            UPDATE public.financial_transactions SET shared_status = 'accepted' WHERE id = v_update.original_transaction_id;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. Trigger Function para gerenciar criação, alteração e exclusão de lançamentos compartilhados
CREATE OR REPLACE FUNCTION public.fn_handle_shared_transaction()
RETURNS TRIGGER AS $$
DECLARE
    v_share_record RECORD;
    v_clone_id UUID;
    v_receiver_profile RECORD;
    v_inverted_type TEXT;
BEGIN
    -- LÓGICA DE INSERÇÃO (INSERT)
    IF TG_OP = 'INSERT' THEN
        -- Ignorar se for um clone inserido pela própria trigger para evitar loops
        IF NEW.shared_original_transaction_id IS NOT NULL THEN
            RETURN NEW;
        END IF;

        IF NEW.client_id IS NOT NULL THEN
            -- Para cada compartilhamento ativo do cliente
            FOR v_share_record IN 
                SELECT id, shared_with_user_id, status 
                FROM public.client_shares 
                WHERE client_id = NEW.client_id AND status = 'accepted'
            LOOP
                -- Inverter tipo financeiro para o receptor (receita vira despesa e vice-versa)
                IF NEW.type = 'income' THEN v_inverted_type := 'expense';
                ELSIF NEW.type = 'expense' THEN v_inverted_type := 'income';
                ELSE v_inverted_type := NEW.type;
                END IF;

                -- Clonar transação individual como pendente (o recebedor irá categorizar/definir conta)
                INSERT INTO public.financial_transactions (
                    user_id, type, amount, date, description, status, client_id, parent_id,
                    shared_by_user_id, shared_original_transaction_id, shared_status
                ) VALUES (
                    v_share_record.shared_with_user_id, v_inverted_type, NEW.amount, NEW.date, NEW.description, 'pending',
                    NEW.client_id, NULL, NEW.user_id, NEW.id, 'pending'
                );
            END LOOP;
        END IF;
        RETURN NEW;
    END IF;

    -- LÓGICA DE ATUALIZAÇÃO (UPDATE)
    IF TG_OP = 'UPDATE' THEN
        -- Evitar loops infinitos de trigger quando a trigger ou RPC altera dados de sincronização
        IF NEW.shared_status = 'accepted' AND OLD.shared_status = 'modified' THEN
            RETURN NEW;
        END IF;

        -- Alteração no lançamento original do compartilhador
        IF NEW.shared_original_transaction_id IS NULL THEN
            IF NEW.amount <> OLD.amount OR NEW.date <> OLD.date THEN
                -- Localizar a transação clonada no receptor correspondente
                SELECT id, user_id, amount, date INTO v_share_record
                FROM public.financial_transactions
                WHERE shared_original_transaction_id = NEW.id
                LIMIT 1;

                IF FOUND THEN
                    -- Marcar transação clonada como modified
                    UPDATE public.financial_transactions 
                    SET shared_status = 'modified' 
                    WHERE id = v_share_record.id;

                    -- Inserir proposta de atualização para aprovação
                    INSERT INTO public.shared_transaction_updates (
                        transaction_id, original_transaction_id, sender_id, receiver_id,
                        update_type, old_amount, new_amount, old_date, new_date, status
                    ) VALUES (
                        v_share_record.id, NEW.id, NEW.user_id, v_share_record.user_id,
                        'update', v_share_record.amount, NEW.amount, v_share_record.date, NEW.date, 'pending'
                    );
                END IF;
            END IF;
        ELSE
            -- Alteração no clone pelo receptor
            IF NEW.amount <> OLD.amount OR NEW.date <> OLD.date THEN
                -- Garantir que a original do remetente existe
                SELECT id, user_id, amount, date INTO v_share_record
                FROM public.financial_transactions
                WHERE id = NEW.shared_original_transaction_id
                LIMIT 1;

                IF FOUND THEN
                    -- Marcar a própria transação clonada como modified
                    NEW.shared_status := 'modified';

                    -- Inserir proposta de atualização para aprovação
                    INSERT INTO public.shared_transaction_updates (
                        transaction_id, original_transaction_id, sender_id, receiver_id,
                        update_type, old_amount, new_amount, old_date, new_date, status
                    ) VALUES (
                        NEW.id, v_share_record.id, NEW.user_id, v_share_record.user_id,
                        'update', v_share_record.amount, NEW.amount, v_share_record.date, NEW.date, 'pending'
                    );
                END IF;
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    -- LÓGICA DE EXCLUSÃO (DELETE)
    IF TG_OP = 'DELETE' THEN
        -- Exclusão do original pelo compartilhador
        IF OLD.shared_original_transaction_id IS NULL THEN
            -- Localizar clone ativo no receptor
            SELECT id, user_id INTO v_share_record
            FROM public.financial_transactions
            WHERE shared_original_transaction_id = OLD.id
            LIMIT 1;

            IF FOUND THEN
                -- Marcar transação clonada como modified temporariamente para notificação
                UPDATE public.financial_transactions 
                SET shared_status = 'modified' 
                WHERE id = v_share_record.id;

                -- Inserir notificação de exclusão
                INSERT INTO public.shared_transaction_updates (
                    transaction_id, original_transaction_id, sender_id, receiver_id,
                    update_type, status
                ) VALUES (
                    v_share_record.id, OLD.id, OLD.user_id, v_share_record.user_id,
                    'delete', 'pending'
                );
            END IF;
        ELSE
            -- Exclusão do clone pelo receptor
            SELECT id, user_id INTO v_share_record
            FROM public.financial_transactions
            WHERE id = OLD.shared_original_transaction_id
            LIMIT 1;

            IF FOUND THEN
                -- Restaurar a original para status modified/pendente de aceite de exclusão
                UPDATE public.financial_transactions 
                SET shared_status = 'modified' 
                WHERE id = v_share_record.id;

                -- Inserir notificação de exclusão
                INSERT INTO public.shared_transaction_updates (
                    transaction_id, original_transaction_id, sender_id, receiver_id,
                    update_type, status
                ) VALUES (
                    OLD.id, v_share_record.id, OLD.user_id, v_share_record.user_id,
                    'delete', 'pending'
                );
            END IF;
        END IF;
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Recriar a Trigger na tabela financial_transactions
DROP TRIGGER IF EXISTS trg_handle_shared_transaction ON public.financial_transactions;
CREATE TRIGGER trg_handle_shared_transaction
AFTER INSERT OR UPDATE OR DELETE ON public.financial_transactions
FOR EACH ROW EXECUTE FUNCTION public.fn_handle_shared_transaction();
