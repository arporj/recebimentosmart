-- Migration: Gold Standard V1 to V2 Client & Payment Data Backfill (Fixed)
-- 1. Corrects import_client_history_v1_to_v2 RPC to properly mark master templates with is_template = true.
-- 2. Backfills master templates and V1 paid history for ALL valid users with c.user_id IS NOT NULL.
-- 3. Cleans up orphaned physical pending child transactions to stop repeating overdue entries.

CREATE OR REPLACE FUNCTION public.import_client_history_v1_to_v2_gold(p_target_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    r_client RECORD;
    r_payment RECORD;
    v_template_id UUID;
    v_account_id UUID;
    v_competence_date DATE;
    v_due_day INT;
    v_count_templates_created INT := 0;
    v_count_payments_imported INT := 0;
    v_count_duplicates_cleaned INT := 0;
    v_exists BOOLEAN;
BEGIN
    -- Loop por todos os clientes válidos vinculados a um usuário (garantindo user_id IS NOT NULL)
    FOR r_client IN 
        SELECT c.* 
        FROM public.clients c
        WHERE c.user_id IS NOT NULL
          AND (p_target_user_id IS NULL OR c.user_id = p_target_user_id)
          AND (c.deleted_at IS NULL)
        ORDER BY c.user_id, c.name
    LOOP
        -- Obter a conta financeira do usuário
        SELECT id INTO v_account_id 
        FROM public.financial_accounts 
        WHERE user_id = r_client.user_id AND is_active = true 
        ORDER BY is_default DESC, created_at ASC 
        LIMIT 1;

        -- Se o usuário não tiver conta, cria a Conta Principal
        IF v_account_id IS NULL THEN
            INSERT INTO public.financial_accounts (
                user_id,
                name,
                type,
                initial_balance,
                is_active,
                is_default
            ) VALUES (
                r_client.user_id,
                'Conta Principal',
                'checking',
                0,
                true,
                true
            ) RETURNING id INTO v_account_id;
        END IF;

        v_due_day := COALESCE(r_client.payment_due_day, 10);
        IF v_due_day < 1 OR v_due_day > 31 THEN
            v_due_day := 10;
        END IF;

        -- 1. Verificar se o cliente já possui um Template Mestre (is_template = true)
        SELECT id INTO v_template_id
        FROM public.financial_transactions
        WHERE client_id = r_client.id 
          AND is_template = true;

        -- Se não existir template mestre, busca transação mãe antiga sem is_template ou cria nova
        IF v_template_id IS NULL THEN
            SELECT id INTO v_template_id
            FROM public.financial_transactions
            WHERE client_id = r_client.id 
              AND parent_id IS NULL 
              AND modalidade = 'recorrente'
            LIMIT 1;

            IF v_template_id IS NOT NULL THEN
                -- Atualiza a transação mãe legada para ser reconhecida como is_template = true
                UPDATE public.financial_transactions
                SET is_template = true,
                    recurrence_enabled = true,
                    description = r_client.name,
                    amount = COALESCE(NULLIF(amount, 0), r_client.monthly_payment, 0),
                    account_id = COALESCE(account_id, v_account_id)
                WHERE id = v_template_id;
            ELSE
                -- Criar novo Template Mestre V2 oficial
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
                    is_template,
                    account_id
                ) VALUES (
                    r_client.user_id,
                    r_client.id,
                    'income',
                    COALESCE(r_client.monthly_payment, 0),
                    COALESCE(r_client.start_date, CURRENT_DATE),
                    r_client.name,
                    'recorrente',
                    NULL,
                    TRUE,
                    'monthly',
                    v_due_day,
                    'pending',
                    TRUE,
                    v_account_id
                ) RETURNING id INTO v_template_id;

                v_count_templates_created := v_count_templates_created + 1;
            END IF;
        END IF;

        -- 2. Migrar todos os pagamentos da tabela 'payments' (V1) para 'financial_transactions' (V2)
        FOR r_payment IN 
            SELECT * FROM public.payments WHERE client_id = r_client.id ORDER BY payment_date ASC
        LOOP
            -- Calcular competência (ano, mês da data de pagamento com o due_day)
            BEGIN
                v_competence_date := (date_trunc('month', r_payment.payment_date::date) + ((v_due_day - 1) || ' days')::interval)::date;
            EXCEPTION WHEN OTHERS THEN
                v_competence_date := r_payment.payment_date::date;
            END;

            -- Verificar se já existe lançamento pago para este mês/competência
            SELECT EXISTS (
                SELECT 1 FROM public.financial_transactions
                WHERE client_id = r_client.id
                  AND status = 'paid'
                  AND (
                      (paid_date::date = r_payment.payment_date::date)
                      OR (to_char(date, 'YYYY-MM') = to_char(v_competence_date, 'YYYY-MM'))
                  )
            ) INTO v_exists;

            IF NOT v_exists THEN
                INSERT INTO public.financial_transactions (
                    user_id,
                    client_id,
                    type,
                    amount,
                    paid_amount,
                    date,
                    paid_date,
                    description,
                    modalidade,
                    parent_id,
                    recurrence_enabled,
                    recurrence_period,
                    due_day,
                    status,
                    is_template,
                    account_id
                ) VALUES (
                    r_client.user_id,
                    r_client.id,
                    'income',
                    r_payment.amount,
                    r_payment.amount,
                    v_competence_date,
                    r_payment.payment_date,
                    r_client.name,
                    'recorrente',
                    v_template_id,
                    FALSE,
                    'monthly',
                    v_due_day,
                    'paid',
                    FALSE,
                    v_account_id
                );

                v_count_payments_imported := v_count_payments_imported + 1;
            END IF;
        END LOOP;

    END LOOP;

    -- 3. Limpar transações físicas filhas pendentes que foram geradas erroneamente (substituídas pelo motor virtual da V2)
    WITH deleted_rows AS (
        DELETE FROM public.financial_transactions
        WHERE parent_id IS NOT NULL 
          AND is_template = false 
          AND status = 'pending'
        RETURNING id
    )
    SELECT COUNT(*) INTO v_count_duplicates_cleaned FROM deleted_rows;

    RETURN jsonb_build_object(
        'success', true,
        'templates_created', v_count_templates_created,
        'payments_imported', v_count_payments_imported,
        'duplicates_cleaned', v_count_duplicates_cleaned
    );
END;
$$;

-- Executar o procedimento para TODOS os usuários válidos do sistema imediatamente
SELECT public.import_client_history_v1_to_v2_gold(NULL);

-- Atualizar a RPC oficial import_client_history_v1_to_v2 para apontar para a versão corrigida
CREATE OR REPLACE FUNCTION public.import_client_history_v1_to_v2(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_client RECORD;
BEGIN
    SELECT * INTO v_client FROM public.clients WHERE id = p_client_id;
    IF v_client.id IS NULL OR v_client.user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cliente inválido ou não encontrado.');
    END IF;

    RETURN public.import_client_history_v1_to_v2_gold(v_client.user_id);
END;
$$;
