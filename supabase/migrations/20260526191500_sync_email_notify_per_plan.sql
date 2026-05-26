-- 1. Adiciona as colunas de configuração de e-mail alertas por plano à tabela plans
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS email_notification_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS email_notification_frequency TEXT DEFAULT 'daily';

-- 2. Define valores padrão adequados aos requisitos comerciais
UPDATE public.plans SET email_notification_enabled = FALSE WHERE slug = 'free';
UPDATE public.plans SET email_notification_frequency = 'weekly' WHERE slug = 'basico';
UPDATE public.plans SET email_notification_frequency = 'daily' WHERE slug IN ('pro', 'premium');

-- 3. Atualiza as duas RPCs para incluir as novas colunas
DROP FUNCTION IF EXISTS public.get_all_plans_with_prices();

CREATE OR REPLACE FUNCTION public.get_all_plans_with_prices()
 RETURNS TABLE(name text, price_monthly numeric, price_yearly numeric, features jsonb, slug text, limit_transactions integer, limit_clients integer, limit_tags integer, limit_accounts integer, description text, email_notification_enabled boolean, email_notification_frequency text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY 
    SELECT 
        p.name::text,
        p.price_monthly,
        p.price_yearly,
        p.features,
        p.slug::text,
        p.limit_transactions,
        p.limit_clients,
        p.limit_tags,
        p.limit_accounts,
        p.description::text,
        p.email_notification_enabled,
        p.email_notification_frequency
    FROM public.plans p;
END;
$function$;


CREATE OR REPLACE FUNCTION public.get_subscription_page_data(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    result JSONB;
    target_user_id UUID := COALESCE(p_user_id, auth.uid());
    user_plan_details RECORD;
    referral_details RECORD;
    all_plans JSONB;
BEGIN
    -- Garante que o usuário esteja autenticado ou um ID seja fornecido
    IF target_user_id IS NULL THEN
        RAISE EXCEPTION 'ID do usuário não fornecido ou usuário não autenticado.';
    END IF;

    -- Coleta os dados de todos os planos da tabela `plans` com colunas completas
    SELECT jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'price_monthly', p.price_monthly,
        'price_yearly', p.price_yearly,
        'description', p.description,
        'features', p.features,
        'slug', p.slug,
        'limit_transactions', p.limit_transactions,
        'limit_clients', p.limit_clients,
        'limit_tags', p.limit_tags,
        'limit_accounts', p.limit_accounts,
        'email_notification_enabled', p.email_notification_enabled,
        'email_notification_frequency', p.email_notification_frequency
    ))
    INTO all_plans
    FROM public.plans p;

    -- Coleta os dados do perfil do usuário (plano e validade)
    SELECT p.plano, p.valid_until
    INTO user_plan_details
    FROM public.profiles p
    WHERE p.id = target_user_id;

    -- Coleta dados de indicação (lógica de get_full_referral_stats)
    SELECT
        EXISTS(SELECT 1 FROM public.referrals WHERE referred_id = target_user_id) as was_referred,
        (SELECT pr.name FROM public.profiles pr JOIN public.referrals r ON pr.id = r.referrer_id WHERE r.referred_id = target_user_id LIMIT 1) as referrer_name,
        (SELECT COUNT(*) FROM public.referral_credits WHERE referrer_user_id = target_user_id AND status = 'credited') AS available_credits
    INTO referral_details;

    -- Monta o objeto JSON de retorno
    result := jsonb_build_object(
        'plans', all_plans,
        'user', jsonb_build_object(
            'plan', user_plan_details.plano,
            'valid_until', user_plan_details.valid_until,
            'credits', COALESCE(referral_details.available_credits, 0),
            'was_referred', COALESCE(referral_details.was_referred, false),
            'referrer_name', referral_details.referrer_name
        )
    );

    RETURN result;
END;
$function$;


-- 4. Atualiza a RPC update_plan_settings para gravar as novas colunas
CREATE OR REPLACE FUNCTION public.update_plan_settings(prices_data jsonb, limits_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_slug TEXT;
    v_plan_limits JSONB;
BEGIN
    IF NOT is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Apenas administradores podem atualizar as configurações dos planos.';
    END IF;

    -- 1. Preços
    IF prices_data ? 'basico' THEN
        UPDATE public.plans SET price_monthly = (prices_data->>'basico')::INT / 100.0 WHERE slug = 'basico';
    END IF;
    IF prices_data ? 'pro' THEN
        UPDATE public.plans SET price_monthly = (prices_data->>'pro')::INT / 100.0 WHERE slug = 'pro';
    END IF;
    IF prices_data ? 'premium' THEN
        UPDATE public.plans SET price_monthly = (prices_data->>'premium')::INT / 100.0 WHERE slug = 'premium';
    END IF;

    -- 2. Limites estruturados dinâmicos
    IF limits_data IS NOT NULL THEN
        FOR v_slug IN SELECT jsonb_object_keys(limits_data)
        LOOP
            v_plan_limits := limits_data->v_slug;
            
            UPDATE public.plans
            SET 
                limit_transactions = COALESCE((v_plan_limits->>'transactions')::INT, limit_transactions),
                limit_clients = COALESCE((v_plan_limits->>'clients')::INT, limit_clients),
                limit_tags = COALESCE((v_plan_limits->>'tags')::INT, limit_tags),
                limit_accounts = COALESCE((v_plan_limits->>'accounts')::INT, limit_accounts),
                email_notification_enabled = COALESCE((v_plan_limits->>'email_enabled')::BOOLEAN, email_notification_enabled),
                email_notification_frequency = COALESCE(v_plan_limits->>'email_frequency', email_notification_frequency)
            WHERE slug = v_slug;
        END LOOP;
    END IF;
END;
$function$;


-- 5. Atualiza a RPC process_due_accounts_notifications() para consultar as configurações por plano
CREATE OR REPLACE FUNCTION public.process_due_accounts_notifications()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
    v_enabled boolean;
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
    v_is_sunday := EXTRACT(ISODOW FROM (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')) = 7;

    -- 1. Loop em todos os perfis ativos (Free, Básico, Pró, Premium)
    FOR v_user IN 
        SELECT p.id, p.name, p.email, p.plano 
        FROM public.profiles p
        WHERE p.email IS NOT NULL
    LOOP
        -- 2. Busca a configuração de e-mail específica do plano do usuário
        SELECT email_notification_enabled, email_notification_frequency
        INTO v_enabled, v_frequency
        FROM public.plans
        WHERE slug = v_user.plano::text;

        -- Se a notificação não estiver habilitada para este plano, passa para o próximo
        IF NOT COALESCE(v_enabled, FALSE) THEN
            CONTINUE;
        END IF;

        v_frequency := COALESCE(v_frequency, 'daily');

        -- Se a frequência do plano for semanal e hoje não for domingo, passa para o próximo
        IF v_frequency = 'weekly' AND NOT v_is_sunday THEN
            CONTINUE;
        END IF;

        -- 3. Define o horizonte temporal das datas (no fuso de Brasília)
        v_start_date := (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::date;
        IF v_frequency = 'weekly' THEN
            v_end_date := v_start_date + 6;
            v_subject := 'Resumo Semanal de Contas a Vencer - Recebimento $mart';
        ELSE
            v_end_date := v_start_date;
            v_subject := 'Contas a Vencer Hoje - Recebimento $mart';
        END IF;

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
