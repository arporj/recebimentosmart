-- Adicionar coluna receiver_client_id na tabela client_shares para rastrear o cliente do receptor
ALTER TABLE public.client_shares ADD COLUMN IF NOT EXISTS receiver_client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;

-- 1. Recriar a Trigger Function fn_handle_shared_transaction com suporte a receiver_client_id
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
                SELECT cs.id, p.id AS receiver_id, cs.status, cs.receiver_client_id 
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
                    v_share_record.receiver_client_id, NULL, NEW.user_id, NEW.id, 'pending'
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


-- 2. Recriar a RPC fn_accept_share_v2 com suporte a p_receiver_client_id
CREATE OR REPLACE FUNCTION public.fn_accept_share_v2(
    p_share_id UUID, 
    p_configs JSONB, -- Array de objetos com original_transaction_id, category_id, account_id
    p_receiver_client_id UUID DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_share RECORD;
    v_receiver_profile RECORD;
    v_item JSONB;
    v_tx_id UUID;
    v_cat_id UUID;
    v_acc_id UUID;
    v_new_parent_id UUID;
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

    -- Atualizar o status para accepted e gravar o receiver_client_id
    UPDATE public.client_shares 
    SET status = 'accepted', receiver_client_id = p_receiver_client_id 
    WHERE id = p_share_id;

    -- Iterar sobre cada item da config e fazer o insert
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_configs) LOOP
        v_tx_id := (v_item->>'original_transaction_id')::UUID;
        v_cat_id := (v_item->>'category_id')::UUID;
        v_acc_id := (v_item->>'account_id')::UUID;

        -- Primeiro clona a transação pai original
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
            'pending',
            p_receiver_client_id, -- Usar o cliente fornecido pelo receptor
            NULL,
            user_id,
            id,
            'accepted',
            v_cat_id,
            v_acc_id
        FROM public.financial_transactions
        WHERE id = v_tx_id
          AND user_id = v_share.sender_id
        RETURNING id INTO v_new_parent_id;

        -- E agora clona as filhas físicas existentes apontando para o novo parent_id clonado!
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
            'pending',
            p_receiver_client_id, -- Usar o cliente fornecido pelo receptor
            v_new_parent_id,
            user_id,
            id,
            'accepted',
            v_cat_id,
            v_acc_id
        FROM public.financial_transactions
        WHERE parent_id = v_tx_id
          AND user_id = v_share.sender_id;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Recriar a RPC fn_accept_share com suporte a p_receiver_client_id
CREATE OR REPLACE FUNCTION public.fn_accept_share(
    p_share_id UUID, 
    p_category_id UUID, 
    p_account_id UUID,
    p_receiver_client_id UUID DEFAULT NULL
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

    -- Atualizar o status para accepted e gravar o receiver_client_id
    UPDATE public.client_shares 
    SET status = 'accepted', receiver_client_id = p_receiver_client_id 
    WHERE id = p_share_id;

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
        p_receiver_client_id, -- Usar o cliente fornecido pelo receptor
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
