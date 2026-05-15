-- Criar RPC para Importação Inteligente de Cliente V1 para a V2
-- Implementa as escolhas aprovadas:
-- Questao 1 (Opcao B): Importacao manual por cliente via interface
-- Questao 2 (Opcao B): Janela retroativa de 3 meses para pendencias em atraso

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
BEGIN
    -- Obter ID do usuario logado se disponivel
    v_user_id := auth.uid();
    
    -- 1. Buscar dados do cliente
    SELECT * INTO v_client FROM public.clients WHERE id = p_client_id AND (user_id = v_user_id OR v_user_id IS NULL);
    
    IF v_client.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cliente não encontrado ou acesso não autorizado.');
    END IF;

    -- Bloquear se ja existir recorrencia cadastrada para evitar duplicidade (Questao 1 - Opcao B)
    SELECT EXISTS (
        SELECT 1 FROM public.financial_transactions 
        WHERE client_id = p_client_id AND parent_id IS NULL AND modalidade = 'recorrente'
    ) INTO v_exists;
    
    IF v_exists THEN
        RETURN jsonb_build_object('success', false, 'message', 'Este cliente já possui uma recorrência configurada na V2.');
    END IF;

    -- 2. Criar a Transação Mãe na V2
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
        status
    ) VALUES (
        v_client.user_id,
        v_client.id,
        'income',
        COALESCE(v_client.monthly_payment, 0),
        COALESCE(v_client.start_date, CURRENT_DATE),
        'Assinatura Mensal - ' || v_client.name,
        'recorrente',
        NULL,
        TRUE,
        'monthly',
        COALESCE(v_client.payment_due_day, 10),
        'pending'
    ) RETURNING id INTO v_parent_id;

    -- 3. Importar pagamentos efetuados históricos da V1 (tabela payments)
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
            status
        ) VALUES (
            v_client.user_id,
            v_client.id,
            'income',
            v_payment.amount,
            v_payment.payment_date,
            v_payment.amount,
            v_payment.payment_date,
            'Mensalidade Recebida (Migrada V1) - ' || v_client.name,
            'recorrente',
            v_parent_id,
            TRUE,
            'monthly',
            COALESCE(v_client.payment_due_day, 10),
            'paid'
        );
        v_inserted_paid := v_inserted_paid + 1;
    END LOOP;

    -- 4. Gerar débitos em atraso apenas para os últimos 3 meses (Questao 2 - Opcao B)
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
                    status
                ) VALUES (
                    v_client.user_id,
                    v_client.id,
                    'income',
                    COALESCE(v_client.monthly_payment, 0),
                    v_month_due_date,
                    'Mensalidade em Atraso (Migrada) - ' || v_client.name,
                    'recorrente',
                    v_parent_id,
                    TRUE,
                    'monthly',
                    COALESCE(v_client.payment_due_day, 10),
                    'pending'
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
