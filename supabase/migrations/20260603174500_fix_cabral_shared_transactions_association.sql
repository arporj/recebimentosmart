-- Migração para corrigir transações compartilhadas de Ricardo Cabral (cabral.rlo@gmail.com) vindas de André (andre@andreric.com)
DO $$
DECLARE
    v_receiver_id UUID;
    v_sender_id UUID;
    v_sender_name TEXT;
    v_receiver_client_id UUID;
BEGIN
    -- 1. Obter o ID do receptor (Ricardo Cabral)
    SELECT id INTO v_receiver_id FROM public.profiles WHERE LOWER(email) = 'cabral.rlo@gmail.com';
    
    -- 2. Obter o ID e nome do remetente (André)
    SELECT id, name INTO v_sender_id, v_sender_name FROM public.profiles WHERE LOWER(email) = 'andre@andreric.com';

    -- Se ambos existirem, podemos fazer a migração dos dados
    IF v_receiver_id IS NOT NULL AND v_sender_id IS NOT NULL THEN
        
        -- 3. Verificar se já existe um cliente chamado 'André' cadastrado para o Ricardo Cabral
        SELECT id INTO v_receiver_client_id 
        FROM public.clients 
        WHERE user_id = v_receiver_id 
          AND LOWER(name) LIKE '%' || LOWER(v_sender_name) || '%'
          AND deleted_at IS NULL
        LIMIT 1;

        -- Se não existir, criamos um cliente com o nome do André na conta do Ricardo
        IF v_receiver_client_id IS NULL THEN
            INSERT INTO public.clients (
                user_id, name, phone, monthly_payment, payment_due_day, 
                start_date, next_payment_date, status, payment_frequency
            ) VALUES (
                v_receiver_id, v_sender_name, '', 0, 1, 
                CURRENT_DATE, CURRENT_DATE, true, 'monthly'
            )
            RETURNING id INTO v_receiver_client_id;
        END IF;

        -- 4. Atualizar a tabela client_shares para apontar o receiver_client_id correto
        UPDATE public.client_shares
        SET receiver_client_id = v_receiver_client_id
        WHERE LOWER(receiver_email) = 'cabral.rlo@gmail.com'
          AND sender_id = v_sender_id;

        -- 5. Atualizar as transações clonadas do Ricardo que vieram do André
        UPDATE public.financial_transactions
        SET client_id = v_receiver_client_id
        WHERE user_id = v_receiver_id
          AND shared_by_user_id = v_sender_id
          AND (client_id IS NULL OR client_id <> v_receiver_client_id);

        RAISE NOTICE 'Transações de compartilhamento do Ricardo Cabral corrigidas com sucesso. Cliente receptor associado: %', v_receiver_client_id;
    ELSE
        RAISE WARNING 'Não foi possível rodar a migração: perfis de Ricardo Cabral ou André não encontrados.';
    END IF;
END $$;
