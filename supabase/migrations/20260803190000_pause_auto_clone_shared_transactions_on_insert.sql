-- Migração: pausa a clonagem automática de lançamentos para clientes compartilhados
-- Caminho: supabase/migrations/20260803190000_pause_auto_clone_shared_transactions_on_insert.sql
--
-- CONTEXTO: o recurso de "Lançamentos Compartilhados" já está com a UI adiada
-- para reavaliação de produto (ver docs/backlog_ideias.md, item 1.6.1), mas a
-- trigger trg_handle_shared_transaction continuava criando clones automáticos
-- em TODA nova transação de um cliente com client_shares.status = 'accepted'.
-- Isso gerou uma cadeia de cancelamentos cruzados não intencionais no cliente
-- Ricardo Cabral (investigado em 03/08/2026): ao criar/repor recorrências para
-- um cliente compartilhado, o clone era criado automaticamente do outro lado,
-- e alterações feitas nesse clone (ex.: cancelamento) reverberavam de volta
-- para a transação original via essa mesma trigger.
--
-- Enquanto a função de compartilhamento não é redesenhada por completo, a
-- criação de NOVOS clones ao escolher um cliente compartilhado em um
-- lançamento fica desativada. A sincronização de UPDATE/DELETE dos clones que
-- já existem hoje permanece ativa normalmente (não mexe em dados já
-- compartilhados, só para de criar novos).

CREATE OR REPLACE FUNCTION public.fn_handle_shared_transaction()
RETURNS TRIGGER AS $$
DECLARE
    v_share_record RECORD;
    v_inverted_type TEXT;
    v_scope TEXT := 'single';
    v_existing_id UUID;
BEGIN
    -- LÓGICA DE INSERÇÃO (INSERT) — DESATIVADA TEMPORARIAMENTE.
    -- Não clona mais automaticamente uma nova transação para o receptor de um
    -- compartilhamento aceito. Ver docs/backlog_ideias.md item 1.6.1.
    IF TG_OP = 'INSERT' THEN
        RETURN NEW;
    END IF;

    -- LÓGICA DE ATUALIZAÇÃO (UPDATE) — mantida como estava, para não quebrar a
    -- sincronização dos clones que já existem hoje.
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
