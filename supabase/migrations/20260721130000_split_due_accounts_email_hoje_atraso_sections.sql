-- Migração: e-mail de contas passa a poder combinar "Vencendo Hoje" + "Em Atraso" (plano diário)
-- e "Em Atraso" + "Próximos 7 Dias" (plano semanal) no MESMO e-mail, em vez de serem
-- mutuamente exclusivos como antes (a existência de qualquer atraso "sequestrava" o e-mail
-- inteiro e escondia o que vencia hoje / na semana).
--
-- Regras de negócio definidas com o usuário em 2026-07-21:
--
-- Plano diário (Pró/Premium):
--   - "Vencendo Hoje" inclui, agora, também a fatura de cartão de crédito quando o vencimento
--     calculado da fatura (due_day) cai em hoje.
--   - Sempre que existir algo "vencendo hoje", o e-mail pode incluir uma seção "Em Atraso"
--     logo abaixo, com TUDO que estiver atrasado no momento (sem filtro de frequência).
--   - Quando NÃO há nada vencendo hoje, mas existem contas atrasadas, o e-mail "só de atraso"
--     NÃO é disparado todo santo dia: só dispara no dia em que uma conta completa 1, 8, 15,
--     22... dias de atraso (múltiplo de 7 dias após o 1º dia de atraso). Isso evita reforçar
--     e-mail de atraso diariamente, mas garante que o usuário seja lembrado periodicamente.
--
-- Plano semanal (Básico):
--   - Continua enviando 1x/semana. Nesse e-mail, "Em Atraso" (tudo que está atrasado agora,
--     sem filtro de frequência extra — a cadência semanal do envio já cumpre esse papel) e
--     "Próximos 7 Dias" passam a poder aparecer juntos no mesmo e-mail, em vez de mutuamente
--     exclusivos.
--
-- Para eliminar a duplicação de lógica de fatura de cartão (usada agora em até 2 seções por
-- e-mail, em 2 planos diferentes), extrai o cálculo de faturas de cartão pendentes num helper
-- SQL reutilizável: public._due_card_invoices(user_id, account_id opcional, intervalo de datas).

CREATE OR REPLACE FUNCTION public._due_card_invoices(
    p_user_id uuid,
    p_account_id uuid,
    p_range_start date,
    p_range_end date
)
RETURNS TABLE (
    card_id uuid,
    card_name text,
    due_date date,
    invoice_month text,
    total numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $function$
    SELECT
        c.id,
        c.name,
        d.due_date,
        to_char(d.due_date, 'YYYY-MM'),
        COALESCE((
            SELECT SUM(ft.amount)
            FROM public.financial_transactions ft
            WHERE ft.user_id = p_user_id
              AND ft.account_id = c.id
              AND ft.invoice_month = to_char(d.due_date, 'YYYY-MM')
              AND ft.type = 'expense'
              AND ft.status <> 'cancelled'
        ), 0) AS total
    FROM public.financial_accounts c
    CROSS JOIN LATERAL (
        SELECT generate_series(p_range_start, p_range_end, '1 day'::interval)::date AS due_date
    ) d
    WHERE c.user_id = p_user_id
      AND c.type = 'credit_card'
      AND c.is_active = true
      AND (
          (p_account_id IS NULL AND c.invoice_payment_account_id IS NULL)
          OR c.invoice_payment_account_id = p_account_id
      )
      AND (
          extract(day from d.due_date) = c.due_day
          OR (c.due_day > 28 AND d.due_date = (date_trunc('month', d.due_date) + interval '1 month' - interval '1 day')::date)
      )
      AND COALESCE((
            SELECT SUM(ft.amount)
            FROM public.financial_transactions ft
            WHERE ft.user_id = p_user_id
              AND ft.account_id = c.id
              AND ft.invoice_month = to_char(d.due_date, 'YYYY-MM')
              AND ft.type = 'expense'
              AND ft.status <> 'cancelled'
        ), 0) > 0
      AND NOT EXISTS (
          SELECT 1
          FROM public.financial_transactions pay
          WHERE pay.user_id = p_user_id
            AND pay.destination_account_id = c.id
            AND pay.type = 'transfer'
            AND pay.invoice_month = to_char(d.due_date, 'YYYY-MM')
            AND pay.status <> 'cancelled'
      );
$function$;


CREATE OR REPLACE FUNCTION public.process_due_accounts_notifications()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_enabled boolean;
    v_frequency text;
    v_is_correct_day boolean;
    v_subject text;

    -- Cursores e registros do loop
    v_user RECORD;
    v_account RECORD;
    v_card RECORD;
    v_tx RECORD;

    -- Blocos de conta (genéricos, reaproveitados entre seções)
    v_rows text;
    v_acc_count int;
    v_account_icon text;
    v_color text;
    v_dest_account_name text;
    v_today date;

    -- Seção "Vencendo Hoje" (plano diário)
    v_hoje_section text;
    v_hoje_total int;
    v_hoje_unlinked_rows text;

    -- Seção "Em Atraso" (planos diário e semanal)
    v_atraso_section text;
    v_atraso_total int;
    v_atraso_unlinked_rows text;
    v_atraso_milestone boolean;

    -- Seção "Próximos 7 Dias" (plano semanal)
    v_prox7_section text;
    v_prox7_total int;
    v_prox7_unlinked_rows text;

    -- Montagem final do e-mail
    v_body_sections text;
    v_intro_text text;
    v_header_label text;
    v_should_send boolean;

    -- Variáveis de controle de fechamento de fatura de cartão (seção 2b, inalterada)
    v_card_total numeric;
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
    v_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

    FOR v_user IN
        SELECT p.id, p.name, p.email, p.plano, p.due_email_notify_enabled, p.due_email_notify_day_of_week, p.card_invoice_email_notify_enabled
        FROM public.profiles p
        WHERE p.email IS NOT NULL AND p.deleted_at IS NULL
    LOOP
        SELECT email_notification_enabled, email_notification_frequency
        INTO v_enabled, v_frequency
        FROM public.plans
        WHERE slug = v_user.plano::text;

        IF NOT COALESCE(v_enabled, FALSE) THEN
            CONTINUE;
        END IF;

        v_frequency := COALESCE(v_frequency, 'daily');

        -- =====================================================================
        -- CASO 1: PLANO SEMANAL (Ex: Básico) — "Em Atraso" + "Próximos 7 Dias"
        -- =====================================================================
        IF v_frequency = 'weekly' THEN
            IF NOT COALESCE(v_user.due_email_notify_enabled, FALSE) THEN
                CONTINUE;
            END IF;

            v_is_correct_day := EXTRACT(ISODOW FROM (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')) = CASE WHEN v_user.due_email_notify_day_of_week = 0 THEN 7 ELSE v_user.due_email_notify_day_of_week END;

            IF NOT v_is_correct_day THEN
                CONTINUE;
            END IF;

            v_atraso_section := '';
            v_atraso_total := 0;
            v_prox7_section := '';
            v_prox7_total := 0;

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
                v_account_icon := CASE v_account.type
                    WHEN 'checking' THEN '🏦'
                    WHEN 'savings' THEN '🐷'
                    WHEN 'investment' THEN '📈'
                    ELSE '💰'
                END;

                -- ---- Em Atraso (data < hoje, até 365 dias pra trás) ----
                v_rows := '';
                v_acc_count := 0;

                FOR v_tx IN
                    SELECT ft.description, ft.type, ft.amount, ft.date
                    FROM public.financial_transactions ft
                    WHERE ft.user_id = v_user.id
                      AND ft.status = 'pending'
                      AND (ft.recurrence_end_date IS NULL OR ft.recurrence_end_date >= ft.date::date)
                      AND ft.date::date >= v_today - 365
                      AND ft.date::date < v_today
                      AND ft.account_id = v_account.id
                      AND ft.type IN ('income', 'expense')
                      AND ft.is_template = false
                    ORDER BY ft.date ASC
                LOOP
                    v_acc_count := v_acc_count + 1;
                    v_color := CASE WHEN v_tx.type = 'income' THEN '#16a34a' ELSE '#dc2626' END;
                    v_rows := v_rows || '
                    <tr>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 13px;">' || COALESCE(v_tx.description, 'Sem descrição') || '</td>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: ' || v_color || '; font-size: 13px; white-space: nowrap;">' ||
                            CASE WHEN v_tx.type = 'expense' THEN '- ' ELSE '+ ' END ||
                            'R$ ' || to_char(v_tx.amount, 'FM999G999G990D00') || '</td>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px; white-space: nowrap;">' || to_char(v_tx.date::date, 'DD/MM/YYYY') || '</td>
                    </tr>';
                END LOOP;

                FOR v_tx IN
                    SELECT ft.description, ft.amount, ft.date, da.name AS dest_name
                    FROM public.financial_transactions ft
                    LEFT JOIN public.financial_accounts da ON ft.destination_account_id = da.id
                    WHERE ft.user_id = v_user.id
                      AND ft.status = 'pending'
                      AND (ft.recurrence_end_date IS NULL OR ft.recurrence_end_date >= ft.date::date)
                      AND ft.date::date >= v_today - 365
                      AND ft.date::date < v_today
                      AND ft.account_id = v_account.id
                      AND ft.type = 'transfer'
                      AND ft.is_template = false
                    ORDER BY ft.date ASC
                LOOP
                    v_acc_count := v_acc_count + 1;
                    v_dest_account_name := COALESCE(v_tx.dest_name, 'Outra conta');
                    v_rows := v_rows || '
                    <tr>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 13px;">' || COALESCE(v_tx.description, 'Transferência') || ' <span style="color: #94a3b8; font-size: 11px;">→ ' || v_dest_account_name || '</span></td>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: #dc2626; font-size: 13px; white-space: nowrap;">- R$ ' || to_char(v_tx.amount, 'FM999G999G990D00') || '</td>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px; white-space: nowrap;">' || to_char(v_tx.date::date, 'DD/MM/YYYY') || '</td>
                    </tr>';
                END LOOP;

                FOR v_tx IN
                    SELECT ft.description, ft.amount, ft.date, oa.name AS origin_name
                    FROM public.financial_transactions ft
                    LEFT JOIN public.financial_accounts oa ON ft.account_id = oa.id
                    WHERE ft.user_id = v_user.id
                      AND ft.status = 'pending'
                      AND (ft.recurrence_end_date IS NULL OR ft.recurrence_end_date >= ft.date::date)
                      AND ft.date::date >= v_today - 365
                      AND ft.date::date < v_today
                      AND ft.destination_account_id = v_account.id
                      AND ft.type = 'transfer'
                      AND ft.is_template = false
                    ORDER BY ft.date ASC
                LOOP
                    v_acc_count := v_acc_count + 1;
                    v_rows := v_rows || '
                    <tr>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 13px;">' || COALESCE(v_tx.description, 'Transferência') || ' <span style="color: #94a3b8; font-size: 11px;">← ' || COALESCE(v_tx.origin_name, 'Outra conta') || '</span></td>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: #16a34a; font-size: 13px; white-space: nowrap;">+ R$ ' || to_char(v_tx.amount, 'FM999G999G990D00') || '</td>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px; white-space: nowrap;">' || to_char(v_tx.date::date, 'DD/MM/YYYY') || '</td>
                    </tr>';
                END LOOP;

                FOR v_card IN SELECT * FROM public._due_card_invoices(v_user.id, v_account.id, v_today - 365, v_today - 1) LOOP
                    v_acc_count := v_acc_count + 1;
                    v_rows := v_rows || '
                    <tr>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 13px;">Fatura ' || COALESCE(v_card.card_name, 'Cartão') || '</td>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: #dc2626; font-size: 13px; white-space: nowrap;">- R$ ' || to_char(v_card.total, 'FM999G999G990D00') || '</td>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px; white-space: nowrap;">' || to_char(v_card.due_date, 'DD/MM/YYYY') || '</td>
                    </tr>';
                END LOOP;

                IF v_acc_count > 0 THEN
                    v_atraso_total := v_atraso_total + v_acc_count;
                    v_atraso_section := v_atraso_section || '
                    <div style="background-color: #f8fafc; border-radius: 12px; padding: 16px; border: 1px solid #e2e8f0; margin-bottom: 16px;">
                        <div style="font-weight: bold; color: #0f172a; font-size: 14px; margin-bottom: 12px;">
                            ' || v_account_icon || ' ' || v_account.name || '
                        </div>
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead><tr>
                                <th style="padding: 8px 12px; text-align: left; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Descrição</th>
                                <th style="padding: 8px 12px; text-align: right; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Valor</th>
                                <th style="padding: 8px 12px; text-align: center; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Vencimento</th>
                            </tr></thead>
                            <tbody>' || v_rows || '</tbody>
                        </table>
                    </div>';
                END IF;

                -- ---- Próximos 7 Dias (data entre hoje e hoje+6) ----
                v_rows := '';
                v_acc_count := 0;

                FOR v_tx IN
                    SELECT ft.description, ft.type, ft.amount, ft.date
                    FROM public.financial_transactions ft
                    WHERE ft.user_id = v_user.id
                      AND ft.status = 'pending'
                      AND (ft.recurrence_end_date IS NULL OR ft.recurrence_end_date >= ft.date::date)
                      AND ft.date::date >= v_today
                      AND ft.date::date <= v_today + 6
                      AND ft.account_id = v_account.id
                      AND ft.type IN ('income', 'expense')
                      AND ft.is_template = false
                    ORDER BY ft.date ASC
                LOOP
                    v_acc_count := v_acc_count + 1;
                    v_color := CASE WHEN v_tx.type = 'income' THEN '#16a34a' ELSE '#dc2626' END;
                    v_rows := v_rows || '
                    <tr>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 13px;">' || COALESCE(v_tx.description, 'Sem descrição') || '</td>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: ' || v_color || '; font-size: 13px; white-space: nowrap;">' ||
                            CASE WHEN v_tx.type = 'expense' THEN '- ' ELSE '+ ' END ||
                            'R$ ' || to_char(v_tx.amount, 'FM999G999G990D00') || '</td>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px; white-space: nowrap;">' || to_char(v_tx.date::date, 'DD/MM/YYYY') || '</td>
                    </tr>';
                END LOOP;

                FOR v_tx IN
                    SELECT ft.description, ft.amount, ft.date, da.name AS dest_name
                    FROM public.financial_transactions ft
                    LEFT JOIN public.financial_accounts da ON ft.destination_account_id = da.id
                    WHERE ft.user_id = v_user.id
                      AND ft.status = 'pending'
                      AND (ft.recurrence_end_date IS NULL OR ft.recurrence_end_date >= ft.date::date)
                      AND ft.date::date >= v_today
                      AND ft.date::date <= v_today + 6
                      AND ft.account_id = v_account.id
                      AND ft.type = 'transfer'
                      AND ft.is_template = false
                    ORDER BY ft.date ASC
                LOOP
                    v_acc_count := v_acc_count + 1;
                    v_dest_account_name := COALESCE(v_tx.dest_name, 'Outra conta');
                    v_rows := v_rows || '
                    <tr>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 13px;">' || COALESCE(v_tx.description, 'Transferência') || ' <span style="color: #94a3b8; font-size: 11px;">→ ' || v_dest_account_name || '</span></td>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: #dc2626; font-size: 13px; white-space: nowrap;">- R$ ' || to_char(v_tx.amount, 'FM999G999G990D00') || '</td>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px; white-space: nowrap;">' || to_char(v_tx.date::date, 'DD/MM/YYYY') || '</td>
                    </tr>';
                END LOOP;

                FOR v_tx IN
                    SELECT ft.description, ft.amount, ft.date, oa.name AS origin_name
                    FROM public.financial_transactions ft
                    LEFT JOIN public.financial_accounts oa ON ft.account_id = oa.id
                    WHERE ft.user_id = v_user.id
                      AND ft.status = 'pending'
                      AND (ft.recurrence_end_date IS NULL OR ft.recurrence_end_date >= ft.date::date)
                      AND ft.date::date >= v_today
                      AND ft.date::date <= v_today + 6
                      AND ft.destination_account_id = v_account.id
                      AND ft.type = 'transfer'
                      AND ft.is_template = false
                    ORDER BY ft.date ASC
                LOOP
                    v_acc_count := v_acc_count + 1;
                    v_rows := v_rows || '
                    <tr>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 13px;">' || COALESCE(v_tx.description, 'Transferência') || ' <span style="color: #94a3b8; font-size: 11px;">← ' || COALESCE(v_tx.origin_name, 'Outra conta') || '</span></td>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: #16a34a; font-size: 13px; white-space: nowrap;">+ R$ ' || to_char(v_tx.amount, 'FM999G999G990D00') || '</td>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px; white-space: nowrap;">' || to_char(v_tx.date::date, 'DD/MM/YYYY') || '</td>
                    </tr>';
                END LOOP;

                FOR v_card IN SELECT * FROM public._due_card_invoices(v_user.id, v_account.id, v_today, v_today + 6) LOOP
                    v_acc_count := v_acc_count + 1;
                    v_rows := v_rows || '
                    <tr>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 13px;">Fatura ' || COALESCE(v_card.card_name, 'Cartão') || '</td>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: #dc2626; font-size: 13px; white-space: nowrap;">- R$ ' || to_char(v_card.total, 'FM999G999G990D00') || '</td>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px; white-space: nowrap;">' || to_char(v_card.due_date, 'DD/MM/YYYY') || '</td>
                    </tr>';
                END LOOP;

                IF v_acc_count > 0 THEN
                    v_prox7_total := v_prox7_total + v_acc_count;
                    v_prox7_section := v_prox7_section || '
                    <div style="background-color: #f8fafc; border-radius: 12px; padding: 16px; border: 1px solid #e2e8f0; margin-bottom: 16px;">
                        <div style="font-weight: bold; color: #0f172a; font-size: 14px; margin-bottom: 12px;">
                            ' || v_account_icon || ' ' || v_account.name || '
                        </div>
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead><tr>
                                <th style="padding: 8px 12px; text-align: left; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Descrição</th>
                                <th style="padding: 8px 12px; text-align: right; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Valor</th>
                                <th style="padding: 8px 12px; text-align: center; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Vencimento</th>
                            </tr></thead>
                            <tbody>' || v_rows || '</tbody>
                        </table>
                    </div>';
                END IF;
            END LOOP;

            -- Cartões sem conta de pagamento vinculada
            v_atraso_unlinked_rows := '';
            FOR v_card IN SELECT * FROM public._due_card_invoices(v_user.id, NULL, v_today - 365, v_today - 1) LOOP
                v_atraso_total := v_atraso_total + 1;
                v_atraso_unlinked_rows := v_atraso_unlinked_rows || '
                <tr>
                    <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 13px;">Fatura ' || COALESCE(v_card.card_name, 'Cartão') || '</td>
                    <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: #dc2626; font-size: 13px; white-space: nowrap;">- R$ ' || to_char(v_card.total, 'FM999G999G990D00') || '</td>
                    <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px; white-space: nowrap;">' || to_char(v_card.due_date, 'DD/MM/YYYY') || '</td>
                </tr>';
            END LOOP;
            IF v_atraso_unlinked_rows <> '' THEN
                v_atraso_section := v_atraso_section || '
                <div style="background-color: #f8fafc; border-radius: 12px; padding: 16px; border: 1px solid #e2e8f0; margin-bottom: 16px;">
                    <div style="font-weight: bold; color: #0f172a; font-size: 14px; margin-bottom: 12px;">💳 Cartões de Crédito (Sem conta vinculada)</div>
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead><tr>
                            <th style="padding: 8px 12px; text-align: left; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Fatura</th>
                            <th style="padding: 8px 12px; text-align: right; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Valor</th>
                            <th style="padding: 8px 12px; text-align: center; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Vencimento</th>
                        </tr></thead>
                        <tbody>' || v_atraso_unlinked_rows || '</tbody>
                    </table>
                </div>';
            END IF;

            v_prox7_unlinked_rows := '';
            FOR v_card IN SELECT * FROM public._due_card_invoices(v_user.id, NULL, v_today, v_today + 6) LOOP
                v_prox7_total := v_prox7_total + 1;
                v_prox7_unlinked_rows := v_prox7_unlinked_rows || '
                <tr>
                    <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 13px;">Fatura ' || COALESCE(v_card.card_name, 'Cartão') || '</td>
                    <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: #dc2626; font-size: 13px; white-space: nowrap;">- R$ ' || to_char(v_card.total, 'FM999G999G990D00') || '</td>
                    <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px; white-space: nowrap;">' || to_char(v_card.due_date, 'DD/MM/YYYY') || '</td>
                </tr>';
            END LOOP;
            IF v_prox7_unlinked_rows <> '' THEN
                v_prox7_section := v_prox7_section || '
                <div style="background-color: #f8fafc; border-radius: 12px; padding: 16px; border: 1px solid #e2e8f0; margin-bottom: 16px;">
                    <div style="font-weight: bold; color: #0f172a; font-size: 14px; margin-bottom: 12px;">💳 Cartões de Crédito (Sem conta vinculada)</div>
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead><tr>
                            <th style="padding: 8px 12px; text-align: left; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Fatura</th>
                            <th style="padding: 8px 12px; text-align: right; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Valor</th>
                            <th style="padding: 8px 12px; text-align: center; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Vencimento</th>
                        </tr></thead>
                        <tbody>' || v_prox7_unlinked_rows || '</tbody>
                    </table>
                </div>';
            END IF;

            IF (v_atraso_total + v_prox7_total) > 0 THEN
                IF v_atraso_total > 0 AND v_prox7_total > 0 THEN
                    v_subject := 'Contas em Atraso e a Vencer - Recebimento $mart';
                    v_header_label := 'Atraso + Semana';
                    v_intro_text := 'Identificamos <strong>' || v_atraso_total || '</strong> lançamento(s) em atraso e <strong>' || v_prox7_total || '</strong> vencendo nos próximos 7 dias. Veja o resumo abaixo:';
                ELSIF v_atraso_total > 0 THEN
                    v_subject := 'Contas em Atraso - Recebimento $mart';
                    v_header_label := 'Contas em Atraso';
                    v_intro_text := 'Identificamos <strong>' || v_atraso_total || '</strong> lançamento(s) em atraso. Veja o resumo abaixo:';
                ELSE
                    v_subject := 'Resumo Semanal de Contas a Vencer - Recebimento $mart';
                    v_header_label := 'Resumo Semanal';
                    v_intro_text := 'Identificamos <strong>' || v_prox7_total || '</strong> lançamento(s) vencendo nos próximos 7 dias. Veja o resumo abaixo:';
                END IF;

                v_body_sections := '';
                IF v_atraso_total > 0 THEN
                    v_body_sections := v_body_sections || '<div style="font-size: 12px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; margin: 4px 0 10px; color: #dc2626;">🔴 Em Atraso</div>' || v_atraso_section;
                END IF;
                IF v_prox7_total > 0 THEN
                    v_body_sections := v_body_sections || '<div style="font-size: 12px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; margin: 20px 0 10px; color: #d97706;">🟡 Próximos 7 Dias</div>' || v_prox7_section;
                END IF;

                v_html_body := '
                <!DOCTYPE html>
                <html lang="pt-BR">
                <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
                <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f1f5f9;">
                    <div style="max-width: 600px; margin: 30px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
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
                                        <div style="font-size: 11px; font-weight: bold; color: #ffffff; letter-spacing: 0.5px; line-height: 1.2; text-transform: uppercase;">' || v_header_label || '</div>
                                    </td>
                                </tr>
                            </table>
                        </div>
                        <div style="padding: 24px; color: #334155; line-height: 1.6;">
                            <p style="font-size: 15px; font-weight: bold; color: #1e293b; margin-top: 0;">Olá, ' || COALESCE(v_user.name, 'Usuário') || '!</p>
                            <p style="font-size: 13px; color: #64748b; margin-bottom: 24px;">' || v_intro_text || '</p>
                            ' || v_body_sections || '
                            <div style="text-align: center; margin-top: 28px;">
                                <a href="https://recebimentosmart.com.br/dashboard" style="display: inline-block; padding: 12px 28px; background-color: #0d9488; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 13px; box-shadow: 0 4px 6px rgba(13, 148, 136, 0.2);">Acessar Meu Painel Financeiro</a>
                            </div>
                        </div>
                        <div style="text-align: center; padding: 20px; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; background-color: #f8fafc;">
                            <p style="margin: 0;">Recebimento $mart &copy; ' || EXTRACT(YEAR FROM CURRENT_DATE) || ' • Todos os direitos reservados.</p>
                            <p style="font-size: 10px; margin-top: 5px;">Você está recebendo este e-mail devido às configurações de alertas do seu plano <strong>' || COALESCE(v_user.plano::text, 'ativo') || '</strong>.</p>
                        </div>
                    </div>
                </body>
                </html>';

                SELECT net.http_post(
                    url := v_edge_url,
                    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
                    body := jsonb_build_object('recipientEmail', v_user.email, 'subject', v_subject, 'htmlContent', v_html_body)
                ) INTO v_req_id;

                PERFORM pg_sleep(0.1);
            END IF;

        -- =====================================================================
        -- CASO 2: PLANO DIÁRIO (Ex: Pró/Premium) — "Vencendo Hoje" + "Em Atraso"
        -- =====================================================================
        ELSE
            IF COALESCE(v_user.due_email_notify_enabled, FALSE) THEN
                v_hoje_section := '';
                v_hoje_total := 0;
                v_atraso_section := '';
                v_atraso_total := 0;
                v_atraso_milestone := false;

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
                    v_account_icon := CASE v_account.type
                        WHEN 'checking' THEN '🏦'
                        WHEN 'savings' THEN '🐷'
                        WHEN 'investment' THEN '📈'
                        ELSE '💰'
                    END;

                    -- ---- Vencendo Hoje (data = hoje) ----
                    v_rows := '';
                    v_acc_count := 0;

                    FOR v_tx IN
                        SELECT ft.description, ft.type, ft.amount, ft.date
                        FROM public.financial_transactions ft
                        WHERE ft.user_id = v_user.id
                          AND ft.status = 'pending'
                          AND (ft.recurrence_end_date IS NULL OR ft.recurrence_end_date >= ft.date::date)
                          AND ft.date::date = v_today
                          AND ft.account_id = v_account.id
                          AND ft.type IN ('income', 'expense')
                          AND ft.is_template = false
                        ORDER BY ft.date ASC
                    LOOP
                        v_acc_count := v_acc_count + 1;
                        v_color := CASE WHEN v_tx.type = 'income' THEN '#16a34a' ELSE '#dc2626' END;
                        v_rows := v_rows || '
                        <tr>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 13px;">' || COALESCE(v_tx.description, 'Sem descrição') || '</td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: ' || v_color || '; font-size: 13px; white-space: nowrap;">' ||
                                CASE WHEN v_tx.type = 'expense' THEN '- ' ELSE '+ ' END ||
                                'R$ ' || to_char(v_tx.amount, 'FM999G999G990D00') || '</td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px; white-space: nowrap;">' || to_char(v_tx.date::date, 'DD/MM/YYYY') || '</td>
                        </tr>';
                    END LOOP;

                    FOR v_tx IN
                        SELECT ft.description, ft.amount, ft.date, da.name AS dest_name
                        FROM public.financial_transactions ft
                        LEFT JOIN public.financial_accounts da ON ft.destination_account_id = da.id
                        WHERE ft.user_id = v_user.id
                          AND ft.status = 'pending'
                          AND (ft.recurrence_end_date IS NULL OR ft.recurrence_end_date >= ft.date::date)
                          AND ft.date::date = v_today
                          AND ft.account_id = v_account.id
                          AND ft.type = 'transfer'
                          AND ft.is_template = false
                        ORDER BY ft.date ASC
                    LOOP
                        v_acc_count := v_acc_count + 1;
                        v_dest_account_name := COALESCE(v_tx.dest_name, 'Outra conta');
                        v_rows := v_rows || '
                        <tr>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 13px;">' || COALESCE(v_tx.description, 'Transferência') || ' <span style="color: #94a3b8; font-size: 11px;">→ ' || v_dest_account_name || '</span></td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: #dc2626; font-size: 13px; white-space: nowrap;">- R$ ' || to_char(v_tx.amount, 'FM999G999G990D00') || '</td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px; white-space: nowrap;">' || to_char(v_tx.date::date, 'DD/MM/YYYY') || '</td>
                        </tr>';
                    END LOOP;

                    FOR v_tx IN
                        SELECT ft.description, ft.amount, ft.date, oa.name AS origin_name
                        FROM public.financial_transactions ft
                        LEFT JOIN public.financial_accounts oa ON ft.account_id = oa.id
                        WHERE ft.user_id = v_user.id
                          AND ft.status = 'pending'
                          AND (ft.recurrence_end_date IS NULL OR ft.recurrence_end_date >= ft.date::date)
                          AND ft.date::date = v_today
                          AND ft.destination_account_id = v_account.id
                          AND ft.type = 'transfer'
                          AND ft.is_template = false
                        ORDER BY ft.date ASC
                    LOOP
                        v_acc_count := v_acc_count + 1;
                        v_rows := v_rows || '
                        <tr>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 13px;">' || COALESCE(v_tx.description, 'Transferência') || ' <span style="color: #94a3b8; font-size: 11px;">← ' || COALESCE(v_tx.origin_name, 'Outra conta') || '</span></td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: #16a34a; font-size: 13px; white-space: nowrap;">+ R$ ' || to_char(v_tx.amount, 'FM999G999G990D00') || '</td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px; white-space: nowrap;">' || to_char(v_tx.date::date, 'DD/MM/YYYY') || '</td>
                        </tr>';
                    END LOOP;

                    FOR v_card IN SELECT * FROM public._due_card_invoices(v_user.id, v_account.id, v_today, v_today) LOOP
                        v_acc_count := v_acc_count + 1;
                        v_rows := v_rows || '
                        <tr>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 13px;">Fatura ' || COALESCE(v_card.card_name, 'Cartão') || '</td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: #dc2626; font-size: 13px; white-space: nowrap;">- R$ ' || to_char(v_card.total, 'FM999G999G990D00') || '</td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px; white-space: nowrap;">' || to_char(v_card.due_date, 'DD/MM/YYYY') || '</td>
                        </tr>';
                    END LOOP;

                    IF v_acc_count > 0 THEN
                        v_hoje_total := v_hoje_total + v_acc_count;
                        v_hoje_section := v_hoje_section || '
                        <div style="background-color: #f8fafc; border-radius: 12px; padding: 16px; border: 1px solid #e2e8f0; margin-bottom: 16px;">
                            <div style="font-weight: bold; color: #0f172a; font-size: 14px; margin-bottom: 12px;">
                                ' || v_account_icon || ' ' || v_account.name || '
                            </div>
                            <table style="width: 100%; border-collapse: collapse;">
                                <thead><tr>
                                    <th style="padding: 8px 12px; text-align: left; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Descrição</th>
                                    <th style="padding: 8px 12px; text-align: right; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Valor</th>
                                    <th style="padding: 8px 12px; text-align: center; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Vencimento</th>
                                </tr></thead>
                                <tbody>' || v_rows || '</tbody>
                            </table>
                        </div>';
                    END IF;

                    -- ---- Em Atraso (data < hoje, até 365 dias pra trás) ----
                    v_rows := '';
                    v_acc_count := 0;

                    FOR v_tx IN
                        SELECT ft.description, ft.type, ft.amount, ft.date
                        FROM public.financial_transactions ft
                        WHERE ft.user_id = v_user.id
                          AND ft.status = 'pending'
                          AND (ft.recurrence_end_date IS NULL OR ft.recurrence_end_date >= ft.date::date)
                          AND ft.date::date >= v_today - 365
                          AND ft.date::date < v_today
                          AND ft.account_id = v_account.id
                          AND ft.type IN ('income', 'expense')
                          AND ft.is_template = false
                        ORDER BY ft.date ASC
                    LOOP
                        v_acc_count := v_acc_count + 1;
                        v_color := CASE WHEN v_tx.type = 'income' THEN '#16a34a' ELSE '#dc2626' END;
                        v_rows := v_rows || '
                        <tr>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 13px;">' || COALESCE(v_tx.description, 'Sem descrição') || '</td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: ' || v_color || '; font-size: 13px; white-space: nowrap;">' ||
                                CASE WHEN v_tx.type = 'expense' THEN '- ' ELSE '+ ' END ||
                                'R$ ' || to_char(v_tx.amount, 'FM999G999G990D00') || '</td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px; white-space: nowrap;">' || to_char(v_tx.date::date, 'DD/MM/YYYY') || '</td>
                        </tr>';
                        IF (v_today - v_tx.date::date - 1) % 7 = 0 THEN
                            v_atraso_milestone := true;
                        END IF;
                    END LOOP;

                    FOR v_tx IN
                        SELECT ft.description, ft.amount, ft.date, da.name AS dest_name
                        FROM public.financial_transactions ft
                        LEFT JOIN public.financial_accounts da ON ft.destination_account_id = da.id
                        WHERE ft.user_id = v_user.id
                          AND ft.status = 'pending'
                          AND (ft.recurrence_end_date IS NULL OR ft.recurrence_end_date >= ft.date::date)
                          AND ft.date::date >= v_today - 365
                          AND ft.date::date < v_today
                          AND ft.account_id = v_account.id
                          AND ft.type = 'transfer'
                          AND ft.is_template = false
                        ORDER BY ft.date ASC
                    LOOP
                        v_acc_count := v_acc_count + 1;
                        v_dest_account_name := COALESCE(v_tx.dest_name, 'Outra conta');
                        v_rows := v_rows || '
                        <tr>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 13px;">' || COALESCE(v_tx.description, 'Transferência') || ' <span style="color: #94a3b8; font-size: 11px;">→ ' || v_dest_account_name || '</span></td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: #dc2626; font-size: 13px; white-space: nowrap;">- R$ ' || to_char(v_tx.amount, 'FM999G999G990D00') || '</td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px; white-space: nowrap;">' || to_char(v_tx.date::date, 'DD/MM/YYYY') || '</td>
                        </tr>';
                        IF (v_today - v_tx.date::date - 1) % 7 = 0 THEN
                            v_atraso_milestone := true;
                        END IF;
                    END LOOP;

                    FOR v_tx IN
                        SELECT ft.description, ft.amount, ft.date, oa.name AS origin_name
                        FROM public.financial_transactions ft
                        LEFT JOIN public.financial_accounts oa ON ft.account_id = oa.id
                        WHERE ft.user_id = v_user.id
                          AND ft.status = 'pending'
                          AND (ft.recurrence_end_date IS NULL OR ft.recurrence_end_date >= ft.date::date)
                          AND ft.date::date >= v_today - 365
                          AND ft.date::date < v_today
                          AND ft.destination_account_id = v_account.id
                          AND ft.type = 'transfer'
                          AND ft.is_template = false
                        ORDER BY ft.date ASC
                    LOOP
                        v_acc_count := v_acc_count + 1;
                        v_rows := v_rows || '
                        <tr>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 13px;">' || COALESCE(v_tx.description, 'Transferência') || ' <span style="color: #94a3b8; font-size: 11px;">← ' || COALESCE(v_tx.origin_name, 'Outra conta') || '</span></td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: #16a34a; font-size: 13px; white-space: nowrap;">+ R$ ' || to_char(v_tx.amount, 'FM999G999G990D00') || '</td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px; white-space: nowrap;">' || to_char(v_tx.date::date, 'DD/MM/YYYY') || '</td>
                        </tr>';
                        IF (v_today - v_tx.date::date - 1) % 7 = 0 THEN
                            v_atraso_milestone := true;
                        END IF;
                    END LOOP;

                    FOR v_card IN SELECT * FROM public._due_card_invoices(v_user.id, v_account.id, v_today - 365, v_today - 1) LOOP
                        v_acc_count := v_acc_count + 1;
                        v_rows := v_rows || '
                        <tr>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 13px;">Fatura ' || COALESCE(v_card.card_name, 'Cartão') || '</td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: #dc2626; font-size: 13px; white-space: nowrap;">- R$ ' || to_char(v_card.total, 'FM999G999G990D00') || '</td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px; white-space: nowrap;">' || to_char(v_card.due_date, 'DD/MM/YYYY') || '</td>
                        </tr>';
                        IF (v_today - v_card.due_date - 1) % 7 = 0 THEN
                            v_atraso_milestone := true;
                        END IF;
                    END LOOP;

                    IF v_acc_count > 0 THEN
                        v_atraso_total := v_atraso_total + v_acc_count;
                        v_atraso_section := v_atraso_section || '
                        <div style="background-color: #f8fafc; border-radius: 12px; padding: 16px; border: 1px solid #e2e8f0; margin-bottom: 16px;">
                            <div style="font-weight: bold; color: #0f172a; font-size: 14px; margin-bottom: 12px;">
                                ' || v_account_icon || ' ' || v_account.name || '
                            </div>
                            <table style="width: 100%; border-collapse: collapse;">
                                <thead><tr>
                                    <th style="padding: 8px 12px; text-align: left; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Descrição</th>
                                    <th style="padding: 8px 12px; text-align: right; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Valor</th>
                                    <th style="padding: 8px 12px; text-align: center; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Vencimento</th>
                                </tr></thead>
                                <tbody>' || v_rows || '</tbody>
                            </table>
                        </div>';
                    END IF;
                END LOOP;

                -- Cartões sem conta de pagamento vinculada
                v_hoje_unlinked_rows := '';
                FOR v_card IN SELECT * FROM public._due_card_invoices(v_user.id, NULL, v_today, v_today) LOOP
                    v_hoje_total := v_hoje_total + 1;
                    v_hoje_unlinked_rows := v_hoje_unlinked_rows || '
                    <tr>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 13px;">Fatura ' || COALESCE(v_card.card_name, 'Cartão') || '</td>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: #dc2626; font-size: 13px; white-space: nowrap;">- R$ ' || to_char(v_card.total, 'FM999G999G990D00') || '</td>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px; white-space: nowrap;">' || to_char(v_card.due_date, 'DD/MM/YYYY') || '</td>
                    </tr>';
                END LOOP;
                IF v_hoje_unlinked_rows <> '' THEN
                    v_hoje_section := v_hoje_section || '
                    <div style="background-color: #f8fafc; border-radius: 12px; padding: 16px; border: 1px solid #e2e8f0; margin-bottom: 16px;">
                        <div style="font-weight: bold; color: #0f172a; font-size: 14px; margin-bottom: 12px;">💳 Cartões de Crédito (Sem conta vinculada)</div>
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead><tr>
                                <th style="padding: 8px 12px; text-align: left; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Fatura</th>
                                <th style="padding: 8px 12px; text-align: right; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Valor</th>
                                <th style="padding: 8px 12px; text-align: center; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Vencimento</th>
                            </tr></thead>
                            <tbody>' || v_hoje_unlinked_rows || '</tbody>
                        </table>
                    </div>';
                END IF;

                v_atraso_unlinked_rows := '';
                FOR v_card IN SELECT * FROM public._due_card_invoices(v_user.id, NULL, v_today - 365, v_today - 1) LOOP
                    v_atraso_total := v_atraso_total + 1;
                    v_atraso_unlinked_rows := v_atraso_unlinked_rows || '
                    <tr>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 13px;">Fatura ' || COALESCE(v_card.card_name, 'Cartão') || '</td>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: #dc2626; font-size: 13px; white-space: nowrap;">- R$ ' || to_char(v_card.total, 'FM999G999G990D00') || '</td>
                        <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px; white-space: nowrap;">' || to_char(v_card.due_date, 'DD/MM/YYYY') || '</td>
                    </tr>';
                    IF (v_today - v_card.due_date - 1) % 7 = 0 THEN
                        v_atraso_milestone := true;
                    END IF;
                END LOOP;
                IF v_atraso_unlinked_rows <> '' THEN
                    v_atraso_section := v_atraso_section || '
                    <div style="background-color: #f8fafc; border-radius: 12px; padding: 16px; border: 1px solid #e2e8f0; margin-bottom: 16px;">
                        <div style="font-weight: bold; color: #0f172a; font-size: 14px; margin-bottom: 12px;">💳 Cartões de Crédito (Sem conta vinculada)</div>
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead><tr>
                                <th style="padding: 8px 12px; text-align: left; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Fatura</th>
                                <th style="padding: 8px 12px; text-align: right; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Valor</th>
                                <th style="padding: 8px 12px; text-align: center; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Vencimento</th>
                            </tr></thead>
                            <tbody>' || v_atraso_unlinked_rows || '</tbody>
                        </table>
                    </div>';
                END IF;

                -- Só dispara se houver algo vencendo hoje, OU se houver atraso E hoje for
                -- um "marco" de cobrança (1, 8, 15, 22... dias de atraso) — evita nag diário.
                v_should_send := (v_hoje_total > 0) OR (v_atraso_total > 0 AND v_atraso_milestone);

                IF v_should_send THEN
                    IF v_hoje_total > 0 AND v_atraso_total > 0 THEN
                        v_subject := 'Contas em Atraso e Vencendo Hoje - Recebimento $mart';
                        v_header_label := 'Atraso + Hoje';
                        v_intro_text := 'Identificamos <strong>' || v_hoje_total || '</strong> lançamento(s) vencendo hoje e <strong>' || v_atraso_total || '</strong> em atraso. Veja o resumo abaixo:';
                    ELSIF v_hoje_total > 0 THEN
                        v_subject := 'Contas a Vencer Hoje - Recebimento $mart';
                        v_header_label := 'Contas Hoje';
                        v_intro_text := 'Identificamos <strong>' || v_hoje_total || '</strong> lançamento(s) vencendo hoje. Veja o resumo abaixo:';
                    ELSE
                        v_subject := 'Contas em Atraso - Recebimento $mart';
                        v_header_label := 'Contas em Atraso';
                        v_intro_text := 'Identificamos <strong>' || v_atraso_total || '</strong> lançamento(s) em atraso. Veja o resumo abaixo:';
                    END IF;

                    v_body_sections := '';
                    IF v_hoje_total > 0 THEN
                        v_body_sections := v_body_sections || '<div style="font-size: 12px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; margin: 4px 0 10px; color: #16a34a;">🟢 Vencendo Hoje</div>' || v_hoje_section;
                    END IF;
                    IF v_atraso_total > 0 THEN
                        v_body_sections := v_body_sections || '<div style="font-size: 12px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; margin: 20px 0 10px; color: #dc2626;">🔴 Em Atraso</div>' || v_atraso_section;
                    END IF;

                    v_html_body := '
                    <!DOCTYPE html>
                    <html lang="pt-BR">
                    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
                    <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f1f5f9;">
                        <div style="max-width: 600px; margin: 30px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
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
                                            <div style="font-size: 11px; font-weight: bold; color: #ffffff; letter-spacing: 0.5px; line-height: 1.2; text-transform: uppercase;">' || v_header_label || '</div>
                                        </td>
                                    </tr>
                                </table>
                            </div>
                            <div style="padding: 24px; color: #334155; line-height: 1.6;">
                                <p style="font-size: 15px; font-weight: bold; color: #1e293b; margin-top: 0;">Olá, ' || COALESCE(v_user.name, 'Usuário') || '!</p>
                                <p style="font-size: 13px; color: #64748b; margin-bottom: 24px;">' || v_intro_text || '</p>
                                ' || v_body_sections || '
                                <div style="text-align: center; margin-top: 28px;">
                                    <a href="https://recebimentosmart.com.br/dashboard" style="display: inline-block; padding: 12px 28px; background-color: #0d9488; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 13px; box-shadow: 0 4px 6px rgba(13, 148, 136, 0.2);">Acessar Meu Painel Financeiro</a>
                                </div>
                            </div>
                            <div style="text-align: center; padding: 20px; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; background-color: #f8fafc;">
                                <p style="margin: 0;">Recebimento $mart &copy; ' || EXTRACT(YEAR FROM CURRENT_DATE) || ' • Todos os direitos reservados.</p>
                                <p style="font-size: 10px; margin-top: 5px;">Você está recebendo este e-mail devido às configurações de alertas do seu plano <strong>' || COALESCE(v_user.plano::text, 'ativo') || '</strong>.</p>
                            </div>
                        </div>
                    </body>
                    </html>';

                    SELECT net.http_post(
                        url := v_edge_url,
                        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
                        body := jsonb_build_object('recipientEmail', v_user.email, 'subject', v_subject, 'htmlContent', v_html_body)
                    ) INTO v_req_id;

                    PERFORM pg_sleep(0.1);
                END IF;
            END IF;

            -- 2b. E-mail de fechamento da fatura do cartão de crédito (inalterado)
            IF COALESCE(v_user.card_invoice_email_notify_enabled, FALSE) THEN
                FOR v_card IN
                    SELECT id, name, due_day, closing_days_before
                    FROM public.financial_accounts
                    WHERE user_id = v_user.id
                      AND type = 'credit_card'
                      AND is_active = true
                LOOP
                    FOR v_month_offset IN -1..1 LOOP
                        v_due_date := (date_trunc('month', v_today + (v_month_offset * INTERVAL '1 month'))::date + (LEAST(v_card.due_day, 28) - 1) * INTERVAL '1 day')::date;
                        v_closing_date := (v_due_date - (v_card.closing_days_before * INTERVAL '1 day'))::date;

                        IF v_closing_date = v_today THEN
                            v_card_invoice_month := to_char(v_due_date, 'YYYY-MM');

                            SELECT COALESCE(SUM(amount), 0) INTO v_card_total
                            FROM public.financial_transactions
                            WHERE user_id = v_user.id
                              AND account_id = v_card.id
                              AND invoice_month = v_card_invoice_month
                              AND type = 'expense'
                              AND status <> 'cancelled';

                            IF v_card_total > 0 THEN
                                v_subject := 'Fatura Fechada: ' || v_card.name || ' - Recebimento $mart';

                                v_html_body := '
                                <!DOCTYPE html>
                                <html lang="pt-BR">
                                <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
                                <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f1f5f9;">
                                    <div style="max-width: 600px; margin: 30px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
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
                                                        <div style="font-size: 11px; font-weight: bold; color: #ffffff; letter-spacing: 0.5px; line-height: 1.2; text-transform: uppercase;">Fatura Fechada</div>
                                                    </td>
                                                </tr>
                                            </table>
                                        </div>
                                        <div style="padding: 24px; color: #334155; line-height: 1.6;">
                                            <p style="font-size: 15px; font-weight: bold; color: #1e293b; margin-top: 0;">Olá, ' || COALESCE(v_user.name, 'Usuário') || '!</p>
                                            <p style="font-size: 13px; color: #64748b; margin-bottom: 24px;">
                                                Informamos que a fatura do seu cartão <strong>' || COALESCE(v_card.name, 'Cartão') || '</strong> fechou hoje e já está disponível para visualização e pagamento. Veja os detalhes abaixo:
                                            </p>
                                            <div style="background-color: #f8fafc; border-radius: 12px; padding: 20px; border: 1px solid #e2e8f0; margin-bottom: 24px; text-align: center;">
                                                <div style="font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; font-weight: bold; margin-bottom: 4px;">Valor Total Fechado</div>
                                                <div style="font-size: 28px; font-weight: 800; color: #0f172a; margin-bottom: 12px;">R$ ' || to_char(v_card_total, 'FM999G999G990D00') || '</div>
                                                <div style="display: inline-block; padding: 4px 12px; background-color: #fef3c7; color: #d97706; font-size: 11px; font-weight: bold; border-radius: 9999px;">Vence em ' || to_char(v_due_date, 'DD/MM/YYYY') || '</div>
                                            </div>
                                            <div style="text-align: center; margin-top: 28px;">
                                                <a href="https://recebimentosmart.com.br/v2/financeiro/cartoes?cardId=' || v_card.id || '" style="display: inline-block; padding: 12px 28px; background-color: #0d9488; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 13px; box-shadow: 0 4px 6px rgba(13, 148, 136, 0.2);">Ver Detalhes do Cartão</a>
                                            </div>
                                        </div>
                                        <div style="text-align: center; padding: 20px; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; background-color: #f8fafc;">
                                            <p style="margin: 0;">Recebimento $mart &copy; ' || EXTRACT(YEAR FROM CURRENT_DATE) || ' • Todos os direitos reservados.</p>
                                            <p style="font-size: 10px; margin-top: 5px;">Você está recebendo este e-mail devido às configurações de alertas do seu plano <strong>' || COALESCE(v_user.plano::text, 'ativo') || '</strong>.</p>
                                        </div>
                                    </div>
                                </body>
                                </html>';

                                SELECT net.http_post(
                                    url := v_edge_url,
                                    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
                                    body := jsonb_build_object('recipientEmail', v_user.email, 'subject', v_subject, 'htmlContent', v_html_body)
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
$function$;


-- Teste manual do admin: mostra sempre o que existir (hoje/semana + atraso), ignorando o
-- filtro de "marco de 7 dias" do envio automático — é uma prévia sob demanda, não um cron.
CREATE OR REPLACE FUNCTION public.process_due_accounts_notification_test(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_user RECORD;
    v_account RECORD;
    v_card RECORD;
    v_tx RECORD;
    v_rows text;
    v_acc_count int;
    v_account_icon text;
    v_color text;
    v_dest_account_name text;
    v_today date;
    v_frequency text;

    v_section_a text; -- Em Atraso
    v_total_a int;
    v_unlinked_a text;
    v_label_a text := 'Em Atraso';
    v_color_a text := '#dc2626';
    v_icon_a text := '🔴';

    v_section_b text; -- Vencendo Hoje (diário) ou Próximos 7 Dias (semanal)
    v_total_b int;
    v_unlinked_b text;
    v_label_b text;
    v_color_b text;
    v_icon_b text;

    v_range_b_start date;
    v_range_b_end date;

    v_html_body text;
    v_subject text;
    v_header_label text;
    v_intro_text text;
    v_body_sections text;
    v_edge_url text := 'https://kwdweztilsoxxcgudtsz.supabase.co/functions/v1/send-notification-email';
    v_service_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3ZHdlenRpbHNveHhjZ3VkdHN6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDEzMjY3NywiZXhwIjoyMDU5NzA4Njc3fQ.1iKIZqSUyo5VCqFvdJl-ZLdCsXZVmmwnFKA-9zGtA';
    v_req_id bigint;
    v_test_email text := 'andre@andreric.com';
BEGIN
    IF NOT is_admin(auth.uid()) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Apenas administradores podem usar esta função.');
    END IF;

    SELECT id, name, email, plano INTO v_user FROM public.profiles WHERE id = p_user_id;
    IF v_user IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Usuário não encontrado.');
    END IF;

    v_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

    SELECT email_notification_frequency INTO v_frequency FROM public.plans WHERE slug = v_user.plano::text;
    v_frequency := COALESCE(v_frequency, 'daily');

    IF v_frequency = 'weekly' THEN
        v_range_b_start := v_today;
        v_range_b_end := v_today + 6;
        v_label_b := 'Próximos 7 Dias';
        v_color_b := '#d97706';
        v_icon_b := '🟡';
    ELSE
        v_range_b_start := v_today;
        v_range_b_end := v_today;
        v_label_b := 'Vencendo Hoje';
        v_color_b := '#16a34a';
        v_icon_b := '🟢';
    END IF;

    v_section_a := '';
    v_total_a := 0;
    v_section_b := '';
    v_total_b := 0;

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
        v_account_icon := CASE v_account.type
            WHEN 'checking' THEN '🏦'
            WHEN 'savings' THEN '🐷'
            WHEN 'investment' THEN '📈'
            ELSE '💰'
        END;

        -- Em Atraso
        v_rows := '';
        v_acc_count := 0;
        FOR v_tx IN
            SELECT ft.description, ft.type, ft.amount, ft.date
            FROM public.financial_transactions ft
            WHERE ft.user_id = v_user.id AND ft.status = 'pending'
              AND (ft.recurrence_end_date IS NULL OR ft.recurrence_end_date >= ft.date::date)
              AND ft.date::date >= v_today - 365 AND ft.date::date < v_today
              AND ft.account_id = v_account.id AND ft.type IN ('income', 'expense') AND ft.is_template = false
            ORDER BY ft.date ASC
        LOOP
            v_acc_count := v_acc_count + 1;
            v_color := CASE WHEN v_tx.type = 'income' THEN '#16a34a' ELSE '#dc2626' END;
            v_rows := v_rows || '<tr><td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 13px;">' || COALESCE(v_tx.description, 'Sem descrição') || '</td><td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: ' || v_color || '; font-size: 13px; white-space: nowrap;">' || CASE WHEN v_tx.type = 'expense' THEN '- ' ELSE '+ ' END || 'R$ ' || to_char(v_tx.amount, 'FM999G999G990D00') || '</td><td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px; white-space: nowrap;">' || to_char(v_tx.date::date, 'DD/MM/YYYY') || '</td></tr>';
        END LOOP;
        FOR v_card IN SELECT * FROM public._due_card_invoices(v_user.id, v_account.id, v_today - 365, v_today - 1) LOOP
            v_acc_count := v_acc_count + 1;
            v_rows := v_rows || '<tr><td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 13px;">Fatura ' || COALESCE(v_card.card_name, 'Cartão') || '</td><td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: #dc2626; font-size: 13px; white-space: nowrap;">- R$ ' || to_char(v_card.total, 'FM999G999G990D00') || '</td><td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px; white-space: nowrap;">' || to_char(v_card.due_date, 'DD/MM/YYYY') || '</td></tr>';
        END LOOP;
        IF v_acc_count > 0 THEN
            v_total_a := v_total_a + v_acc_count;
            v_section_a := v_section_a || '<div style="background-color: #f8fafc; border-radius: 12px; padding: 16px; border: 1px solid #e2e8f0; margin-bottom: 16px;"><div style="font-weight: bold; color: #0f172a; font-size: 14px; margin-bottom: 12px;">' || v_account_icon || ' ' || v_account.name || '</div><table style="width: 100%; border-collapse: collapse;"><thead><tr><th style="padding: 8px 12px; text-align: left; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Descrição</th><th style="padding: 8px 12px; text-align: right; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Valor</th><th style="padding: 8px 12px; text-align: center; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Vencimento</th></tr></thead><tbody>' || v_rows || '</tbody></table></div>';
        END IF;

        -- Hoje / Próximos 7 Dias
        v_rows := '';
        v_acc_count := 0;
        FOR v_tx IN
            SELECT ft.description, ft.type, ft.amount, ft.date
            FROM public.financial_transactions ft
            WHERE ft.user_id = v_user.id AND ft.status = 'pending'
              AND (ft.recurrence_end_date IS NULL OR ft.recurrence_end_date >= ft.date::date)
              AND ft.date::date >= v_range_b_start AND ft.date::date <= v_range_b_end
              AND ft.account_id = v_account.id AND ft.type IN ('income', 'expense') AND ft.is_template = false
            ORDER BY ft.date ASC
        LOOP
            v_acc_count := v_acc_count + 1;
            v_color := CASE WHEN v_tx.type = 'income' THEN '#16a34a' ELSE '#dc2626' END;
            v_rows := v_rows || '<tr><td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 13px;">' || COALESCE(v_tx.description, 'Sem descrição') || '</td><td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: ' || v_color || '; font-size: 13px; white-space: nowrap;">' || CASE WHEN v_tx.type = 'expense' THEN '- ' ELSE '+ ' END || 'R$ ' || to_char(v_tx.amount, 'FM999G999G990D00') || '</td><td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px; white-space: nowrap;">' || to_char(v_tx.date::date, 'DD/MM/YYYY') || '</td></tr>';
        END LOOP;
        FOR v_card IN SELECT * FROM public._due_card_invoices(v_user.id, v_account.id, v_range_b_start, v_range_b_end) LOOP
            v_acc_count := v_acc_count + 1;
            v_rows := v_rows || '<tr><td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 13px;">Fatura ' || COALESCE(v_card.card_name, 'Cartão') || '</td><td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: #dc2626; font-size: 13px; white-space: nowrap;">- R$ ' || to_char(v_card.total, 'FM999G999G990D00') || '</td><td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px; white-space: nowrap;">' || to_char(v_card.due_date, 'DD/MM/YYYY') || '</td></tr>';
        END LOOP;
        IF v_acc_count > 0 THEN
            v_total_b := v_total_b + v_acc_count;
            v_section_b := v_section_b || '<div style="background-color: #f8fafc; border-radius: 12px; padding: 16px; border: 1px solid #e2e8f0; margin-bottom: 16px;"><div style="font-weight: bold; color: #0f172a; font-size: 14px; margin-bottom: 12px;">' || v_account_icon || ' ' || v_account.name || '</div><table style="width: 100%; border-collapse: collapse;"><thead><tr><th style="padding: 8px 12px; text-align: left; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Descrição</th><th style="padding: 8px 12px; text-align: right; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Valor</th><th style="padding: 8px 12px; text-align: center; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Vencimento</th></tr></thead><tbody>' || v_rows || '</tbody></table></div>';
        END IF;
    END LOOP;

    -- Cartões sem conta vinculada
    v_unlinked_a := '';
    FOR v_card IN SELECT * FROM public._due_card_invoices(v_user.id, NULL, v_today - 365, v_today - 1) LOOP
        v_total_a := v_total_a + 1;
        v_unlinked_a := v_unlinked_a || '<tr><td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 13px;">Fatura ' || COALESCE(v_card.card_name, 'Cartão') || '</td><td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: #dc2626; font-size: 13px; white-space: nowrap;">- R$ ' || to_char(v_card.total, 'FM999G999G990D00') || '</td><td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px; white-space: nowrap;">' || to_char(v_card.due_date, 'DD/MM/YYYY') || '</td></tr>';
    END LOOP;
    IF v_unlinked_a <> '' THEN
        v_section_a := v_section_a || '<div style="background-color: #f8fafc; border-radius: 12px; padding: 16px; border: 1px solid #e2e8f0; margin-bottom: 16px;"><div style="font-weight: bold; color: #0f172a; font-size: 14px; margin-bottom: 12px;">💳 Cartões de Crédito (Sem conta vinculada)</div><table style="width: 100%; border-collapse: collapse;"><thead><tr><th style="padding: 8px 12px; text-align: left; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Fatura</th><th style="padding: 8px 12px; text-align: right; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Valor</th><th style="padding: 8px 12px; text-align: center; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Vencimento</th></tr></thead><tbody>' || v_unlinked_a || '</tbody></table></div>';
    END IF;

    v_unlinked_b := '';
    FOR v_card IN SELECT * FROM public._due_card_invoices(v_user.id, NULL, v_range_b_start, v_range_b_end) LOOP
        v_total_b := v_total_b + 1;
        v_unlinked_b := v_unlinked_b || '<tr><td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 13px;">Fatura ' || COALESCE(v_card.card_name, 'Cartão') || '</td><td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: bold; color: #dc2626; font-size: 13px; white-space: nowrap;">- R$ ' || to_char(v_card.total, 'FM999G999G990D00') || '</td><td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px; white-space: nowrap;">' || to_char(v_card.due_date, 'DD/MM/YYYY') || '</td></tr>';
    END LOOP;
    IF v_unlinked_b <> '' THEN
        v_section_b := v_section_b || '<div style="background-color: #f8fafc; border-radius: 12px; padding: 16px; border: 1px solid #e2e8f0; margin-bottom: 16px;"><div style="font-weight: bold; color: #0f172a; font-size: 14px; margin-bottom: 12px;">💳 Cartões de Crédito (Sem conta vinculada)</div><table style="width: 100%; border-collapse: collapse;"><thead><tr><th style="padding: 8px 12px; text-align: left; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Fatura</th><th style="padding: 8px 12px; text-align: right; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Valor</th><th style="padding: 8px 12px; text-align: center; font-size: 11px; font-weight: bold; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Vencimento</th></tr></thead><tbody>' || v_unlinked_b || '</tbody></table></div>';
    END IF;

    IF (v_total_a + v_total_b) = 0 THEN
        RETURN jsonb_build_object('success', true, 'message', 'Nenhum lançamento pendente.', 'count', 0);
    END IF;

    IF v_total_a > 0 AND v_total_b > 0 THEN
        v_header_label := 'Atraso + ' || v_label_b;
        v_intro_text := 'Identificamos <strong>' || v_total_a || '</strong> lançamento(s) em atraso e <strong>' || v_total_b || '</strong> em ' || lower(v_label_b) || '. Veja o resumo abaixo:';
    ELSIF v_total_a > 0 THEN
        v_header_label := v_label_a;
        v_intro_text := 'Identificamos <strong>' || v_total_a || '</strong> lançamento(s) em atraso. Veja o resumo abaixo:';
    ELSE
        v_header_label := v_label_b;
        v_intro_text := 'Identificamos <strong>' || v_total_b || '</strong> lançamento(s) em ' || lower(v_label_b) || '. Veja o resumo abaixo:';
    END IF;

    v_body_sections := '';
    IF v_total_b > 0 THEN
        v_body_sections := v_body_sections || '<div style="font-size: 12px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; margin: 4px 0 10px; color: ' || v_color_b || ';">' || v_icon_b || ' ' || v_label_b || '</div>' || v_section_b;
    END IF;
    IF v_total_a > 0 THEN
        v_body_sections := v_body_sections || '<div style="font-size: 12px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; margin: 20px 0 10px; color: ' || v_color_a || ';">' || v_icon_a || ' ' || v_label_a || '</div>' || v_section_a;
    END IF;

    v_subject := '[TESTE - ' || COALESCE(v_user.name, v_user.email) || '] ' || v_header_label || ' - Recebimento $mart';

    v_html_body := '
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f1f5f9;">
        <div style="max-width: 600px; margin: 30px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
            <div style="background-color: #0f172a; padding: 16px 24px; border-bottom: 3px solid #0d9488;">
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="vertical-align: middle; width: 36px; padding: 0;">
                            <img src="https://recebimentosmart.com.br/images/logo.svg" alt="R$" style="height: 28px; width: 28px; border-radius: 6px; display: block;">
                        </td>
                        <td style="vertical-align: middle; padding: 0 0 0 8px;">
                            <div style="font-size: 18px; font-weight: bold; color: #ffffff; letter-spacing: -0.5px; line-height: 1.2;">Recebimento <span style="color: #0d9488;">$mart</span></div>
                        </td>
                        <td style="vertical-align: middle; text-align: right; padding: 0;">
                            <div style="font-size: 11px; font-weight: bold; color: #ffffff; letter-spacing: 0.5px; line-height: 1.2; text-transform: uppercase;">TESTE - ' || v_header_label || '</div>
                        </td>
                    </tr>
                </table>
            </div>
            <div style="padding: 24px; color: #334155; line-height: 1.6;">
                <p style="font-size: 15px; font-weight: bold; color: #1e293b; margin-top: 0;">Olá, ' || COALESCE(v_user.name, 'Usuário') || '!</p>
                <p style="font-size: 13px; color: #64748b; margin-bottom: 24px;">' || v_intro_text || '</p>
                ' || v_body_sections || '
                <div style="text-align: center; margin-top: 28px;">
                    <a href="https://recebimentosmart.com.br/dashboard" style="display: inline-block; padding: 12px 28px; background-color: #0d9488; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 13px; box-shadow: 0 4px 6px rgba(13, 148, 136, 0.2);">Acessar Meu Painel Financeiro</a>
                </div>
            </div>
            <div style="text-align: center; padding: 20px; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; background-color: #f8fafc;">
                <p style="margin: 0;">Recebimento $mart &copy; ' || EXTRACT(YEAR FROM CURRENT_DATE) || ' • Todos os direitos reservados.</p>
                <p style="font-size: 10px; margin-top: 5px;">⚠️ Este é um e-mail de TESTE enviado pelo painel administrativo.</p>
            </div>
        </div>
    </body>
    </html>';

    SELECT net.http_post(
        url := v_edge_url,
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
        body := jsonb_build_object('recipientEmail', v_test_email, 'subject', v_subject, 'htmlContent', v_html_body)
    ) INTO v_req_id;

    RETURN jsonb_build_object('success', true, 'message', 'E-mail de teste enviado para ' || v_test_email, 'count', v_total_a + v_total_b);
END;
$function$;
