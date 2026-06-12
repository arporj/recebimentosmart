-- =============================================================================
-- Migração: Corrige o envio de alertas de contas vencidas para recorrências encerradas
--   Adiciona o filtro para ignorar transações pendentes cuja data de encerramento da 
--   recorrência (recurrence_end_date) seja menor que a própria data da transação (date).
-- =============================================================================

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
    v_account_icon text;
    v_color text;
    v_dest_account_name text;
    v_period_label text;
    v_today date;
    v_has_overdue boolean;
    
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
BEGIN
    v_today := (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::date;

    FOR v_user IN 
        SELECT p.id, p.name, p.email, p.plano, p.due_email_notify_enabled, p.due_email_notify_day_of_week, p.card_invoice_email_notify_enabled
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
        -- CASO 1: PLANO SEMANAL (Ex: Básico)
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

            -- Verifica se há contas em atraso (pendente no passado, excluindo recorrentes já pagas/canceladas/encerradas)
            SELECT EXISTS (
                SELECT 1 
                FROM public.financial_transactions ft
                WHERE ft.user_id = v_user.id
                  AND ft.status = 'pending'
                  AND (ft.recurrence_end_date IS NULL OR ft.recurrence_end_date >= ft.date::date)
                  AND ft.date::date < v_today
                  AND ft.type IN ('income', 'expense', 'transfer')
                  AND (
                    NOT (ft.recurrence_enabled = true AND ft.parent_id IS NULL)
                    OR NOT EXISTS (
                      SELECT 1 
                      FROM public.financial_transactions child
                      WHERE child.parent_id = ft.id
                        AND child.status IN ('paid', 'cancelled')
                        AND (
                          child.date = ft.date 
                          OR child.installment_current = ft.installment_current
                          OR (EXTRACT(MONTH FROM child.date) = EXTRACT(MONTH FROM ft.date) AND EXTRACT(YEAR FROM child.date) = EXTRACT(YEAR FROM ft.date))
                        )
                    )
                  )
            ) INTO v_has_overdue;

            IF v_has_overdue THEN
                v_start_date := v_today - 365;
                v_end_date := v_today - 1;
                v_subject := 'Contas em Atraso - Recebimento $mart';
                v_period_label := 'em atraso';
            ELSE
                -- Define horizonte temporal de 7 dias
                v_start_date := v_today;
                v_end_date := v_start_date + 6;
                v_subject := 'Resumo Semanal de Contas a Vencer - Recebimento $mart';
                v_period_label := 'nesta semana (próximos 7 dias)';
            END IF;

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
                      AND (ft.recurrence_end_date IS NULL OR ft.recurrence_end_date >= ft.date::date)
                      AND ft.date::date >= v_start_date
                      AND ft.date::date <= v_end_date
                      AND ft.account_id = v_account.id
                      AND ft.type IN ('income', 'expense')
                      AND (
                        NOT (ft.recurrence_enabled = true AND ft.parent_id IS NULL)
                        OR NOT EXISTS (
                          SELECT 1 
                          FROM public.financial_transactions child
                          WHERE child.parent_id = ft.id
                            AND child.status IN ('paid', 'cancelled')
                            AND (
                              child.date = ft.date 
                              OR child.installment_current = ft.installment_current
                              OR (EXTRACT(MONTH FROM child.date) = EXTRACT(MONTH FROM ft.date) AND EXTRACT(YEAR FROM child.date) = EXTRACT(YEAR FROM ft.date))
                            )
                        )
                      )
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
                      AND (ft.recurrence_end_date IS NULL OR ft.recurrence_end_date >= ft.date::date)
                      AND ft.date::date >= v_start_date
                      AND ft.date::date <= v_end_date
                      AND ft.account_id = v_account.id
                      AND ft.type = 'transfer'
                      AND (
                        NOT (ft.recurrence_enabled = true AND ft.parent_id IS NULL)
                        OR NOT EXISTS (
                          SELECT 1 
                          FROM public.financial_transactions child
                          WHERE child.parent_id = ft.id
                            AND child.status IN ('paid', 'cancelled')
                            AND (
                              child.date = ft.date 
                              OR child.installment_current = ft.installment_current
                              OR (EXTRACT(MONTH FROM child.date) = EXTRACT(MONTH FROM ft.date) AND EXTRACT(YEAR FROM child.date) = EXTRACT(YEAR FROM ft.date))
                            )
                        )
                      )
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
                      AND (ft.recurrence_end_date IS NULL OR ft.recurrence_end_date >= ft.date::date)
                      AND ft.date::date >= v_start_date
                      AND ft.date::date <= v_end_date
                      AND ft.destination_account_id = v_account.id
                      AND ft.type = 'transfer'
                      AND (
                        NOT (ft.recurrence_enabled = true AND ft.parent_id IS NULL)
                        OR NOT EXISTS (
                          SELECT 1 
                          FROM public.financial_transactions child
                          WHERE child.parent_id = ft.id
                            AND child.status IN ('paid', 'cancelled')
                            AND (
                              child.date = ft.date 
                              OR child.installment_current = ft.installment_current
                              OR (EXTRACT(MONTH FROM child.date) = EXTRACT(MONTH FROM ft.date) AND EXTRACT(YEAR FROM child.date) = EXTRACT(YEAR FROM ft.date))
                            )
                        )
                      )
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
                        <!-- Header com Logo Lateral (Compacto) -->
                        <div style="background-color: #0f172a; padding: 16px 24px; border-bottom: 3px solid #0d9488;">
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td style="vertical-align: middle; width: 36px; padding: 0;">
                                        <img src="https://recebimentosmart.com.br/images/logo.svg" alt="R$" style="height: 28px; width: 28px; border-radius: 6px; display: block;">
                                    </td>
                                    <td style="vertical-align: middle; padding: 0 0 0 8px;">
                                        <div style="font-size: 18px; font-weight: bold; color: #ffffff; letter-spacing: -0.5px; line-height: 1.2;">
                                            Recebimento <span style="color: #0d9488;">$mart</span>
                                        </div>
                                    </td>
                                    <td style="vertical-align: middle; text-align: right; padding: 0;">
                                        <div style="font-size: 11px; font-weight: bold; color: #ffffff; letter-spacing: 0.5px; line-height: 1.2; text-transform: uppercase;">
                                            ' || CASE WHEN v_has_overdue THEN 'Contas em Atraso' ELSE 'Resumo Semanal' END || '
                                        </div>
                                    </td>
                                </tr>
                            </table>
                        </div>
                        
                        <!-- Content -->
                        <div style="padding: 24px; color: #334155; line-height: 1.6;">
                            <p style="font-size: 15px; font-weight: bold; color: #1e293b; margin-top: 0;">Olá, ' || COALESCE(v_user.name, 'Usuário') || '!</p>
                            <p style="font-size: 13px; color: #64748b; margin-bottom: 24px;">
                                Identificamos <strong>' || v_total_tx_count || '</strong> lançamento(s) pendente(s) ' || v_period_label || '. Veja o resumo por conta:
                            </p>

                            ' || v_account_section || '
                            
                            <div style="text-align: center; margin-top: 28px;">
                                <a href="https://recebimentosmart.com.br/dashboard" style="display: inline-block; padding: 12px 28px; background-color: #0d9488; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 13px; box-shadow: 0 4px 6px rgba(13, 148, 136, 0.2);">Acessar Meu Painel Financeiro</a>
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
        -- CASO 2: PLANO DIÁRIO (Ex: Pró/Premium)
        -- =====================================================================
        ELSE
            -- 2a. E-mail diário de contas a vencer hoje (se ativado pelo usuário nas preferências)
            IF COALESCE(v_user.due_email_notify_enabled, FALSE) THEN
                -- Verifica se há contas em atraso (pendente no passado, excluindo recorrentes já pagas/canceladas/encerradas)
                SELECT EXISTS (
                    SELECT 1 
                    FROM public.financial_transactions ft
                    WHERE ft.user_id = v_user.id
                      AND ft.status = 'pending'
                      AND (ft.recurrence_end_date IS NULL OR ft.recurrence_end_date >= ft.date::date)
                      AND ft.date::date < v_today
                      AND ft.type IN ('income', 'expense', 'transfer')
                      AND (
                        NOT (ft.recurrence_enabled = true AND ft.parent_id IS NULL)
                        OR NOT EXISTS (
                          SELECT 1 
                          FROM public.financial_transactions child
                          WHERE child.parent_id = ft.id
                            AND child.status IN ('paid', 'cancelled')
                            AND (
                              child.date = ft.date 
                              OR child.installment_current = ft.installment_current
                              OR (EXTRACT(MONTH FROM child.date) = EXTRACT(MONTH FROM ft.date) AND EXTRACT(YEAR FROM child.date) = EXTRACT(YEAR FROM ft.date))
                            )
                        )
                      )
                ) INTO v_has_overdue;

                IF v_has_overdue THEN
                    v_start_date := v_today - 365;
                    v_end_date := v_today - 1;
                    v_subject := 'Contas em Atraso - Recebimento $mart';
                    v_period_label := 'em atraso';
                ELSE
                    v_start_date := v_today;
                    v_end_date := v_start_date;
                    v_subject := 'Contas a Vencer Hoje - Recebimento $mart';
                    v_period_label := 'hoje';
                END IF;

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
                          AND (ft.recurrence_end_date IS NULL OR ft.recurrence_end_date >= ft.date::date)
                          AND ft.date::date >= v_start_date
                          AND ft.date::date <= v_end_date
                          AND ft.account_id = v_account.id
                          AND ft.type IN ('income', 'expense')
                          AND (
                            NOT (ft.recurrence_enabled = true AND ft.parent_id IS NULL)
                            OR NOT EXISTS (
                              SELECT 1 
                              FROM public.financial_transactions child
                              WHERE child.parent_id = ft.id
                                AND child.status IN ('paid', 'cancelled')
                                AND (
                                  child.date = ft.date 
                                  OR child.installment_current = ft.installment_current
                                  OR (EXTRACT(MONTH FROM child.date) = EXTRACT(MONTH FROM ft.date) AND EXTRACT(YEAR FROM child.date) = EXTRACT(YEAR FROM ft.date))
                                )
                            )
                          )
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
                          AND (ft.recurrence_end_date IS NULL OR ft.recurrence_end_date >= ft.date::date)
                          AND ft.date::date >= v_start_date
                          AND ft.date::date <= v_end_date
                          AND ft.account_id = v_account.id
                          AND ft.type = 'transfer'
                          AND (
                            NOT (ft.recurrence_enabled = true AND ft.parent_id IS NULL)
                            OR NOT EXISTS (
                              SELECT 1 
                              FROM public.financial_transactions child
                              WHERE child.parent_id = ft.id
                                AND child.status IN ('paid', 'cancelled')
                                AND (
                                  child.date = ft.date 
                                  OR child.installment_current = ft.installment_current
                                  OR (EXTRACT(MONTH FROM child.date) = EXTRACT(MONTH FROM ft.date) AND EXTRACT(YEAR FROM child.date) = EXTRACT(YEAR FROM ft.date))
                                )
                            )
                          )
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
                          AND (ft.recurrence_end_date IS NULL OR ft.recurrence_end_date >= ft.date::date)
                          AND ft.date::date >= v_start_date
                          AND ft.date::date <= v_end_date
                          AND ft.destination_account_id = v_account.id
                          AND ft.type = 'transfer'
                          AND (
                            NOT (ft.recurrence_enabled = true AND ft.parent_id IS NULL)
                            OR NOT EXISTS (
                              SELECT 1 
                              FROM public.financial_transactions child
                              WHERE child.parent_id = ft.id
                                AND child.status IN ('paid', 'cancelled')
                                AND (
                                  child.date = ft.date 
                                  OR child.installment_current = ft.installment_current
                                  OR (EXTRACT(MONTH FROM child.date) = EXTRACT(MONTH FROM ft.date) AND EXTRACT(YEAR FROM child.date) = EXTRACT(YEAR FROM ft.date))
                                )
                            )
                          )
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

                -- Se tiver contas vencendo hoje, dispara o e-mail
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
                            <!-- Header com Logo Lateral (Compacto) -->
                            <div style="background-color: #0f172a; padding: 16px 24px; border-bottom: 3px solid #0d9488;">
                                <table style="width: 100%; border-collapse: collapse;">
                                    <tr>
                                        <td style="vertical-align: middle; width: 36px; padding: 0;">
                                            <img src="https://recebimentosmart.com.br/images/logo.svg" alt="R$" style="height: 28px; width: 28px; border-radius: 6px; display: block;">
                                        </td>
                                        <td style="vertical-align: middle; padding: 0 0 0 8px;">
                                            <div style="font-size: 18px; font-weight: bold; color: #ffffff; letter-spacing: -0.5px; line-height: 1.2;">
                                                Recebimento <span style="color: #0d9488;">$mart</span>
                                            </div>
                                        </td>
                                        <td style="vertical-align: middle; text-align: right; padding: 0;">
                                            <div style="font-size: 11px; font-weight: bold; color: #ffffff; letter-spacing: 0.5px; line-height: 1.2; text-transform: uppercase;">
                                                ' || CASE WHEN v_has_overdue THEN 'Contas em Atraso' ELSE 'Contas Hoje' END || '
                                            </div>
                                        </td>
                                    </tr>
                                </table>
                            </div>
                            
                            <!-- Content -->
                            <div style="padding: 24px; color: #334155; line-height: 1.6;">
                                <p style="font-size: 15px; font-weight: bold; color: #1e293b; margin-top: 0;">Olá, ' || COALESCE(v_user.name, 'Usuário') || '!</p>
                                <p style="font-size: 13px; color: #64748b; margin-bottom: 24px;">
                                    Identificamos <strong>' || v_total_tx_count || '</strong> lançamento(s) pendente(s) ' || v_period_label || '. Veja o resumo por conta:
                                </p>

                                ' || v_account_section || '
                                
                                <div style="text-align: center; margin-top: 28px;">
                                    <a href="https://recebimentosmart.com.br/dashboard" style="display: inline-block; padding: 12px 28px; background-color: #0d9488; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 13px; box-shadow: 0 4px 6px rgba(13, 148, 136, 0.2);">Acessar Meu Painel Financeiro</a>
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
                                        <!-- Header com Logo Lateral (Compacto) -->
                                        <div style="background-color: #0f172a; padding: 16px 24px; border-bottom: 3px solid #0d9488;">
                                            <table style="width: 100%; border-collapse: collapse;">
                                                <tr>
                                                    <td style="vertical-align: middle; width: 36px; padding: 0;">
                                                        <img src="https://recebimentosmart.com.br/images/logo.svg" alt="R$" style="height: 28px; width: 28px; border-radius: 6px; display: block;">
                                                    </td>
                                                    <td style="vertical-align: middle; padding: 0 0 0 8px;">
                                                        <div style="font-size: 18px; font-weight: bold; color: #ffffff; letter-spacing: -0.5px; line-height: 1.2;">
                                                            Recebimento <span style="color: #0d9488;">$mart</span>
                                                        </div>
                                                    </td>
                                                    <td style="vertical-align: middle; text-align: right; padding: 0;">
                                                        <div style="font-size: 11px; font-weight: bold; color: #ffffff; letter-spacing: 0.5px; line-height: 1.2; text-transform: uppercase;">
                                                            Fatura Fechada
                                                        </div>
                                                    </td>
                                                </tr>
                                            </table>
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
                                                <a href="https://recebimentosmart.com.br/v2/financeiro/cartoes?cardId=' || v_card.id || '" style="display: inline-block; padding: 12px 28px; background-color: #0d9488; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 13px; box-shadow: 0 4px 6px rgba(13, 148, 136, 0.2);">Ver Detalhes do Cartão</a>
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
                        END IF;
                    END LOOP;
                END LOOP;
            END IF;
        END IF;
    END LOOP;
END;
$$;


CREATE OR REPLACE FUNCTION public.process_due_accounts_notification_test(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 AS $$
DECLARE
    v_user RECORD;
    v_account RECORD;
    v_tx RECORD;
    v_account_section text;
    v_account_rows text;
    v_account_tx_count int;
    v_total_tx_count int;
    v_html_body text;
    v_subject text;
    v_start_date date;
    v_end_date date;
    v_edge_url text := 'https://kwdweztilsoxxcgudtsz.supabase.co/functions/v1/send-notification-email';
    v_service_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3ZHdlenRpbHNveHhjZ3VkdHN6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDEzMjY3NywiZXhwIjoyMDU5NzA4Njc3fQ.1iKIZqSUyo5VCqFvdJl-ZLdCsXZVmmwnFKA-9zGtA';
    v_req_id bigint;
    v_account_icon text;
    v_color text;
    v_dest_account_name text;
    v_test_email text := 'andre@andreric.com';
    v_today date;
    v_period_label text;
    v_has_overdue boolean;
BEGIN
    -- Verifica se o chamador é admin
    IF NOT is_admin(auth.uid()) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Apenas administradores podem usar esta função.');
    END IF;

    -- Busca dados do perfil do usuário
    SELECT id, name, email, plano
    INTO v_user
    FROM public.profiles
    WHERE id = p_user_id;

    IF v_user IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Usuário não encontrado.');
    END IF;

    v_today := (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::date;

    -- Verifica se há contas em atraso (pendente no passado, excluindo recorrentes já pagas/canceladas/encerradas)
    SELECT EXISTS (
        SELECT 1 
        FROM public.financial_transactions ft
        WHERE ft.user_id = v_user.id
          AND ft.status = 'pending'
          AND (ft.recurrence_end_date IS NULL OR ft.recurrence_end_date >= ft.date::date)
          AND ft.date::date < v_today
          AND ft.type IN ('income', 'expense', 'transfer')
          AND (
            NOT (ft.recurrence_enabled = true AND ft.parent_id IS NULL)
            OR NOT EXISTS (
              SELECT 1 
              FROM public.financial_transactions child
              WHERE child.parent_id = ft.id
                AND child.status IN ('paid', 'cancelled')
                AND (
                  child.date = ft.date 
                  OR child.installment_current = ft.installment_current
                  OR (EXTRACT(MONTH FROM child.date) = EXTRACT(MONTH FROM ft.date) AND EXTRACT(YEAR FROM child.date) = EXTRACT(YEAR FROM ft.date))
                )
            )
          )
    ) INTO v_has_overdue;

    IF v_has_overdue THEN
        v_start_date := v_today - 365;
        v_end_date := v_today - 1;
        v_subject := '[TESTE - ' || COALESCE(v_user.name, v_user.email) || '] Contas em Atraso - Recebimento $mart';
        v_period_label := 'em atraso';
    ELSE
        v_start_date := v_today;
        v_end_date := v_start_date;
        v_subject := '[TESTE - ' || COALESCE(v_user.name, v_user.email) || '] Contas a Vencer Hoje - Recebimento $mart';
        v_period_label := 'hoje';
    END IF;

    v_account_section := '';
    v_total_tx_count := 0;

    -- Loop por cada conta do usuário (excluindo cartões de crédito)
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

        -- 1. Lançamentos de income/expense desta conta
        FOR v_tx IN
            SELECT ft.description, ft.type, ft.amount, ft.date
            FROM public.financial_transactions ft
            WHERE ft.user_id = v_user.id
              AND ft.status = 'pending'
              AND (ft.recurrence_end_date IS NULL OR ft.recurrence_end_date >= ft.date::date)
              AND ft.date::date >= v_start_date
              AND ft.date::date <= v_end_date
              AND ft.account_id = v_account.id
              AND ft.type IN ('income', 'expense')
              AND (
                NOT (ft.recurrence_enabled = true AND ft.parent_id IS NULL)
                OR NOT EXISTS (
                  SELECT 1 
                  FROM public.financial_transactions child
                  WHERE child.parent_id = ft.id
                    AND child.status IN ('paid', 'cancelled')
                    AND (
                      child.date = ft.date 
                      OR child.installment_current = ft.installment_current
                      OR (EXTRACT(MONTH FROM child.date) = EXTRACT(MONTH FROM ft.date) AND EXTRACT(YEAR FROM child.date) = EXTRACT(YEAR FROM ft.date))
                    )
                )
              )
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

        -- 2. Transferências SAINDO desta conta
        FOR v_tx IN
            SELECT ft.description, ft.amount, ft.date, ft.destination_account_id,
                   da.name AS dest_name
            FROM public.financial_transactions ft
            LEFT JOIN public.financial_accounts da ON ft.destination_account_id = da.id
            WHERE ft.user_id = v_user.id
              AND ft.status = 'pending'
              AND (ft.recurrence_end_date IS NULL OR ft.recurrence_end_date >= ft.date::date)
              AND ft.date::date >= v_start_date
              AND ft.date::date <= v_end_date
              AND ft.account_id = v_account.id
              AND ft.type = 'transfer'
              AND (
                NOT (ft.recurrence_enabled = true AND ft.parent_id IS NULL)
                OR NOT EXISTS (
                  SELECT 1 
                  FROM public.financial_transactions child
                  WHERE child.parent_id = ft.id
                    AND child.status IN ('paid', 'cancelled')
                    AND (
                      child.date = ft.date 
                      OR child.installment_current = ft.installment_current
                      OR (EXTRACT(MONTH FROM child.date) = EXTRACT(MONTH FROM ft.date) AND EXTRACT(YEAR FROM child.date) = EXTRACT(YEAR FROM ft.date))
                    )
                )
              )
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

        -- 3. Transferências ENTRANDO nesta conta
        FOR v_tx IN
            SELECT ft.description, ft.amount, ft.date, ft.account_id AS origin_account_id,
                   oa.name AS origin_name
            FROM public.financial_transactions ft
            LEFT JOIN public.financial_accounts oa ON ft.account_id = oa.id
            WHERE ft.user_id = v_user.id
              AND ft.status = 'pending'
              AND (ft.recurrence_end_date IS NULL OR ft.recurrence_end_date >= ft.date::date)
              AND ft.date::date >= v_start_date
              AND ft.date::date <= v_end_date
              AND ft.destination_account_id = v_account.id
              AND ft.type = 'transfer'
              AND (
                NOT (ft.recurrence_enabled = true AND ft.parent_id IS NULL)
                OR NOT EXISTS (
                  SELECT 1 
                  FROM public.financial_transactions child
                  WHERE child.parent_id = ft.id
                    AND child.status IN ('paid', 'cancelled')
                    AND (
                      child.date = ft.date 
                      OR child.installment_current = ft.installment_current
                      OR (EXTRACT(MONTH FROM child.date) = EXTRACT(MONTH FROM ft.date) AND EXTRACT(YEAR FROM child.date) = EXTRACT(YEAR FROM ft.date))
                    )
                )
              )
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

    -- Se não encontrou lançamentos
    IF v_total_tx_count = 0 THEN
        RETURN jsonb_build_object('success', true, 'message', 'Nenhum lançamento pendente.', 'count', 0);
    END IF;

    -- Monta o HTML completo
    v_html_body := '
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f1f5f9;">
        <div style="max-width: 600px; margin: 30px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
            
            <!-- Header com Logo Lateral (Compacto) -->
            <div style="background-color: #0f172a; padding: 16px 24px; border-bottom: 3px solid #0d9488;">
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="vertical-align: middle; width: 36px; padding: 0;">
                            <img src="https://recebimentosmart.com.br/images/logo.svg" alt="R$" style="height: 28px; width: 28px; border-radius: 6px; display: block;">
                        </td>
                        <td style="vertical-align: middle; padding: 0 0 0 8px;">
                            <div style="font-size: 18px; font-weight: bold; color: #ffffff; letter-spacing: -0.5px; line-height: 1.2;">
                                Recebimento <span style="color: #0d9488;">$mart</span>
                            </div>
                        </td>
                        <td style="vertical-align: middle; text-align: right; padding: 0;">
                            <div style="font-size: 11px; font-weight: bold; color: #ffffff; letter-spacing: 0.5px; line-height: 1.2; text-transform: uppercase;">
                                ' || CASE WHEN v_has_overdue THEN 'Teste - Atrasadas' ELSE 'Teste - Hoje' END || '
                            </div>
                        </td>
                    </tr>
                </table>
            </div>
            
            <!-- Content -->
            <div style="padding: 24px; color: #334155; line-height: 1.6;">
                <p style="font-size: 15px; font-weight: bold; color: #1e293b; margin-top: 0;">Olá, ' || COALESCE(v_user.name, 'Usuário') || '!</p>
                <p style="font-size: 13px; color: #64748b; margin-bottom: 24px;">
                    Identificamos <strong>' || v_total_tx_count || '</strong> lançamento(s) pendente(s) ' || v_period_label || '. Veja o resumo por conta:
                </p>

                ' || v_account_section || '
                
                <div style="text-align: center; margin-top: 28px;">
                    <a href="https://recebimentosmart.com.br/dashboard" style="display: inline-block; padding: 12px 28px; background-color: #0d9488; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 13px; box-shadow: 0 4px 6px rgba(13, 148, 136, 0.2);">Acessar Meu Painel Financeiro</a>
                </div>
            </div>
            
            <!-- Footer -->
            <div style="text-align: center; padding: 20px; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; background-color: #f8fafc;">
                <p style="margin: 0;">Recebimento $mart &copy; ' || EXTRACT(YEAR FROM CURRENT_DATE) || ' • Todos os direitos reservados.</p>
                <p style="font-size: 10px; margin-top: 5px;">⚠️ Este é um e-mail de TESTE enviado pelo painel administrativo.</p>
            </div>
        </div>
    </body>
    </html>';

    -- Envia para o e-mail de teste (andre@andreric.com)
    SELECT net.http_post(
        url := v_edge_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object(
            'recipientEmail', v_test_email,
            'subject', v_subject,
            'htmlContent', v_html_body
        )
    ) INTO v_req_id;

    RETURN jsonb_build_object('success', true, 'message', 'E-mail de teste enviado para ' || v_test_email, 'count', v_total_tx_count);
END;
$$;
