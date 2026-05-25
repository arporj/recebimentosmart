-- Criar a nova RPC fn_accept_share_v2 que suporta configurações individuais de categoria e conta por transação
CREATE OR REPLACE FUNCTION public.fn_accept_share_v2(
    p_share_id UUID, 
    p_configs JSONB -- Array de objetos com original_transaction_id, category_id, account_id
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

    -- Atualizar o status para accepted
    UPDATE public.client_shares SET status = 'accepted' WHERE id = p_share_id;

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
            client_id,
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
            client_id,
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
