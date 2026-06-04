-- Migração: Adiciona RPC de teste para fechamento de fatura de cartão de crédito
-- Data: 04/06/2026

CREATE OR REPLACE FUNCTION public.process_card_invoice_notification_test(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
    v_user RECORD;
    v_card RECORD;
    v_card_total numeric;
    v_due_date date;
    v_card_invoice_month text;
    v_html_body text;
    v_subject text;
    v_edge_url text := 'https://kwdweztilsoxxcgudtsz.supabase.co/functions/v1/send-notification-email';
    v_service_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3ZHdlenRpbHNveHhjZ3VkdHN6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDEzMjY3NywiZXhwIjoyMDU5NzA4Njc3fQ.1iKIZqSUyo5VCqFvdJl-ZLdCsXZVmmwnFKA-9zGtA';
    v_req_id bigint;
    v_test_email text := 'andre@andreric.com';
    v_sent_count int := 0;
    v_today date;
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

    -- Loop pelos cartões ativos do usuário
    FOR v_card IN
        SELECT id, name, due_day, closing_days_before
        FROM public.financial_accounts
        WHERE user_id = v_user.id
          AND type = 'credit_card'
          AND is_active = true
        ORDER BY name
    LOOP
        -- Para o teste, consideramos o vencimento no mês atual
        v_due_date := (date_trunc('month', v_today)::date + (LEAST(v_card.due_day, 28) - 1) * INTERVAL '1 day')::date;
        v_card_invoice_month := to_char(v_due_date, 'YYYY-MM');

        -- Calcula total acumulado da fatura para o mês atual
        SELECT COALESCE(SUM(amount), 0) INTO v_card_total
        FROM public.financial_transactions
        WHERE user_id = v_user.id
          AND account_id = v_card.id
          AND invoice_month = v_card_invoice_month
          AND type = 'expense'
          AND status <> 'cancelled';

        -- Envia e-mail se houver gastos na fatura correspondente
        IF v_card_total > 0 THEN
            v_subject := '[TESTE - ' || COALESCE(v_user.name, v_user.email) || '] Fatura Fechada: ' || v_card.name || ' - Recebimento $mart';
            
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
                            <h1 style="color: #ffffff; margin: 0; font-size: 18px; font-weight: bold; letter-spacing: 0.3px;">[TESTE] Fatura Fechada</h1>
                            <p style="color: #94a3b8; margin: 4px 0 0 0; font-size: 12px;">A fatura do seu cartão de crédito fechou e está disponível</p>
                        </div>
                    </div>
                    
                    <!-- Content -->
                    <div style="padding: 24px; color: #334155; line-height: 1.6;">
                        <p style="font-size: 15px; font-weight: bold; color: #1e293b; margin-top: 0;">Olá, ' || COALESCE(v_user.name, 'Usuário') || '!</p>
                        <p style="font-size: 13px; color: #64748b; margin-bottom: 24px;">
                            Informamos que a fatura do seu cartão <strong>' || COALESCE(v_card.name, 'Cartão') || '</strong> fechou hoje (simulado no teste) e já está disponível para visualização e pagamento. Veja os detalhes abaixo:
                        </p>

                        <div style="background-color: #f8fafc; border-radius: 12px; padding: 20px; border: 1px solid #e2e8f0; margin-bottom: 24px; text-align: center;">
                            <div style="font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; font-weight: bold; margin-bottom: 4px;">Valor Total Fechado</div>
                            <div style="font-size: 28px; font-weight: 800; color: #0f172a; margin-bottom: 12px;">R$ ' || to_char(v_card_total, 'FM999G999G990D00') || '</div>
                            <div style="display: inline-block; padding: 4px 12px; background-color: #fef3c7; color: #d97706; font-size: 11px; font-weight: bold; border-radius: 9999px;">
                                Vence em ' || to_char(v_due_date, 'DD/MM/YYYY') || ' (Fatura: ' || v_card_invoice_month || ')
                            </div>
                        </div>
                        
                        <div style="text-align: center; margin-top: 28px;">
                            <a href="https://recebimentosmart.com.br/v2/financeiro/cartoes?cardId=' || v_card.id || '" style="display: inline-block; padding: 12px 28px; background-color: #14b8a6; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 13px; box-shadow: 0 4px 6px rgba(20, 184, 166, 0.2);">Ver Detalhes do Cartão</a>
                        </div>
                    </div>
                    
                    <!-- Footer -->
                    <div style="text-align: center; padding: 20px; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; background-color: #f8fafc;">
                        <p style="margin: 0;">Recebimento $mart &copy; ' || EXTRACT(YEAR FROM CURRENT_DATE) || ' • Todos os direitos reservados.</p>
                        <p style="font-size: 10px; margin-top: 5px;">Você está recebendo este e-mail devido às configurações de alertas de teste do seu plano <strong>' || COALESCE(v_user.plano::text, 'ativo') || '</strong>.</p>
                    </div>
                </div>
            </body>
            </html>';

            -- Invoca a Edge Function de envio de e-mails para o e-mail de teste
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

            v_sent_count := v_sent_count + 1;
            PERFORM pg_sleep(0.1);
        END IF;
    END LOOP;

    IF v_sent_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nenhum dos cartões ativos deste usuário possui gastos lançados para a fatura de ' || to_char(v_today, 'MM/YYYY') || '. Adicione despesas a um cartão deste usuário antes de disparar o teste.');
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Simulação de fechamento enviada com sucesso para andre@andreric.com. Faturas enviadas: ' || v_sent_count::text, 'count', v_sent_count);
END;
$$;
