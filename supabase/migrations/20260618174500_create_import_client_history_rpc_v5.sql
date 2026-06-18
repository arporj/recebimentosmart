-- Criar ou atualizar RPC para Importação Inteligente de Cliente V1 para a V2
-- Garante que o usuário possua uma conta financeira cadastrada, vinculando as transações importadas a ela.
-- Define a descrição da transação diretamente como o nome do cliente.
-- Define recurrence_enabled = false para transações filhas importadas ou geradas (evitando duplicações).

CREATE OR REPLACE FUNCTION public.import_client_history_v1_to_v2(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_client RECORD;
    v_parent_id UUID;
    v_inserted_paid INT := 0;
    v_inserted_pending INT := 0;
    v_current_date DATE := CURRENT_DATE;
    v_month_start DATE;
    v_month_due_date DATE;
    v_months_back INT;
    v_exists BOOLEAN;
    v_payment RECORD;
    v_user_id UUID;
    v_account_id UUID;
BEGIN
    -- Obter ID do usuario logado se disponivel
    v_user_id := auth.uid();
    
    -- 1. Buscar dados do cliente
    SELECT * INTO v_client FROM public.clients WHERE id = p_client_id AND (user_id = v_user_id OR v_user_id IS NULL);
    
    IF v_client.id IS NULL THEN
        -- Fallback caso seja executado por um admin/sistema sem auth.uid() definido diretamente no contexto da transacao
        SELECT * INTO v_client FROM public.clients WHERE id = p_client_id;
        IF v_client.id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'message', 'Cliente não encontrado ou acesso não autorizado.');
        END IF;
    END IF;

    -- Obter o user_id real do cliente (dono)
    v_user_id := v_client.user_id;

    -- Garantir que o usuário proprietário tenha pelo menos uma conta ativa cadastrada
    SELECT id INTO v_account_id 
    FROM public.financial_accounts 
    WHERE user_id = v_user_id AND is_active = true 
    ORDER BY created_at ASC 
    LIMIT 1;

    -- Se não possuir nenhuma conta ativa, cria a "Conta Principal" padrão
    IF v_account_id IS NULL THEN
        INSERT INTO public.financial_accounts (
            user_id,
            name,
            type,
            initial_balance,
            is_active
        ) VALUES (
            v_user_id,
            'Conta Principal',
            'checking',
            0,
            true
        ) RETURNING id INTO v_account_id;
    END IF;

    -- Bloquear se ja existir recorrencia cadastrada para evitar duplicidade (Questao 1 - Opcao B)
    SELECT EXISTS (
        SELECT 1 FROM public.financial_transactions 
        WHERE client_id = p_client_id AND parent_id IS NULL AND modalidade = 'recorrente'
    ) INTO v_exists;
    
    IF v_exists THEN
        RETURN jsonb_build_object('success', false, 'message', 'Este cliente já possui uma recorrência configurada na V2.');
    END IF;

    -- 2. Criar a Transação Mãe na V2 (Apenas a mãe tem recurrence_enabled = TRUE)
    INSERT INTO public.financial_transactions (
        user_id,
        client_id,
        type,
        amount,
        date,
        description,
        modalidade,
        parent_id,
        recurrence_enabled,
        recurrence_period,
        due_day,
        status,
        account_id
    ) VALUES (
        v_user_id,
        v_client.id,
        'income',
        COALESCE(v_client.monthly_payment, 0),
        COALESCE(v_client.start_date, CURRENT_DATE),
        v_client.name,
        'recorrente',
        NULL,
        TRUE,
        'monthly',
        COALESCE(v_client.payment_due_day, 10),
        'pending',
        v_account_id
    ) RETURNING id INTO v_parent_id;

    -- 3. Importar pagamentos efetuados históricos da V1 (tabela payments)
    -- As transações filhas físicas recebem recurrence_enabled = FALSE
    FOR v_payment IN 
        SELECT payment_date::date, amount FROM public.payments WHERE client_id = p_client_id
    LOOP
        INSERT INTO public.financial_transactions (
            user_id,
            client_id,
            type,
            amount,
            date,
            paid_amount,
            paid_date,
            description,
            modalidade,
            parent_id,
            recurrence_enabled,
            recurrence_period,
            due_day,
            status,
            account_id
        ) VALUES (
            v_user_id,
            v_client.id,
            'income',
            v_payment.amount,
            v_payment.payment_date,
            v_payment.amount,
            v_payment.payment_date,
            v_client.name,
            'recorrente',
            v_parent_id,
            FALSE, -- Filhas não são recorrências mães, logo recurrence_enabled = FALSE
            'monthly',
            COALESCE(v_client.payment_due_day, 10),
            'paid',
            v_account_id
        );
        v_inserted_paid := v_inserted_paid + 1;
    END LOOP;

    -- 4. Gerar débitos em atraso apenas para os últimos 3 meses (Questao 2 - Opcao B)
    -- As transações filhas físicas recebem recurrence_enabled = FALSE
    FOR v_months_back IN REVERSE 3..0 LOOP
        -- Calcular o inicio do mes analisado e sua data de vencimento
        v_month_start := date_trunc('month', v_current_date - (v_months_back || ' month')::interval);
        -- Data de vencimento ficticia do mes com o due_day
        v_month_due_date := (v_month_start + ((COALESCE(v_client.payment_due_day, 10) - 1) || ' day')::interval)::date;
        
        -- Apenas se a data ja tiver passado e for posterior ao inicio de vigencia do cliente
        IF v_month_due_date < v_current_date AND v_month_due_date >= COALESCE(v_client.start_date, '2020-01-01'::date) THEN
            -- Verificar se ja registramos um pagamento para este mes na tabela financial_transactions recem-criada
            SELECT EXISTS (
                SELECT 1 FROM public.financial_transactions 
                WHERE client_id = p_client_id 
                  AND parent_id = v_parent_id 
                  AND status = 'paid'
                  AND date_trunc('month', date) = v_month_start
            ) INTO v_exists;
            
            -- Se nao houver pagamento no mes, cria uma cobranca em atraso pendente
            IF NOT v_exists THEN
                INSERT INTO public.financial_transactions (
                    user_id,
                    client_id,
                    type,
                    amount,
                    date,
                    description,
                    modalidade,
                    parent_id,
                    recurrence_enabled,
                    recurrence_period,
                    due_day,
                    status,
                    account_id
                ) VALUES (
                    v_user_id,
                    v_client.id,
                    'income',
                    COALESCE(v_client.monthly_payment, 0),
                    v_month_due_date,
                    v_client.name,
                    'recorrente',
                    v_parent_id,
                    FALSE, -- Filhas não são recorrências mães, logo recurrence_enabled = FALSE
                    'monthly',
                    COALESCE(v_client.payment_due_day, 10),
                    'pending',
                    v_account_id
                );
                v_inserted_pending := v_inserted_pending + 1;
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'Importação concluída com êxito!',
        'parent_id', v_parent_id,
        'paid_imported', v_inserted_paid,
        'pending_generated', v_inserted_pending
    );
END;
$$;

COMMENT ON FUNCTION public.import_client_history_v1_to_v2 IS 'Realiza a migracao assistida de dados financeiros do cliente da V1 para a V2 respeitando a janela retroativa de 3 meses.';

-- --- BACKFILL: Corrigir transações existentes (conta, descrição e recurrence_enabled nas filhas) ---
DO $$
DECLARE
    r_tx RECORD;
    v_user_acc_id UUID;
BEGIN
    -- 1. Corrigir recurrence_enabled = false para transações filhas físicas que já existem no banco
    UPDATE public.financial_transactions
    SET recurrence_enabled = false
    WHERE parent_id IS NOT NULL;

    -- 2. Garantir contas e descrições corretas
    FOR r_tx IN 
        SELECT DISTINCT user_id FROM public.financial_transactions WHERE user_id IS NOT NULL
    LOOP
        -- Tenta encontrar a primeira conta ativa do usuário
        SELECT id INTO v_user_acc_id 
        FROM public.financial_accounts 
        WHERE user_id = r_tx.user_id AND is_active = true 
        ORDER BY created_at ASC 
        LIMIT 1;

        -- Se o usuário não possuir conta, cria uma "Conta Principal" padrão
        IF v_user_acc_id IS NULL THEN
            INSERT INTO public.financial_accounts (
                user_id,
                name,
                type,
                initial_balance,
                is_active
            ) VALUES (
                r_tx.user_id,
                'Conta Principal',
                'checking',
                0,
                true
            ) RETURNING id INTO v_user_acc_id;
        END IF;

        -- Atualiza todas as transações daquele usuário que estejam sem conta
        UPDATE public.financial_transactions 
        SET account_id = v_user_acc_id 
        WHERE user_id = r_tx.user_id AND account_id IS NULL;

        -- Remove os prefixos das descrições das transações importadas anteriores
        UPDATE public.financial_transactions ft
        SET description = c.name
        FROM public.clients c
        WHERE ft.client_id = c.id
          AND ft.user_id = r_tx.user_id
          AND (
            ft.description = 'Assinatura Mensal - ' || c.name OR
            ft.description = 'Mensalidade Recebida (Migrada V1) - ' || c.name OR
            ft.description = 'Mensalidade em Atraso (Migrada) - ' || c.name
          );
    END LOOP;
END $$;
