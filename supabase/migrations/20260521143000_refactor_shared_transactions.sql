-- Migração: Refatoração Estrutural de Compartilhamentos (Clonagem de Transações)
-- Adiciona colunas para rastrear transações que foram compartilhadas via client_shares.

-- 1. Adicionar colunas na tabela de transações
ALTER TABLE public.financial_transactions
ADD COLUMN IF NOT EXISTS shared_by_user_id UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS shared_original_transaction_id UUID REFERENCES public.financial_transactions(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS shared_status TEXT CHECK (shared_status IN ('pending', 'accepted', 'rejected', 'modified'));

-- 2. Função para aceitar o compartilhamento e clonar o histórico
CREATE OR REPLACE FUNCTION public.fn_accept_share(
    p_share_id UUID,
    p_category_id UUID,
    p_account_id UUID
) RETURNS VOID AS $$
DECLARE
    v_share RECORD;
    v_inverted_type TEXT;
BEGIN
    -- Obter os dados do compartilhamento
    SELECT * INTO v_share FROM public.client_shares WHERE id = p_share_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Compartilhamento não encontrado.';
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
        v_share.shared_with_user_id,
        CASE WHEN type = 'income' THEN 'expense' WHEN type = 'expense' THEN 'income' ELSE type END,
        amount,
        date,
        description,
        'pending', -- sempre cai como pendente financeiramente
        client_id,
        NULL, -- sem parent_id para simplificar, ou poderíamos mapear
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


-- 3. Criar a Trigger Function para gerenciar novas inserções após o aceite
CREATE OR REPLACE FUNCTION public.fn_handle_shared_transaction()
RETURNS TRIGGER AS $$
DECLARE
    share_record RECORD;
    parent_clone RECORD;
    inverted_type TEXT;
BEGIN
    -- Lógica para INSERT (Nova transação)
    IF TG_OP = 'INSERT' THEN
        IF NEW.client_id IS NOT NULL THEN
            FOR share_record IN 
                SELECT shared_with_user_id 
                FROM public.client_shares 
                WHERE client_id = NEW.client_id AND status = 'accepted'
            LOOP
                IF NEW.type = 'income' THEN inverted_type := 'expense';
                ELSIF NEW.type = 'expense' THEN inverted_type := 'income';
                ELSE inverted_type := NEW.type;
                END IF;

                parent_clone := NULL;
                IF NEW.parent_id IS NOT NULL THEN
                    SELECT category_id, account_id INTO parent_clone
                    FROM public.financial_transactions
                    WHERE shared_original_transaction_id = NEW.parent_id
                      AND user_id = share_record.shared_with_user_id
                    LIMIT 1;
                END IF;

                INSERT INTO public.financial_transactions (
                    user_id, type, amount, date, description, status, client_id, parent_id,
                    shared_by_user_id, shared_original_transaction_id, shared_status, category_id, account_id
                ) VALUES (
                    share_record.shared_with_user_id, inverted_type, NEW.amount, NEW.date, NEW.description, 'pending',
                    NEW.client_id, NULL, NEW.user_id, NEW.id,
                    CASE WHEN parent_clone.category_id IS NOT NULL THEN 'accepted' ELSE 'pending' END,
                    parent_clone.category_id, parent_clone.account_id
                );
            END LOOP;
        END IF;
        RETURN NEW;
    END IF;

    -- Lógica para UPDATE
    IF TG_OP = 'UPDATE' THEN
        IF NEW.amount <> OLD.amount OR NEW.date <> OLD.date OR NEW.description <> OLD.description THEN
            UPDATE public.financial_transactions
            SET amount = NEW.amount, date = NEW.date, description = NEW.description,
                shared_status = CASE WHEN shared_status = 'accepted' THEN 'modified' ELSE shared_status END
            WHERE shared_original_transaction_id = NEW.id;
        END IF;
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Criar a Trigger na tabela
DROP TRIGGER IF EXISTS trg_handle_shared_transaction ON public.financial_transactions;
CREATE TRIGGER trg_handle_shared_transaction
AFTER INSERT OR UPDATE OR DELETE ON public.financial_transactions
FOR EACH ROW EXECUTE FUNCTION public.fn_handle_shared_transaction();
