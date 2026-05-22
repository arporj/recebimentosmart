-- Migração: Correção de triggers e funções de compartilhamento que usavam shared_with_user_id
-- Ajusta fn_handle_shared_transaction e fn_accept_share para realizar o JOIN/busca na tabela public.profiles pelo e-mail do receptor

-- 1. Recriar a Trigger Function fn_handle_shared_transaction
CREATE OR REPLACE FUNCTION public.fn_handle_shared_transaction()
RETURNS TRIGGER AS $$
DECLARE
    v_share_record RECORD;
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
            -- Para cada compartilhamento ativo do cliente, fazendo o JOIN com profiles para encontrar o ID do receptor correto
            FOR v_share_record IN 
                SELECT cs.id, p.id AS receiver_id, cs.status 
                FROM public.client_shares cs
                JOIN public.profiles p ON LOWER(p.email) = LOWER(cs.receiver_email)
                WHERE cs.client_id = NEW.client_id AND cs.status = 'accepted'
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
                    v_share_record.receiver_id, v_inverted_type, NEW.amount, NEW.date, NEW.description, 'pending',
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


-- 2. Recriar a RPC fn_accept_share
CREATE OR REPLACE FUNCTION public.fn_accept_share(
    p_share_id UUID, 
    p_category_id UUID, 
    p_account_id UUID
)
RETURNS VOID AS $$
DECLARE
    v_share RECORD;
    v_receiver_profile RECORD;
BEGIN
    -- Obter os dados do compartilhamento
    SELECT * INTO v_share FROM public.client_shares WHERE id = p_share_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Compartilhamento não encontrado.';
    END IF;

    -- Obter o ID do receptor a partir do profiles usando receiver_email
    SELECT id INTO v_receiver_profile FROM public.profiles WHERE LOWER(email) = LOWER(v_share.receiver_email);
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Perfil do receptor com e-mail % não encontrado.', v_share.receiver_email;
    END IF;

    -- Atualizar o status para accepted
    UPDATE public.client_shares SET status = 'accepted' WHERE id = p_share_id;

    -- Clonar todas as transações existentes desse cliente para o recebedor
    INSERT INTO public.financial_transactions (
        user_id,
        type,
        amount,
        date,
        description,
        status,
        client_id,
        parent_id,
        shared_by_user_id,
        shared_original_transaction_id,
        shared_status,
        category_id,
        account_id
    )
    SELECT
        v_receiver_profile.id,
        CASE WHEN type = 'income' THEN 'expense' WHEN type = 'expense' THEN 'income' ELSE type END,
        amount,
        date,
        description,
        'pending', -- sempre cai como pendente financeiramente
        client_id,
        NULL, -- sem parent_id para simplificar
        user_id,
        id,
        'accepted', -- o status do compartilhamento é aceito pois foi categorizado agora
        p_category_id,
        p_account_id
    FROM public.financial_transactions
    WHERE client_id = v_share.client_id
      AND user_id = v_share.sender_id;
      
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
