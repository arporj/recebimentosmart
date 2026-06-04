-- Migração: Sistema de Notificações Web Push (PWA/Dispositivo)
-- Data: 04/06/2026

-- 1. Adiciona a coluna de controle do push nas configurações da conta à tabela public.profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS push_notifications_disabled BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.profiles.push_notifications_disabled IS 'Indica se o usuário deseja desabilitar totalmente as notificações por push em seus dispositivos';

-- 2. Cria a tabela de inscrições de push por dispositivo
CREATE TABLE IF NOT EXISTS public.user_push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.user_push_subscriptions IS 'Registra as inscrições de push de múltiplos navegadores/dispositivos dos usuários';

-- 3. Habilita RLS na tabela de inscrições
ALTER TABLE public.user_push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own subscriptions" ON public.user_push_subscriptions;
CREATE POLICY "Users can manage their own subscriptions" 
    ON public.user_push_subscriptions
    FOR ALL 
    TO authenticated
    USING (auth.uid() = user_id) 
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all subscriptions" ON public.user_push_subscriptions;
CREATE POLICY "Admins can view all subscriptions" 
    ON public.user_push_subscriptions
    FOR SELECT 
    TO authenticated
    USING (public.is_admin(auth.uid()));

-- 4. Função auxiliar no banco para invocar a Edge Function de envio de Push
CREATE OR REPLACE FUNCTION public.send_push_notification(
    p_user_id UUID,
    p_title TEXT,
    p_body TEXT,
    p_data JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_edge_url TEXT := 'https://kwdweztilsoxxcgudtsz.supabase.co/functions/v1/send-push-notification';
    v_service_key TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3ZHdlenRpbHNveHhjZ3VkdHN6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDEzMjY3NywiZXhwIjoyMDU5NzA4Njc3fQ.1iKIZqSUyo5VCqFvdJl-ZLdCsXZVmmwnFKA-9zGtA';
    v_req_id BIGINT;
    v_has_sub BOOLEAN;
    v_push_disabled BOOLEAN;
BEGIN
    -- Verifica se as notificações push estão desativadas para o perfil
    SELECT COALESCE(push_notifications_disabled, FALSE) INTO v_push_disabled
    FROM public.profiles
    WHERE id = p_user_id;

    IF v_push_disabled THEN
        RETURN;
    END IF;

    -- Verifica se possui alguma subscrição ativa no banco
    SELECT EXISTS(
        SELECT 1 FROM public.user_push_subscriptions WHERE user_id = p_user_id
    ) INTO v_has_sub;

    -- Se não houver subscrições cadastradas, encerra
    IF NOT v_has_sub THEN
        RETURN;
    END IF;

    -- Invoca a Edge Function assincronamente via net.http_post
    BEGIN
        SELECT net.http_post(
            url := v_edge_url,
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || v_service_key
            ),
            body := jsonb_build_object(
                'user_id', p_user_id,
                'title', p_title,
                'body', p_body,
                'data', p_data
            )
        ) INTO v_req_id;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Falha ao disparar Edge Function de push para o usuario %: %', p_user_id, SQLERRM;
    END;
END;
$$;

-- 5. Trigger function para disparar push em novas mensagens de feedback
CREATE OR REPLACE FUNCTION public.handle_feedback_message_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_feedback_owner UUID;
    v_feedback_subject TEXT;
    v_sender_name TEXT;
    v_admin RECORD;
BEGIN
    -- 1. Obter dono e assunto do feedback
    SELECT user_id, subject INTO v_feedback_owner, v_feedback_subject
    FROM public.feedbacks
    WHERE id = NEW.feedback_id;

    -- 2. Obter o nome do remetente
    SELECT COALESCE(name, email) INTO v_sender_name
    FROM public.profiles
    WHERE id = NEW.sender_id;

    IF v_sender_name IS NULL THEN
        v_sender_name := 'Sistema';
    END IF;

    -- 3. Decidir destinatário
    IF NEW.sender_id = v_feedback_owner THEN
        -- O usuário criou mensagem -> Notifica todos os administradores cadastrados com subscrições
        FOR v_admin IN
            SELECT id FROM public.profiles WHERE is_admin = TRUE AND deleted_at IS NULL
        LOOP
            PERFORM public.send_push_notification(
                v_admin.id,
                'Novo Feedback: ' || v_feedback_subject,
                v_sender_name || ': ' || substring(NEW.message from 1 for 100),
                jsonb_build_object('url', '/admin/feedbacks', 'feedback_id', NEW.feedback_id)
            );
        END LOOP;
    ELSE
        -- Admin respondeu -> Notifica o usuário criador do feedback
        PERFORM public.send_push_notification(
            v_feedback_owner,
            'Nova mensagem no Suporte',
            v_sender_name || ': ' || substring(NEW.message from 1 for 100),
            jsonb_build_object('url', '/feedback', 'feedback_id', NEW.feedback_id)
        );
    END IF;

    RETURN NEW;
END;
$$;

-- Trigger para novas mensagens de feedback
DROP TRIGGER IF EXISTS on_feedback_message_push ON public.feedback_messages;
CREATE TRIGGER on_feedback_message_push
    AFTER INSERT ON public.feedback_messages
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_feedback_message_push();

-- 6. Atualiza a RPC process_due_accounts_notifications() para conter os disparos de push
CREATE OR REPLACE FUNCTION public.process_due_accounts_notifications()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
    v_enabled boolean;
    v_frequency text;
    v_is_correct_day boolean;
    v_start_date date;
    v_end_date date;
    v_subject text;
    
    -- Cursores e registros do loop
    v_user RECORD;
    v_account RECORD;
    v_card RECORD;
    v_tx RECORD;
    
    -- Bloco de contas e faturas agrupadas
    v_account_section text;
    v_account_rows text;
    v_account_tx_count int;
    v_total_tx_count int;
    
    -- Variáveis de controle de fatura de cartão
    v_card_total numeric;
    v_card_is_paid boolean;
    v_card_section text;
    v_closing_date date;
    v_due_date date;
    v_card_invoice_month text;
    v_month_offset int;
    
    -- Configurações gerais
    v_html_body text;
    v_edge_url text := 'https://kwdweztilsoxxcgudtsz.supabase.co/functions/v1/send-notification-email';
    v_service_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3ZHdlenRpbHNveHhjZ3VkdHN6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDEzMjY3NywiZXhwIjoyMDU5NzA4Njc3fQ.1iKIZqSUyo5VCqFvdJl-ZLdCsXZVmmwnFKA-9zGtA';
    v_req_id bigint;
    v_account_icon text;
    v_color text;
    v_dest_account_name text;
    v_period_label text;
    v_today date;
BEGIN
    v_today := (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::date;

    FOR v_user IN 
        SELECT p.id, p.name, p.email, p.plano, p.due_email_notify_enabled, p.due_email_notify_day_of_week, p.card_invoice_email_notify_enabled, p.push_notifications_disabled
        FROM public.profiles p
        WHERE p.email IS NOT NULL AND p.deleted_at IS NULL
    LOOP
        -- Busca a configuração de e-mail do plano do usuário na tabela de planos
        SELECT email_notification_enabled, email_notification_frequency
        INTO v_enabled, v_frequency
        FROM public.plans
        WHERE slug = v_user.plano::text;

        -- Se a funcionalidade de e-mail não estiver ativada para o plano do usuário, pula
        IF NOT COALESCE(v_enabled, FALSE) THEN
            CONTINUE;
        END IF;

        v_frequency := COALESCE(v_frequency, 'daily');

        -- =====================================================================
        -- CASO 1: PLANO SEMANAL (Ex: Básico) - APENAS E-MAIL SEMANAL
        -- =====================================================================
        IF v_frequency = 'weekly' THEN
            -- Verifica se o envio de e-mails de contas está ativado nas preferências do usuário
            IF NOT COALESCE(v_user.due_email_notify_enabled, FALSE) THEN
                CONTINUE;
            END IF;

            -- Verifica se hoje coincide com o dia da semana preferido (0 = Domingo, 1 = Segunda, etc.)
            v_is_correct_day := EXTRACT(ISODOW FROM (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')) = CASE WHEN v_user.due_email_notify_day_of_week = 0 THEN 7 ELSE v_user.due_email_notify_day_of_week END;
            
            IF NOT v_is_correct_day THEN
                CONTINUE;
            END IF;

            -- Define horizonte temporal de 7 dias
            v_start_date := v_today;
            v_end_date := v_start_date + 6;
            v_subject := 'Resumo Semanal de Contas a Vencer - Recebimento $mart';
            v_period_label := 'nesta semana (próximos 7 dias)';

            v_account_section := '';
            v_total_tx_count := 0;

            -- Loop por cada conta checking/savings/investment do usuário
            FOR v_account IN
                SELECT id, name, type
                FROM public.financial_accounts
                WHERE user_id = v_user.id
                  AND is_active = true
                  AND type IN ('checking', 'savings', 'investment')
                ORDER BY 
                    CASE type WHEN 'checking' THEN 1 WHEN 'savings' THEN 2 WHEN 'investment' THEN 3 END,
                    name
            LOOP
                v_account_rows := '';
                v_account_tx_count := 0;

                v_account_icon := CASE v_account.type
                    WHEN 'checking' THEN '🏦'
                    WHEN 'savings' THEN '🐷'
                    WHEN 'investment' THEN '📈'
                    ELSE '💰'
                END;

                -- 1. Lançamentos normais pendentes nesta conta no período semanal
                FOR v_tx IN
                    SELECT ft.description, ft.type, ft.amount, ft.date
                    FROM public.financial_transactions ft
                    WHERE ft.user_id = v_user.id
                      AND ft.status = 'pending'
                      AND ft.date::date >= v_start_date
                      AND ft.date::date <= v_end_date
                      AND ft.account_id = v_account.id
                      AND ft.type IN ('income', 'expense')
                    ORDER BY ft.date ASC
                LOOP
                    v_account_tx_count := v_account_tx_count + 1;
                    v_color := CASE WHEN v_tx.type = 'income' THEN '#16a34a' ELSE '#dc2626' END;

                    v_account_rows := v_account_rows || '
                    <tr>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 13px;">' || COALESCE(v_tx.description, 'Sem descrição') || '</td>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: ' || v_color || '; font-size: 13px; white-space: nowrap;">' ||
                            CASE WHEN v_tx.type = 'expense' THEN '- ' ELSE '+ ' END ||
                            'R$ ' || to_char(v_tx.amount, 'FM999G999G990D00') || '</td>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px; white-space: nowrap;">' || to_char(v_tx.date::date, 'DD/MM/YYYY') || '</td>
                    </tr>';
                END LOOP;

                -- 2. Transferências pendentes saindo da conta no período semanal
                FOR v_tx IN
                    SELECT ft.description, ft.amount, ft.date, ft.destination_account_id,
                           da.name AS dest_name
                    FROM public.financial_transactions ft
                    LEFT JOIN public.financial_accounts da ON ft.destination_account_id = da.id
                    WHERE ft.user_id = v_user.id
                      AND ft.status = 'pending'
                      AND ft.date::date >= v_start_date
                      AND ft.date::date <= v_end_date
                      AND ft.account_id = v_account.id
                      AND ft.type = 'transfer'
                    ORDER BY ft.date ASC
                LOOP
                    v_account_tx_count := v_account_tx_count + 1;
                    v_dest_account_name := COALESCE(v_tx.dest_name, 'Outra conta');

                    v_account_rows := v_account_rows || '
                    <tr>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 13px;">' || COALESCE(v_tx.description, 'Transferência') || ' <span style="color: #94a3b8; font-size: 11px;">→ ' || v_dest_account_name || '</span></td>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: #dc2626; font-size: 13px; white-space: nowrap;">- R$ ' || to_char(v_tx.amount, 'FM999G999G990D00') || '</td>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px; white-space: nowrap;">' || to_char(v_tx.date::date, 'DD/MM/YYYY') || '</td>
                    </tr>';
                END LOOP;

                -- 3. Transferências pendentes entrando na conta no período semanal
                FOR v_tx IN
                    SELECT ft.description, ft.amount, ft.date, ft.account_id AS origin_account_id,
                           oa.name AS origin_name
                    FROM public.financial_transactions ft
                    LEFT JOIN public.financial_accounts oa ON ft.account_id = oa.id
                    WHERE ft.user_id = v_user.id
                      AND ft.status = 'pending'
                      AND ft.date::date >= v_start_date
                      AND ft.date::date <= v_end_date
                      AND ft.destination_account_id = v_account.id
                      AND ft.type = 'transfer'
                    ORDER BY ft.date ASC
                LOOP
                    v_account_tx_count := v_account_tx_count + 1;

                    v_account_rows := v_account_rows || '
                    <tr>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 13px;">' || COALESCE(v_tx.description, 'Transferência') || ' <span style="color: #94a3b8; font-size: 11px;">← ' || COALESCE(v_tx.origin_name, 'Outra conta') || '</span></td>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: #16a34a; font-size: 13px; white-space: nowrap;">+ R$ ' || to_char(v_tx.amount, 'FM999G999G990D00') || '</td>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px; white-space: nowrap;">' || to_char(v_tx.date::date, 'DD/MM/YYYY') || '</td>
                    </tr>';
                END LOOP;

                -- 4. Faturas de cartão de crédito vinculadas a esta conta que vencem no período semanal
                FOR v_card IN
                    SELECT c.id AS card_id, c.name AS card_name, d.due_date, to_char(d.due_date, 'YYYY-MM') AS card_invoice_month
                    FROM public.financial_accounts c
                    CROSS JOIN LATERAL (
                        SELECT generate_series(v_start_date, v_end_date, '1 day'::interval)::date AS due_date
                    ) d
                    WHERE c.user_id = v_user.id
                      AND c.type = 'credit_card'
                      AND c.is_active = true
                      AND c.invoice_payment_account_id = v_account.id
                      AND (
                          extract(day from d.due_date) = c.due_day
                          OR (c.due_day > 28 AND d.due_date = (date_trunc('month', d.due_date) + interval '1 month' - interval '1 day')::date)
                      )
                LOOP
                    -- Calcula total da fatura
                    SELECT COALESCE(SUM(amount), 0) INTO v_card_total
                    FROM public.financial_transactions
                    WHERE user_id = v_user.id
                      AND account_id = v_card.card_id
                      AND invoice_month = v_card.card_invoice_month
                      AND type = 'expense'
                      AND status <> 'cancelled';

                    -- Verifica se já foi paga por uma transferência de débito de fatura
                    SELECT EXISTS(
                        SELECT 1
                        FROM public.financial_transactions
                        WHERE user_id = v_user.id
                          AND destination_account_id = v_card.card_id
                          AND type = 'transfer'
                          AND invoice_month = v_card.card_invoice_month
                          AND status <> 'cancelled'
                    ) INTO v_card_is_paid;

                    -- Se tiver gastos e não estiver paga, inclui junto às contas
                    IF v_card_total > 0 AND NOT v_card_is_paid THEN
                        v_account_tx_count := v_account_tx_count + 1;
                        v_account_rows := v_account_rows || '
                        <tr>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 13px;">Fatura ' || COALESCE(v_card.card_name, 'Cartão') || '</td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: #dc2626; font-size: 13px; white-space: nowrap;">- R$ ' || to_char(v_card_total, 'FM999G999G990D00') || '</td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px; white-space: nowrap;">' || to_char(v_card.due_date, 'DD/MM/YYYY') || '</td>
                        </tr>';
                    END IF;
                END LOOP;

                -- Se tiver lançamentos nesta conta, monta o bloco visual
                IF v_account_tx_count > 0 THEN
                    v_total_tx_count := v_total_tx_count + v_account_tx_count;

                    v_account_section := v_account_section || '
                    <div style="background-color: #f8fafc; border-radius: 12px; padding: 16px; border: 1px solid #e2e8f0; margin-bottom: 16px;">
                        <div style="font-weight: bold; color: #0f172a; font-size: 14px; margin-bottom: 12px;">
                            ' || v_account_icon || ' ' || v_account.name || '
                        </div>
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr>
                                    <th style="padding: 8px 12px; text-align: left; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Descrição</th>
                                    <th style="padding: 8px 12px; text-align: right; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Valor</th>
                                    <th style="padding: 8px 12px; text-align: center; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Vencimento</th>
                                </tr>
                            </thead>
                            <tbody>
                                ' || v_account_rows || '
                            </tbody>
                        </table>
                    </div>';
                END IF;
            END LOOP;

            -- 5. Faturas de cartões de crédito não vinculados a nenhuma conta bancária
            v_card_section := '';
            FOR v_card IN
                SELECT c.id AS card_id, c.name AS card_name, d.due_date, to_char(d.due_date, 'YYYY-MM') AS card_invoice_month
                FROM public.financial_accounts c
                CROSS JOIN LATERAL (
                    SELECT generate_series(v_start_date, v_end_date, '1 day'::interval)::date AS due_date
                ) d
                WHERE c.user_id = v_user.id
                  AND c.type = 'credit_card'
                  AND c.is_active = true
                  AND c.invoice_payment_account_id IS NULL
                  AND (
                      extract(day from d.due_date) = c.due_day
                      OR (c.due_day > 28 AND d.due_date = (date_trunc('month', d.due_date) + interval '1 month' - interval '1 day')::date)
                  )
            LOOP
                SELECT COALESCE(SUM(amount), 0) INTO v_card_total
                FROM public.financial_transactions
                WHERE user_id = v_user.id
                  AND account_id = v_card.card_id
                  AND invoice_month = v_card.card_invoice_month
                  AND type = 'expense'
                  AND status <> 'cancelled';

                SELECT EXISTS(
                    SELECT 1
                    FROM public.financial_transactions
                    WHERE user_id = v_user.id
                      AND destination_account_id = v_card.card_id
                      AND type = 'transfer'
                      AND invoice_month = v_card.card_invoice_month
                      AND status <> 'cancelled'
                ) INTO v_card_is_paid;

                IF v_card_total > 0 AND NOT v_card_is_paid THEN
                    v_total_tx_count := v_total_tx_count + 1;
                    v_card_section := v_card_section || '
                    <tr>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 13px;">Fatura ' || COALESCE(v_card.card_name, 'Cartão') || '</td>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: #dc2626; font-size: 13px; white-space: nowrap;">- R$ ' || to_char(v_card_total, 'FM999G999G990D00') || '</td>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px; white-space: nowrap;">' || to_char(v_card.due_date, 'DD/MM/YYYY') || '</td>
                    </tr>';
                END IF;
            END LOOP;

            -- Se houver cartões sem conta vinculada no período semanal, monta a seção
            IF v_card_section <> '' THEN
                v_account_section := v_account_section || '
                <div style="background-color: #f8fafc; border-radius: 12px; padding: 16px; border: 1px solid #e2e8f0; margin-bottom: 16px;">
                    <div style="font-weight: bold; color: #0f172a; font-size: 14px; margin-bottom: 12px;">
                        💳 Cartões de Crédito (Sem conta vinculada)
                    </div>
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr>
                                <th style="padding: 8px 12px; text-align: left; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Fatura</th>
                                <th style="padding: 8px 12px; text-align: right; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Valor</th>
                                <th style="padding: 8px 12px; text-align: center; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Vencimento</th>
                            </tr>
                        </thead>
                        <tbody>
                            ' || v_card_section || '
                        </tbody>
                    </table>
                </div>';
            END IF;

            -- Se o usuário tiver contas pendentes no consolidado semanal, dispara o e-mail
            IF v_total_tx_count > 0 THEN
                v_html_body := '
                <!DOCTYPE html>
                <html lang="pt-BR">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                </head>
                <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f1f5f9;">
                    <div style="max-width: 600px; margin: 30px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
                        <!-- Header com Logo -->
                        <div style="background-color: #0f172a; padding: 24px; text-align: center; border-bottom: 3px solid #14b8a6;">
                            <div style="margin-bottom: 12px;">
                                <img src="https://recebimentosmart.com.br/images/logo.svg" alt="R$" style="height: 40px; width: 40px; border-radius: 8px;">
                            </div>
                            <div style="font-size: 20px; font-weight: bold; letter-spacing: -0.5px;">
                                <span style="color: #ffffff;">Recebimento </span><span style="color: #14b8a6;">$mart</span>
                            </div>
                            <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1);">
                                <h1 style="color: #ffffff; margin: 0; font-size: 18px; font-weight: bold; letter-spacing: 0.3px;">Seu Resumo Semanal Financeiro</h1>
                                <p style="color: #94a3b8; margin: 4px 0 0 0; font-size: 12px;">Acompanhe suas contas pendentes e mantenha seu fluxo saudável</p>
                            </div>
                        </div>
                        
                        <!-- Content -->
                        <div style="padding: 24px; color: #334155; line-height: 1.6;">
                            <p style="font-size: 15px; font-weight: bold; color: #1e293b; margin-top: 0;">Olá, ' || COALESCE(v_user.name, 'Usuário') || '!</p>
                            <p style="font-size: 13px; color: #64748b; margin-bottom: 24px;">
                                Identificamos <strong>' || v_total_tx_count || '</strong> lançamento(s) pendente(s) com vencimento ' || v_period_label || '. Veja o resumo por conta:
                            </p>

                            ' || v_account_section || '
                            
                            <div style="text-align: center; margin-top: 28px;">
                                <a href="https://recebimentosmart.com.br/dashboard" style="display: inline-block; padding: 12px 28px; background-color: #14b8a6; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 13px; box-shadow: 0 4px 6px rgba(20, 184, 166, 0.2);">Acessar Meu Painel Financeiro</a>
                            </div>
                        </div>
                        
                        <!-- Footer -->
                        <div style="text-align: center; padding: 20px; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; background-color: #f8fafc;">
                            <p style="margin: 0;">Recebimento $mart &copy; ' || EXTRACT(YEAR FROM CURRENT_DATE) || ' • Todos os direitos reservados.</p>
                            <p style="font-size: 10px; margin-top: 5px;">Você está recebendo este e-mail devido às configurações de alertas do seu plano <strong>' || COALESCE(v_user.plano::text, 'ativo') || '</strong>.</p>
                        </div>
                    </div>
                </body>
                </html>';

                -- Invoca a Edge Function de envio de e-mails
                SELECT net.http_post(
                    url := v_edge_url,
                    headers := jsonb_build_object(
                        'Content-Type', 'application/json',
                        'Authorization', 'Bearer ' || v_service_key
                    ),
                    body := jsonb_build_object(
                        'recipientEmail', v_user.email,
                        'subject', v_subject,
                        'htmlContent', v_html_body
                    )
                ) INTO v_req_id;
                
                PERFORM pg_sleep(0.1);
            END IF;

        -- =====================================================================
        -- CASO 2: PLANO DIÁRIO (Ex: Pró/Premium) - ENVIA DIÁRIO + PUSH NOTIFICATION
        -- =====================================================================
        ELSE
            -- 2a. E-mail diário de contas a vencer hoje (se ativado pelo usuário nas preferências)
            IF COALESCE(v_user.due_email_notify_enabled, FALSE) THEN
                v_start_date := v_today;
                v_end_date := v_start_date;
                v_subject := 'Contas a Vencer Hoje - Recebimento $mart';
                v_period_label := 'hoje';

                v_account_section := '';
                v_total_tx_count := 0;

                -- Loop por cada conta checking/savings/investment do usuário
                FOR v_account IN
                    SELECT id, name, type
                    FROM public.financial_accounts
                    WHERE user_id = v_user.id
                      AND is_active = true
                      AND type IN ('checking', 'savings', 'investment')
                    ORDER BY 
                        CASE type WHEN 'checking' THEN 1 WHEN 'savings' THEN 2 WHEN 'investment' THEN 3 END,
                        name
                LOOP
                    v_account_rows := '';
                    v_account_tx_count := 0;

                    v_account_icon := CASE v_account.type
                        WHEN 'checking' THEN '🏦'
                        WHEN 'savings' THEN '🐷'
                        WHEN 'investment' THEN '📈'
                        ELSE '💰'
                    END;

                    -- 1. Lançamentos normais pendentes nesta conta vencendo hoje
                    FOR v_tx IN
                        SELECT ft.description, ft.type, ft.amount, ft.date
                        FROM public.financial_transactions ft
                        WHERE ft.user_id = v_user.id
                          AND ft.status = 'pending'
                          AND ft.date::date >= v_start_date
                          AND ft.date::date <= v_end_date
                          AND ft.account_id = v_account.id
                          AND ft.type IN ('income', 'expense')
                        ORDER BY ft.date ASC
                    LOOP
                        v_account_tx_count := v_account_tx_count + 1;
                        v_color := CASE WHEN v_tx.type = 'income' THEN '#16a34a' ELSE '#dc2626' END;

                        v_account_rows := v_account_rows || '
                        <tr>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 13px;">' || COALESCE(v_tx.description, 'Sem descrição') || '</td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: ' || v_color || '; font-size: 13px; white-space: nowrap;">' ||
                                CASE WHEN v_tx.type = 'expense' THEN '- ' ELSE '+ ' END ||
                                'R$ ' || to_char(v_tx.amount, 'FM999G999G990D00') || '</td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px; white-space: nowrap;">' || to_char(v_tx.date::date, 'DD/MM/YYYY') || '</td>
                        </tr>';
                    END LOOP;

                    -- 2. Transferências pendentes saindo da conta hoje
                    FOR v_tx IN
                        SELECT ft.description, ft.amount, ft.date, ft.destination_account_id,
                               da.name AS dest_name
                        FROM public.financial_transactions ft
                        LEFT JOIN public.financial_accounts da ON ft.destination_account_id = da.id
                        WHERE ft.user_id = v_user.id
                          AND ft.status = 'pending'
                          AND ft.date::date >= v_start_date
                          AND ft.date::date <= v_end_date
                          AND ft.account_id = v_account.id
                          AND ft.type = 'transfer'
                        ORDER BY ft.date ASC
                    LOOP
                        v_account_tx_count := v_account_tx_count + 1;
                        v_dest_account_name := COALESCE(v_tx.dest_name, 'Outra conta');

                        v_account_rows := v_account_rows || '
                        <tr>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 13px;">' || COALESCE(v_tx.description, 'Transferência') || ' <span style="color: #94a3b8; font-size: 11px;">→ ' || v_dest_account_name || '</span></td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: #dc2626; font-size: 13px; white-space: nowrap;">- R$ ' || to_char(v_tx.amount, 'FM999G999G990D00') || '</td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px; white-space: nowrap;">' || to_char(v_tx.date::date, 'DD/MM/YYYY') || '</td>
                        </tr>';
                    END LOOP;

                    -- 3. Transferências pendentes entrando na conta hoje
                    FOR v_tx IN
                        SELECT ft.description, ft.amount, ft.date, ft.account_id AS origin_account_id,
                               oa.name AS origin_name
                        FROM public.financial_transactions ft
                        LEFT JOIN public.financial_accounts oa ON ft.account_id = oa.id
                        WHERE ft.user_id = v_user.id
                          AND ft.status = 'pending'
                          AND ft.date::date >= v_start_date
                          AND ft.date::date <= v_end_date
                          AND ft.destination_account_id = v_account.id
                          AND ft.type = 'transfer'
                        ORDER BY ft.date ASC
                    LOOP
                        v_account_tx_count := v_account_tx_count + 1;

                        v_account_rows := v_account_rows || '
                        <tr>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 13px;">' || COALESCE(v_tx.description, 'Transferência') || ' <span style="color: #94a3b8; font-size: 11px;">← ' || COALESCE(v_tx.origin_name, 'Outra conta') || '</span></td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: #16a34a; font-size: 13px; white-space: nowrap;">+ R$ ' || to_char(v_tx.amount, 'FM999G999G990D00') || '</td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px; white-space: nowrap;">' || to_char(v_tx.date::date, 'DD/MM/YYYY') || '</td>
                        </tr>';
                    END LOOP;

                    -- Se tiver lançamentos nesta conta, monta o bloco visual
                    IF v_account_tx_count > 0 THEN
                        v_total_tx_count := v_total_tx_count + v_account_tx_count;

                        v_account_section := v_account_section || '
                        <div style="background-color: #f8fafc; border-radius: 12px; padding: 16px; border: 1px solid #e2e8f0; margin-bottom: 16px;">
                            <div style="font-weight: bold; color: #0f172a; font-size: 14px; margin-bottom: 12px;">
                                ' || v_account_icon || ' ' || v_account.name || '
                            </div>
                            <table style="width: 100%; border-collapse: collapse;">
                                <thead>
                                    <tr>
                                        <th style="padding: 8px 12px; text-align: left; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Descrição</th>
                                        <th style="padding: 8px 12px; text-align: right; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Valor</th>
                                        <th style="padding: 8px 12px; text-align: center; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Vencimento</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ' || v_account_rows || '
                                </tbody>
                            </table>
                        </div>';
                    END IF;
                END LOOP;

                -- Se tiver contas vencendo hoje, dispara o e-mail E notificação push
                IF v_total_tx_count > 0 THEN
                    v_html_body := '
                    <!DOCTYPE html>
                    <html lang="pt-BR">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    </head>
                    <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f1f5f9;">
                        <div style="max-width: 600px; margin: 30px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
                            <!-- Header com Logo -->
                            <div style="background-color: #0f172a; padding: 24px; text-align: center; border-bottom: 3px solid #14b8a6;">
                                <div style="margin-bottom: 12px;">
                                    <img src="https://recebimentosmart.com.br/images/logo.svg" alt="R$" style="height: 40px; width: 40px; border-radius: 8px;">
                                </div>
                                <div style="font-size: 20px; font-weight: bold; letter-spacing: -0.5px;">
                                    <span style="color: #ffffff;">Recebimento </span><span style="color: #14b8a6;">$mart</span>
                                </div>
                                <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1);">
                                    <h1 style="color: #ffffff; margin: 0; font-size: 18px; font-weight: bold; letter-spacing: 0.3px;">Contas a Vencer Hoje</h1>
                                    <p style="color: #94a3b8; margin: 4px 0 0 0; font-size: 12px;">Acompanhe suas contas pendentes e mantenha seu fluxo saudável</p>
                                </div>
                            </div>
                            
                            <!-- Content -->
                            <div style="padding: 24px; color: #334155; line-height: 1.6;">
                                <p style="font-size: 15px; font-weight: bold; color: #1e293b; margin-top: 0;">Olá, ' || COALESCE(v_user.name, 'Usuário') || '!</p>
                                <p style="font-size: 13px; color: #64748b; margin-bottom: 24px;">
                                    Identificamos <strong>' || v_total_tx_count || '</strong> lançamento(s) pendente(s) com vencimento hoje. Veja o resumo por conta:
                                </p>

                                ' || v_account_section || '
                                
                                <div style="text-align: center; margin-top: 28px;">
                                    <a href="https://recebimentosmart.com.br/dashboard" style="display: inline-block; padding: 12px 28px; background-color: #14b8a6; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 13px; box-shadow: 0 4px 6px rgba(20, 184, 166, 0.2);">Acessar Meu Painel Financeiro</a>
                                </div>
                            </div>
                            
                            <!-- Footer -->
                            <div style="text-align: center; padding: 20px; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; background-color: #f8fafc;">
                                <p style="margin: 0;">Recebimento $mart &copy; ' || EXTRACT(YEAR FROM CURRENT_DATE) || ' • Todos os direitos reservados.</p>
                                <p style="font-size: 10px; margin-top: 5px;">Você está recebendo este e-mail devido às configurações de alertas do seu plano <strong>' || COALESCE(v_user.plano::text, 'ativo') || '</strong>.</p>
                            </div>
                        </div>
                    </body>
                    </html>';

                    -- Invoca a Edge Function de envio de e-mails
                    SELECT net.http_post(
                        url := v_edge_url,
                        headers := jsonb_build_object(
                            'Content-Type', 'application/json',
                            'Authorization', 'Bearer ' || v_service_key
                        ),
                        body := jsonb_build_object(
                            'recipientEmail', v_user.email,
                            'subject', v_subject,
                            'htmlContent', v_html_body
                        )
                    ) INTO v_req_id;
                    
                    -- Dispara Notificação Push para o usuário
                    PERFORM public.send_push_notification(
                        v_user.id,
                        'Contas a Vencer Hoje',
                        'Você possui ' || v_total_tx_count || ' conta(s) pendente(s) vencendo hoje. Acesse o sistema.',
                        jsonb_build_object('url', '/dashboard')
                    );
                    
                    PERFORM pg_sleep(0.1);
                END IF;
            END IF;

            -- 2b. E-mail de fechamento da fatura do cartão de crédito (se ativado pelo usuário nas preferências)
            IF COALESCE(v_user.card_invoice_email_notify_enabled, FALSE) THEN
                -- Loop pelos cartões ativos do usuário
                FOR v_card IN
                    SELECT id, name, due_day, closing_days_before
                    FROM public.financial_accounts
                    WHERE user_id = v_user.id
                      AND type = 'credit_card'
                      AND is_active = true
                LOOP
                    -- Verifica se hoje é a data de fechamento, analisando uma janela de -1 a +1 meses
                    FOR v_month_offset IN -1..1 LOOP
                        v_due_date := (date_trunc('month', v_today + (v_month_offset * INTERVAL '1 month'))::date + (LEAST(v_card.due_day, 28) - 1) * INTERVAL '1 day')::date;
                        v_closing_date := (v_due_date - (v_card.closing_days_before * INTERVAL '1 day'))::date;
                        
                        -- Se hoje coincide com a data de fechamento calculada
                        IF v_closing_date = v_today THEN
                            v_card_invoice_month := to_char(v_due_date, 'YYYY-MM');

                            -- Calcula total acumulado da fatura fechada
                            SELECT COALESCE(SUM(amount), 0) INTO v_card_total
                            FROM public.financial_transactions
                               WHERE user_id = v_user.id
                              AND account_id = v_card.id
                              AND invoice_month = v_card_invoice_month
                              AND type = 'expense'
                              AND status <> 'cancelled';

                            -- Dispara e-mail se houver gastos na fatura fechada
                            IF v_card_total > 0 THEN
                                v_subject := 'Fatura Fechada: ' || v_card.name || ' - Recebimento $mart';
                                
                                v_html_body := '
                                <!DOCTYPE html>
                                <html lang="pt-BR">
                                <head>
                                    <meta charset="UTF-8">
                                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                                </head>
                                <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f1f5f9;">
                                    <div style="max-width: 600px; margin: 30px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
                                        <!-- Header com Logo -->
                                        <div style="background-color: #0f172a; padding: 24px; text-align: center; border-bottom: 3px solid #14b8a6;">
                                            <div style="margin-bottom: 12px;">
                                                <img src="https://recebimentosmart.com.br/images/logo.svg" alt="R$" style="height: 40px; width: 40px; border-radius: 8px;">
                                            </div>
                                            <div style="font-size: 20px; font-weight: bold; letter-spacing: -0.5px;">
                                                <span style="color: #ffffff;">Recebimento </span><span style="color: #14b8a6;">$mart</span>
                                            </div>
                                            <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1);">
                                                <h1 style="color: #ffffff; margin: 0; font-size: 18px; font-weight: bold; letter-spacing: 0.3px;">Fatura Fechada</h1>
                                                <p style="color: #94a3b8; margin: 4px 0 0 0; font-size: 12px;">A fatura do seu cartão de crédito fechou e está disponível</p>
                                            </div>
                                        </div>
                                        
                                        <!-- Content -->
                                        <div style="padding: 24px; color: #334155; line-height: 1.6;">
                                            <p style="font-size: 15px; font-weight: bold; color: #1e293b; margin-top: 0;">Olá, ' || COALESCE(v_user.name, 'Usuário') || '!</p>
                                            <p style="font-size: 13px; color: #64748b; margin-bottom: 24px;">
                                                Informamos que a fatura do seu cartão <strong>' || COALESCE(v_card.name, 'Cartão') || '</strong> fechou hoje e já está disponível para visualização e pagamento. Veja os detalhes abaixo:
                                            </p>

                                            <div style="background-color: #f8fafc; border-radius: 12px; padding: 20px; border: 1px solid #e2e8f0; margin-bottom: 24px; text-align: center;">
                                                <div style="font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; font-weight: bold; margin-bottom: 4px;">Valor Total Fechado</div>
                                                <div style="font-size: 28px; font-weight: 800; color: #0f172a; margin-bottom: 12px;">R$ ' || to_char(v_card_total, 'FM999G999G990D00') || '</div>
                                                <div style="display: inline-block; padding: 4px 12px; background-color: #fef3c7; color: #d97706; font-size: 11px; font-weight: bold; border-radius: 9999px;">
                                                    Vence em ' || to_char(v_due_date, 'DD/MM/YYYY') || '
                                                </div>
                                            </div>

                                            <div style="text-align: center; margin-top: 28px;">
                                                <a href="https://recebimentosmart.com.br/dashboard" style="display: inline-block; padding: 12px 28px; background-color: #14b8a6; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 13px; box-shadow: 0 4px 6px rgba(20, 184, 166, 0.2);">Acessar Minhas Faturas</a>
                                            </div>
                                        </div>
                                        
                                        <!-- Footer -->
                                        <div style="text-align: center; padding: 20px; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; background-color: #f8fafc;">
                                            <p style="margin: 0;">Recebimento $mart &copy; ' || EXTRACT(YEAR FROM CURRENT_DATE) || ' • Todos os direitos reservados.</p>
                                            <p style="font-size: 10px; margin-top: 5px;">Você está recebendo este e-mail devido às configurações de alertas do seu plano <strong>' || COALESCE(v_user.plano::text, 'ativo') || '</strong>.</p>
                                        </div>
                                    </div>
                                </body>
                                </html>';

                                -- Invoca a Edge Function de envio de e-mails
                                SELECT net.http_post(
                                    url := v_edge_url,
                                    headers := jsonb_build_object(
                                        'Content-Type', 'application/json',
                                        'Authorization', 'Bearer ' || v_service_key
                                    ),
                                    body := jsonb_build_object(
                                        'recipientEmail', v_user.email,
                                        'subject', v_subject,
                                        'htmlContent', v_html_body
                                    )
                                ) INTO v_req_id;
                                
                                -- Dispara Notificação Push para o usuário
                                PERFORM public.send_push_notification(
                                    v_user.id,
                                    'Fatura Fechada: ' || v_card.name,
                                    'A fatura do seu cartão fechou no valor de R$ ' || to_char(v_card_total, 'FM999G999G990D00') || '. Vence em ' || to_char(v_due_date, 'DD/MM/YYYY') || '.',
                                    jsonb_build_object('url', '/dashboard')
                                );

                                PERFORM pg_sleep(0.1);
                            END IF;
                        END IF;
                    END LOOP;
                END LOOP;
            END IF;
        END IF;
    END LOOP;
END;
$$;
