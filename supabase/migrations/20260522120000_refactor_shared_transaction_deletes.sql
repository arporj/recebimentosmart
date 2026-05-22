-- Migração: Refatoração de Exclusões e Lotes de Compartilhamento
-- Corrige a trigger de transações compartilhadas para interceptar atualizações do status para 'cancelled' (exclusão lógica)
-- Evita a duplicação de notificações pendentes para recorrências e parcelamentos
-- Atualiza a RPC fn_resolve_shared_update para sincronizar ações em lote corretamente

-- 1. Atualizar a Trigger Function fn_handle_shared_transaction
CREATE OR REPLACE FUNCTION public.fn_handle_shared_transaction()
RETURNS TRIGGER AS $$
DECLARE
    v_share_record RECORD;
    v_receiver_profile RECORD;
    v_inverted_type TEXT;
    v_scope TEXT := 'single';
    v_existing_id UUID;
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

        -- Se a transação não é compartilhada e não é clone, ignorar
        IF NEW.shared_status IS NULL AND NEW.shared_original_transaction_id IS NULL AND NEW.shared_by_user_id IS NULL THEN
            RETURN NEW;
        END IF;

        -- Determinar o escopo (single vs all_future) baseando-se no is_customized das recorrências
        IF NEW.parent_id IS NOT NULL OR NEW.recurrence_enabled = true THEN
            IF NEW.is_customized = true THEN
                v_scope := 'single';
            ELSE
                v_scope := 'all_future';
            END IF;
        ELSE
            v_scope := 'single';
        END IF;

        -- A: EXCLUSÃO LÓGICA (Mudou o status para 'cancelled')
        IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
            -- Verificar se já existe uma notificação de delete pendente para o mesmo grupo/recorrência
            SELECT id INTO v_existing_id
            FROM public.shared_transaction_updates
            WHERE status = 'pending'
              AND update_type = 'delete'
              AND (
                  (NEW.parent_id IS NOT NULL AND (
                      original_transaction_id IN (SELECT id FROM public.financial_transactions WHERE parent_id = NEW.parent_id OR id = NEW.parent_id)
                      OR transaction_id IN (SELECT id FROM public.financial_transactions WHERE parent_id = NEW.parent_id OR id = NEW.parent_id)
                  ))
                  OR original_transaction_id = NEW.id
                  OR transaction_id = NEW.id
              );

            IF v_existing_id IS NOT NULL THEN
                -- Já existe notificação pendente para este grupo, ignorar inserção duplicada
                RETURN NEW;
            END IF;

            -- Alteração no lançamento original do compartilhador
            IF NEW.shared_original_transaction_id IS NULL THEN
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

                    -- Inserir proposta de exclusão
                    INSERT INTO public.shared_transaction_updates (
                        transaction_id, original_transaction_id, sender_id, receiver_id,
                        update_type, scope, old_amount, new_amount, old_date, new_date, status
                    ) VALUES (
                        v_share_record.id, NEW.id, NEW.user_id, v_share_record.user_id,
                        'delete', v_scope, NEW.amount, NEW.amount, NEW.date, NEW.date, 'pending'
                    );
                END IF;
            ELSE
                -- Receptor alterou/excluiu o clone
                SELECT id, user_id, amount, date INTO v_share_record
                FROM public.financial_transactions
                WHERE id = NEW.shared_original_transaction_id
                LIMIT 1;

                IF FOUND THEN
                    -- Marcar a original como modified
                    UPDATE public.financial_transactions 
                    SET shared_status = 'modified' 
                    WHERE id = v_share_record.id;

                    -- Inserir proposta de exclusão
                    INSERT INTO public.shared_transaction_updates (
                        transaction_id, original_transaction_id, sender_id, receiver_id,
                        update_type, scope, old_amount, new_amount, old_date, new_date, status
                    ) VALUES (
                        NEW.id, v_share_record.id, NEW.user_id, v_share_record.user_id,
                        'delete', v_scope, NEW.amount, NEW.amount, NEW.date, NEW.date, 'pending'
                    );
                END IF;
            END IF;

        -- B: ATUALIZAÇÃO NORMAL DE VALOR OU DATA
        ELSIF NEW.amount <> OLD.amount OR NEW.date <> OLD.date THEN
            -- Verificar se já existe uma notificação de update pendente para o mesmo grupo/recorrência
            SELECT id INTO v_existing_id
            FROM public.shared_transaction_updates
            WHERE status = 'pending'
              AND update_type = 'update'
              AND (
                  (NEW.parent_id IS NOT NULL AND (
                      original_transaction_id IN (SELECT id FROM public.financial_transactions WHERE parent_id = NEW.parent_id OR id = NEW.parent_id)
                      OR transaction_id IN (SELECT id FROM public.financial_transactions WHERE parent_id = NEW.parent_id OR id = NEW.parent_id)
                  ))
                  OR original_transaction_id = NEW.id
                  OR transaction_id = NEW.id
              );

            IF v_existing_id IS NOT NULL THEN
                -- Já existe notificação pendente para este grupo, ignorar inserção duplicada
                RETURN NEW;
            END IF;

            -- Alteração no lançamento original do compartilhador
            IF NEW.shared_original_transaction_id IS NULL THEN
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
                        update_type, scope, old_amount, new_amount, old_date, new_date, status
                    ) VALUES (
                        v_share_record.id, NEW.id, NEW.user_id, v_share_record.user_id,
                        'update', v_scope, v_share_record.amount, NEW.amount, v_share_record.date, NEW.date, 'pending'
                    );
                END IF;
            ELSE
                -- Alteração no clone pelo receptor
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
                        update_type, scope, old_amount, new_amount, old_date, new_date, status
                    ) VALUES (
                        NEW.id, v_share_record.id, NEW.user_id, v_share_record.user_id,
                        'update', v_scope, v_share_record.amount, NEW.amount, v_share_record.date, NEW.date, 'pending'
                    );
                END IF;
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Atualizar a RPC fn_resolve_shared_update para tratar perfeitamente exclusões e lotes
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

    -- Obter os IDs de recorrência pai
    SELECT parent_id INTO v_clone_parent_id 
    FROM public.financial_transactions 
    WHERE id = v_update.transaction_id;

    SELECT parent_id INTO v_original_parent_id
    FROM public.financial_transactions 
    WHERE id = v_update.original_transaction_id;

    -- Determinar o parent_id real da cadeia original
    IF v_original_parent_id IS NULL THEN
        v_original_parent_id := v_update.original_transaction_id;
    END IF;

    IF p_action = 'accepted' THEN
        IF v_update.update_type = 'update' THEN
            -- Atualizar a transação correspondente
            IF v_update.sender_id = (SELECT user_id FROM public.financial_transactions WHERE id = v_update.original_transaction_id) THEN
                -- Remetente alterou, atualizar o clone do receptor
                IF v_update.scope = 'all_future' THEN
                    -- Atualizar todas as futuras recorrências/parcelas correspondentes (clones do receptor)
                    UPDATE public.financial_transactions
                    SET amount = v_update.new_amount,
                        shared_status = 'accepted'
                    WHERE shared_original_transaction_id IN (
                        SELECT id FROM public.financial_transactions
                        WHERE parent_id = v_original_parent_id OR id = v_original_parent_id
                    ) AND date >= v_update.new_date;
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
                IF v_update.scope = 'all_future' THEN
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
                -- Excluir os clones do receptor primeiro
                DELETE FROM public.financial_transactions 
                WHERE shared_original_transaction_id IN (
                    SELECT id FROM public.financial_transactions
                    WHERE parent_id = v_original_parent_id OR id = v_original_parent_id
                ) AND date >= v_update.new_date;
                
                -- Excluir os originais do remetente
                DELETE FROM public.financial_transactions 
                WHERE (parent_id = v_original_parent_id OR id = v_original_parent_id)
                  AND date >= v_update.new_date;
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
            -- Se rejeitou exclusão, mantém os lançamentos e apenas remove o status de pendente, reativando-os
            UPDATE public.financial_transactions SET status = 'pending', shared_status = 'accepted' WHERE id = v_update.transaction_id AND status = 'cancelled';
            UPDATE public.financial_transactions SET status = 'pending', shared_status = 'accepted' WHERE id = v_update.original_transaction_id AND status = 'cancelled';
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
