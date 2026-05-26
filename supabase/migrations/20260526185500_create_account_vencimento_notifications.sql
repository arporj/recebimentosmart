-- Cria a função de disparo de alertas de vencimento de contas por e-mail
CREATE OR REPLACE FUNCTION public.process_due_accounts_notifications()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
    v_enabled text;
    v_frequency text;
    v_is_sunday boolean;
    v_start_date date;
    v_end_date date;
    v_subject text;
    v_user RECORD;
    v_tx RECORD;
    v_html_rows text;
    v_html_body text;
    v_tx_count int;
    v_edge_url text := 'https://kwdweztilsoxxcgudtsz.supabase.co/functions/v1/send-notification-email';
    v_service_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3ZHdlenRpbHNveHhjZ3VkdHN6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDEzMjY3NywiZXhwIjoyMDU5NzA4Njc3fQ.1iKIZqSUyo5VCqFvdJl-ZLdCsXZVmmwnFKA-9zGtA';
    v_req_id bigint;
BEGIN
    -- 1. Carrega configurações da tabela app_settings
    SELECT value INTO v_enabled FROM public.app_settings WHERE key = 'notify_email_enabled';
    SELECT value INTO v_frequency FROM public.app_settings WHERE key = 'notify_email_frequency';

    -- Se não estiver explicitamente 'true', encerra
    IF COALESCE(v_enabled, 'false') <> 'true' THEN
        RETURN;
    END IF;

    v_frequency := COALESCE(v_frequency, 'daily');
    v_is_sunday := EXTRACT(ISODOW FROM (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')) = 7;

    -- Se for semanal e não for domingo, encerra
    IF v_frequency = 'weekly' AND NOT v_is_sunday THEN
        RETURN;
    END IF;

    -- 2. Define o horizonte temporal das datas (no fuso de Brasília)
    v_start_date := (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::date;
    IF v_frequency = 'weekly' THEN
        v_end_date := v_start_date + 6;
        v_subject := 'Resumo Semanal de Contas a Vencer - Recebimento $mart';
    ELSE
        v_end_date := v_start_date;
        v_subject := 'Contas a Vencer Hoje - Recebimento $mart';
    END IF;

    -- 3. Loop em todos os perfis ativos com planos pagos (basico, pro, premium)
    FOR v_user IN 
        SELECT id, name, email, plano 
        FROM public.profiles 
        WHERE plano::text IN ('basico', 'pro', 'premium') 
          AND email IS NOT NULL
    LOOP
        v_html_rows := '';
        v_tx_count := 0;

        -- Busca as contas pendentes daquele usuário no horizonte de datas
        FOR v_tx IN 
            SELECT description, type, amount, date
            FROM public.financial_transactions
            WHERE user_id = v_user.id
              AND status = 'pending'
              AND date::date >= v_start_date
              AND date::date <= v_end_date
            ORDER BY date ASC, type DESC
        LOOP
            v_tx_count := v_tx_count + 1;
            v_html_rows := v_html_rows || '
            <tr>
                <td style="padding: 12px; border-bottom: 1px solid #eeeeee; font-weight: bold; color: #333333;">' || COALESCE(v_tx.description, 'Sem descrição') || '</td>
                <td style="padding: 12px; border-bottom: 1px solid #eeeeee; text-align: center;">
                    <span style="padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: bold; ' || 
                    CASE WHEN v_tx.type = 'income' THEN 'background-color: #e6f7ed; color: #20a060;' ELSE 'background-color: #fdf2f2; color: #e02424;' END || '">
                        ' || CASE WHEN v_tx.type = 'income' THEN 'Receber' ELSE 'Pagar' END || '
                    </span>
                </td>
                <td style="padding: 12px; border-bottom: 1px solid #eeeeee; text-align: center; font-weight: bold; color: #333333;">R$ ' || to_char(v_tx.amount, 'FM999G999G990D00') || '</td>
                <td style="padding: 12px; border-bottom: 1px solid #eeeeee; text-align: center; color: #666666;">' || to_char(v_tx.date::date, 'DD/MM/YYYY') || '</td>
            </tr>';
        END LOOP;

        -- Se o usuário tiver contas pendentes, dispara o e-mail
        IF v_tx_count > 0 THEN
            v_html_body := '
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <style>
                    body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f6f6; }
                    .container { max-width: 600px; margin: 30px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.06); border: 1px solid #eef2f2; }
                    .header { background-color: #29a8a8; color: #ffffff; padding: 30px 20px; text-align: center; }
                    .header h1 { margin: 0; font-size: 22px; font-weight: bold; }
                    .header p { margin: 5px 0 0 0; font-size: 13px; opacity: 0.9; }
                    .content { padding: 30px 24px; color: #4b5563; }
                    .greeting { font-size: 16px; font-weight: bold; color: #1f2937; margin-bottom: 10px; }
                    .summary { margin-bottom: 25px; font-size: 14px; line-height: 1.6; }
                    .table-container { border: 1px solid #eef2f2; border-radius: 8px; overflow: hidden; margin-top: 15px; }
                    table { width: 100%; border-collapse: collapse; font-size: 13px; }
                    th { background-color: #f8fafc; padding: 12px; font-weight: bold; text-align: left; color: #64748b; border-bottom: 1px solid #eef2f2; }
                    .footer { text-align: center; padding: 25px; font-size: 11px; color: #9ca3af; border-top: 1px solid #f3f4f6; background-color: #fafafa; }
                    .btn-action { display: inline-block; padding: 12px 24px; background-color: #29a8a8; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 13px; margin-top: 25px; box-shadow: 0 4px 6px rgba(41, 168, 168, 0.15); }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>' || CASE WHEN v_frequency = 'weekly' THEN 'Seu Resumo Semanal Financeiro' ELSE 'Alerta de Contas Hoje' END || '</h1>
                        <p>Acompanhe suas contas pendentes e mantenha seu fluxo saudável</p>
                    </div>
                    <div class="content">
                        <p class="greeting">Olá, ' || COALESCE(v_user.name, 'Usuário') || '!</p>
                        <p class="summary">
                            Identificamos que você possui <strong>' || v_tx_count || '</strong> conta(s) pendente(s) com vencimento ' || 
                            CASE WHEN v_frequency = 'weekly' THEN 'nesta semana (próximos 7 dias)' ELSE 'hoje' END || '. Segue abaixo o resumo detalhado dos lançamentos:
                        </p>
                        
                        <div class="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th style="padding: 12px;">Descrição</th>
                                        <th style="padding: 12px; text-align: center;">Tipo</th>
                                        <th style="padding: 12px; text-align: center;">Valor</th>
                                        <th style="padding: 12px; text-align: center;">Vencimento</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ' || v_html_rows || '
                                </tbody>
                            </table>
                        </div>
                        
                        <div style="text-align: center;">
                            <a href="https://recebimentosmart.com.br/dashboard" class="btn-action">Acessar Meu Painel Financeiro</a>
                        </div>
                    </div>
                    <div class="footer">
                        <p>Recebimento $mart &copy; ' || EXTRACT(YEAR FROM CURRENT_DATE) || ' • Todos os direitos reservados.</p>
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
            
            -- pg_sleep pequeno apenas para dar uma folga entre disparos de rede concorrentes
            PERFORM pg_sleep(0.1);
        END IF;
    END LOOP;
END;
$$;

-- Insere as configurações padrão na tabela app_settings
INSERT INTO public.app_settings (key, value, description)
VALUES 
  ('notify_email_enabled', 'true', 'Controle global de disparo de alertas de vencimento por e-mail (true/false)'),
  ('notify_email_frequency', 'daily', 'Frequência do disparo do alerta de vencimento (daily/weekly)')
ON CONFLICT (key) DO NOTHING;

-- Configuração do pg_cron para disparo diário às 08:00 UTC (05:00 da manhã no horário de Brasília)
DO $$
DECLARE
    v_job_id BIGINT;
BEGIN
    SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'Notificação de Contas por E-mail' LIMIT 1;
    IF v_job_id IS NOT NULL THEN
        PERFORM cron.unschedule(v_job_id);
    END IF;
END;
$$;

SELECT cron.schedule(
  'Notificação de Contas por E-mail',
  '0 8 * * *',
  $$SELECT public.process_due_accounts_notifications();$$
);
