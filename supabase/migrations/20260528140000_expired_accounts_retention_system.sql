-- Migração: Sistema de Retenção de Contas Expiradas (90 dias) e Régua de e-mails (30, 60, 89 e 90 dias)
-- Data: 28/05/2026
-- Timestamp: 20260528140000

-- 1. Criar a RPC principal de retenção
CREATE OR REPLACE FUNCTION public.process_expired_accounts_retention()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_profile RECORD;
    v_days_expired INTEGER;
    v_subject TEXT;
    v_html_body TEXT;
    v_edge_url TEXT := 'https://kwdweztilsoxxcgudtsz.supabase.co/functions/v1/send-notification-email';
    v_service_key TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3ZHdlenRpbHNveHhjZ3VkdHN6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDEzMjY3NywiZXhwIjoyMDU5NzA4Njc3fQ.1iKIZqSUyo5VCqFvdJl-ZLdCsXZVmmwnFKA-9zGtA';
    v_req_id BIGINT;
BEGIN
    FOR v_profile IN 
        SELECT p.id, p.name, p.email, p.valid_until, p.plano
        FROM public.profiles p
        WHERE p.valid_until IS NOT NULL 
          AND p.deleted_at IS NULL
          AND p.plano::text NOT IN ('free', 'trial')
    LOOP
        -- Calcular quantos dias de atraso se passaram desde valid_until
        v_days_expired := (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::date - v_profile.valid_until::date;

        -- Só processar atrasos a partir de 30 dias
        IF v_days_expired < 30 THEN
            CONTINUE;
        END IF;

        v_html_body := '';
        v_subject := '';

        -- 30 dias: Sentimos sua falta
        IF v_days_expired = 30 THEN
            v_subject := 'Sentimos sua falta! Volte a controlar suas finanças no Recebimento $mart';
            v_html_body := '
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f1f5f9;">
                <div style="max-width: 600px; margin: 30px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
                    <div style="background-color: #0f172a; padding: 24px; text-align: center; border-bottom: 3px solid #14b8a6;">
                        <div style="margin-bottom: 12px;">
                            <img src="https://recebimentosmart.com.br/images/logo.svg" alt="R$" style="height: 40px; width: 40px; border-radius: 8px;">
                        </div>
                        <div style="font-size: 20px; font-weight: bold; letter-spacing: -0.5px;">
                            <span style="color: #ffffff;">Recebimento </span><span style="color: #14b8a6;">$mart</span>
                        </div>
                        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1);">
                            <h1 style="color: #ffffff; margin: 0; font-size: 18px; font-weight: bold;">Sentimos sua falta por aqui!</h1>
                            <p style="color: #94a3b8; margin: 4px 0 0 0; font-size: 12px;">Seus dados financeiros continuam salvos e seguros conosco</p>
                        </div>
                    </div>
                    <div style="padding: 24px; color: #334155; line-height: 1.6;">
                        <p style="font-size: 15px; font-weight: bold; color: #1e293b; margin-top: 0;">Olá, ' || COALESCE(v_profile.name, 'Usuário') || '!</p>
                        <p style="font-size: 13px; color: #475569;">
                            Notamos que faz exatamente <strong>30 dias</strong> desde que sua assinatura expirou e você não acessa a plataforma. Sentimos falta de ajudar você a simplificar a gestão financeira da sua empresa!
                        </p>
                        <p style="font-size: 13px; color: #475569;">
                            Queremos lembrar que <strong>seus dados operacionais, clientes, relatórios e categorias estão inteiramente salvos de forma protegida</strong>. Eles continuam guardados de acordo com as diretrizes da LGPD.
                        </p>
                        <p style="font-size: 13px; color: #475569; margin-bottom: 24px;">
                            Para voltar a usar o painel e regularizar o seu plano, basta reativar sua assinatura clicando no botão abaixo:
                        </p>
                        <div style="text-align: center;">
                            <a href="https://recebimentosmart.com.br/dashboard" style="display: inline-block; padding: 12px 28px; background-color: #14b8a6; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 13px; box-shadow: 0 4px 6px rgba(20, 184, 166, 0.2);">Voltar ao Sistema / Regularizar</a>
                        </div>
                    </div>
                    <div style="text-align: center; padding: 20px; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; background-color: #f8fafc;">
                        <p style="margin: 0;">Recebimento $mart &copy; ' || EXTRACT(YEAR FROM CURRENT_DATE) || ' • Todos os direitos reservados.</p>
                        <p style="font-size: 10px; margin-top: 5px;">Esta mensagem automática foi disparada comercialmente após 30 dias de inadimplência.</p>
                    </div>
                </div>
            </body>
            </html>';

        -- 60 dias: Aviso importante de exclusão definitiva em 30 dias
        ELSIF v_days_expired = 60 THEN
            v_subject := 'Aviso importante: Seus dados cadastrados serão excluídos em 30 dias';
            v_html_body := '
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f1f5f9;">
                <div style="max-width: 600px; margin: 30px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
                    <div style="background-color: #0f172a; padding: 24px; text-align: center; border-bottom: 3px solid #f59e0b;">
                        <div style="margin-bottom: 12px;">
                            <img src="https://recebimentosmart.com.br/images/logo.svg" alt="R$" style="height: 40px; width: 40px; border-radius: 8px;">
                        </div>
                        <div style="font-size: 20px; font-weight: bold; letter-spacing: -0.5px;">
                            <span style="color: #ffffff;">Recebimento </span><span style="color: #f59e0b;">$mart</span>
                        </div>
                        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1);">
                            <h1 style="color: #ffffff; margin: 0; font-size: 18px; font-weight: bold;">Seus dados cadastrados serão apagados</h1>
                            <p style="color: #94a3b8; margin: 4px 0 0 0; font-size: 12px;">Faltam 30 dias para a exclusão física definitiva</p>
                        </div>
                    </div>
                    <div style="padding: 24px; color: #334155; line-height: 1.6;">
                        <p style="font-size: 15px; font-weight: bold; color: #1e293b; margin-top: 0;">Olá, ' || COALESCE(v_profile.name, 'Usuário') || '!</p>
                        <p style="font-size: 13px; color: #475569;">
                            Notificamos que faz exatamente <strong>60 dias</strong> que sua conta está expirada e sem utilização.
                        </p>
                        <p style="font-size: 13px; color: #475569;">
                            Para cumprir com nossa política de privacidade e boas práticas da LGPD, os dados de contas inativas são mantidos sob nossa custódia por um período máximo de 90 dias após o vencimento.
                        </p>
                        <p style="font-size: 13px; color: #475569; font-weight: bold; color: #b45309;">
                            ⚠️ Atenção: Seus dados (clientes, transações financeiras, histórico e relatórios) serão excluídos em definitivo do nosso banco de dados em mais 30 dias (ao completar 90 dias de expiração).
                        </p>
                        <p style="font-size: 13px; color: #475569; margin-bottom: 24px;">
                            Caso queira manter seu histórico financeiro e reativar a sua conta imediatamente sem perder nada, faça o login clicando no botão abaixo:
                        </p>
                        <div style="text-align: center;">
                            <a href="https://recebimentosmart.com.br/dashboard" style="display: inline-block; padding: 12px 28px; background-color: #f59e0b; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 13px; box-shadow: 0 4px 6px rgba(245, 158, 11, 0.2);">Preservar Meus Dados / Reativar</a>
                        </div>
                    </div>
                    <div style="text-align: center; padding: 20px; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; background-color: #f8fafc;">
                        <p style="margin: 0;">Recebimento $mart &copy; ' || EXTRACT(YEAR FROM CURRENT_DATE) || ' • Todos os direitos reservados.</p>
                        <p style="font-size: 10px; margin-top: 5px;">Aviso de privacidade e descarte de dados nos termos do regulamento do sistema.</p>
                    </div>
                </div>
            </body>
            </html>';

        -- 89 dias: ÚLTIMO AVISO URGENTE AMANHÃ APAGA TUDO
        ELSIF v_days_expired = 89 THEN
            v_subject := '🚨 ÚLTIMO AVISO: Todos os seus dados serão apagados AMANHÃ';
            v_html_body := '
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f1f5f9;">
                <div style="max-width: 600px; margin: 30px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
                    <div style="background-color: #0f172a; padding: 24px; text-align: center; border-bottom: 3px solid #dc2626;">
                        <div style="margin-bottom: 12px;">
                            <img src="https://recebimentosmart.com.br/images/logo.svg" alt="R$" style="height: 40px; width: 40px; border-radius: 8px;">
                        </div>
                        <div style="font-size: 20px; font-weight: bold; letter-spacing: -0.5px;">
                            <span style="color: #ffffff;">Recebimento </span><span style="color: #dc2626;">$mart</span>
                        </div>
                        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1);">
                            <h1 style="color: #ffffff; margin: 0; font-size: 18px; font-weight: bold; text-transform: uppercase;">⚠️ Exclusão Permanente Amanhã!</h1>
                            <p style="color: #94a3b8; margin: 4px 0 0 0; font-size: 12px;">Seu histórico será perdido definitivamente em menos de 24 horas</p>
                        </div>
                    </div>
                    <div style="padding: 24px; color: #334155; line-height: 1.6;">
                        <p style="font-size: 15px; font-weight: bold; color: #1e293b; margin-top: 0;">Olá, ' || COALESCE(v_profile.name, 'Usuário') || '!</p>
                        <p style="font-size: 13px; color: #dc2626; font-weight: bold; font-size: 14px;">
                            Este é o último aviso antes do descarte total dos seus dados.
                        </p>
                        <p style="font-size: 13px; color: #475569;">
                            Amanhã completará exatamente <strong>90 dias</strong> desde o encerramento do seu plano. Sob as diretrizes de descarte de nossa Política de Privacidade, **todos os seus dados cadastrados, transações financeiras, contas, clientes e relatórios serão excluídos fisicamente de nosso banco de dados amanhã e nunca mais poderão ser recuperados**.
                        </p>
                        <p style="font-size: 13px; color: #475569; margin-bottom: 24px;">
                            Se você deseja impedir a exclusão irreversível dos seus dados e reativar o sistema para seu controle empresarial, clique no botão de emergência abaixo imediatamente:
                        </p>
                        <div style="text-align: center;">
                            <a href="https://recebimentosmart.com.br/dashboard" style="display: inline-block; padding: 12px 28px; background-color: #dc2626; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 13px; box-shadow: 0 4px 6px rgba(220, 38, 38, 0.2); text-transform: uppercase;">SALVAR MEUS DADOS AGORA</a>
                        </div>
                    </div>
                    <div style="text-align: center; padding: 20px; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; background-color: #f8fafc;">
                        <p style="margin: 0;">Recebimento $mart &copy; ' || EXTRACT(YEAR FROM CURRENT_DATE) || ' • Todos os direitos reservados.</p>
                        <p style="font-size: 10px; margin-top: 5px; color: #dc2626; font-weight: bold;">ALERTA CRÍTICO: Exclusão física definitiva agendada.</p>
                    </div>
                </div>
            </body>
            </html>';

        -- 90 dias ou mais: Exclusão Física Definitiva de Todos os Dados
        ELSIF v_days_expired >= 90 THEN
            -- Exclui o usuário definitivamente na tabela auth.users. As chaves estrangeiras com ON DELETE CASCADE purgam tudo.
            DELETE FROM auth.users WHERE id = v_profile.id;
            RAISE NOTICE 'Usuário % deletado permanentemente por ultrapassar 90 dias de inadimplência.', v_profile.email;
            CONTINUE;
        END IF;

        -- Enviar e-mail se foi definido corpo e assunto (estágios 30, 60 ou 89 dias)
        IF v_html_body <> '' AND v_subject <> '' THEN
            SELECT net.http_post(
                url := v_edge_url,
                headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'Authorization', 'Bearer ' || v_service_key
                ),
                body := jsonb_build_object(
                    'recipientEmail', v_profile.email,
                    'subject', v_subject,
                    'htmlContent', v_html_body
                )
            ) INTO v_req_id;
            
            PERFORM pg_sleep(0.15);
        END IF;

    END LOOP;
END;
$$;


-- 2. Criar a RPC complementar de teste para o Administrador validar todo o fluxo e e-mails de forma imediata!
CREATE OR REPLACE FUNCTION public.process_expired_accounts_retention_test(p_user_id UUID, p_days_expired INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_profile RECORD;
    v_subject TEXT;
    v_html_body TEXT;
    v_edge_url TEXT := 'https://kwdweztilsoxxcgudtsz.supabase.co/functions/v1/send-notification-email';
    v_service_key TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3ZHdlenRpbHNveHhjZ3VkdHN6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDEzMjY3NywiZXhwIjoyMDU5NzA4Njc3fQ.1iKIZqSUyo5VCqFvdJl-ZLdCsXZVmmwnFKA-9zGtA';
    v_req_id BIGINT;
    v_test_email TEXT := 'andre@andreric.com';
BEGIN
    -- Validar se o executor é admin
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND is_admin = true
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Apenas administradores podem testar a rotina.');
    END IF;

    SELECT id, name, email, valid_until, plano
    INTO v_profile
    FROM public.profiles
    WHERE id = p_user_id;

    IF v_profile IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Usuário de teste não encontrado.');
    END IF;

    v_html_body := '';
    v_subject := '';

    -- Montar os templates exatamente iguais para testes
    IF p_days_expired = 30 THEN
        v_subject := '[TESTE 30 DIAS - ' || COALESCE(v_profile.name, v_profile.email) || '] Sentimos sua falta! Volte a controlar suas finanças no Recebimento $mart';
        v_html_body := '
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f1f5f9;">
            <div style="max-width: 600px; margin: 30px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
                <div style="background-color: #0f172a; padding: 24px; text-align: center; border-bottom: 3px solid #14b8a6;">
                    <div style="margin-bottom: 12px;">
                        <img src="https://recebimentosmart.com.br/images/logo.svg" alt="R$" style="height: 40px; width: 40px; border-radius: 8px;">
                    </div>
                    <div style="font-size: 20px; font-weight: bold; letter-spacing: -0.5px;">
                        <span style="color: #ffffff;">Recebimento </span><span style="color: #14b8a6;">$mart</span>
                    </div>
                    <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1);">
                        <h1 style="color: #ffffff; margin: 0; font-size: 18px; font-weight: bold;">Sentimos sua falta por aqui!</h1>
                        <p style="color: #94a3b8; margin: 4px 0 0 0; font-size: 12px;">⚠️ E-MAIL DE TESTE DE 30 DIAS</p>
                    </div>
                </div>
                <div style="padding: 24px; color: #334155; line-height: 1.6;">
                    <p style="font-size: 15px; font-weight: bold; color: #1e293b; margin-top: 0;">Olá, ' || COALESCE(v_profile.name, 'Usuário') || '!</p>
                    <p style="font-size: 13px; color: #475569;">
                        Notamos que faz exatamente <strong>30 dias</strong> desde que sua assinatura expirou e você não acessa a plataforma. Sentimos falta de ajudar você a simplificar a gestão financeira da sua empresa!
                    </p>
                    <p style="font-size: 13px; color: #475569;">
                        Queremos lembrar que <strong>seus dados operacionais, clientes, relatórios e categorias estão inteiramente salvos de forma protegida</strong>. Eles continuam guardados de acordo com as diretrizes da LGPD.
                    </p>
                    <p style="font-size: 13px; color: #475569; margin-bottom: 24px;">
                        Para voltar a usar o painel e regularizar o seu plano, basta reativar sua assinatura clicando no botão abaixo:
                    </p>
                    <div style="text-align: center;">
                        <a href="https://recebimentosmart.com.br/dashboard" style="display: inline-block; padding: 12px 28px; background-color: #14b8a6; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 13px; box-shadow: 0 4px 6px rgba(20, 184, 166, 0.2);">Voltar ao Sistema / Regularizar</a>
                    </div>
                </div>
                <div style="text-align: center; padding: 20px; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; background-color: #f8fafc;">
                    <p style="margin: 0;">Recebimento $mart &copy; ' || EXTRACT(YEAR FROM CURRENT_DATE) || ' • Todos os direitos reservados.</p>
                </div>
            </div>
        </body>
        </html>';

    ELSIF p_days_expired = 60 THEN
        v_subject := '[TESTE 60 DIAS - ' || COALESCE(v_profile.name, v_profile.email) || '] Aviso importante: Seus dados cadastrados serão excluídos em 30 dias';
        v_html_body := '
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f1f5f9;">
            <div style="max-width: 600px; margin: 30px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
                <div style="background-color: #0f172a; padding: 24px; text-align: center; border-bottom: 3px solid #f59e0b;">
                    <div style="margin-bottom: 12px;">
                        <img src="https://recebimentosmart.com.br/images/logo.svg" alt="R$" style="height: 40px; width: 40px; border-radius: 8px;">
                    </div>
                    <div style="font-size: 20px; font-weight: bold; letter-spacing: -0.5px;">
                        <span style="color: #ffffff;">Recebimento </span><span style="color: #f59e0b;">$mart</span>
                    </div>
                    <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1);">
                        <h1 style="color: #ffffff; margin: 0; font-size: 18px; font-weight: bold;">Seus dados cadastrados serão apagados</h1>
                        <p style="color: #94a3b8; margin: 4px 0 0 0; font-size: 12px;">⚠️ E-MAIL DE TESTE DE 60 DIAS</p>
                    </div>
                </div>
                <div style="padding: 24px; color: #334155; line-height: 1.6;">
                    <p style="font-size: 15px; font-weight: bold; color: #1e293b; margin-top: 0;">Olá, ' || COALESCE(v_profile.name, 'Usuário') || '!</p>
                    <p style="font-size: 13px; color: #475569;">
                        Notificamos que faz exatamente <strong>60 dias</strong> que sua conta está expirada e sem utilização.
                    </p>
                    <p style="font-size: 13px; color: #475569;">
                        Para cumprir com nossa política de privacidade e boas práticas da LGPD, os dados de contas inativas são mantidos sob nossa custódia por um período máximo de 90 dias após o vencimento.
                    </p>
                    <p style="font-size: 13px; color: #475569; font-weight: bold; color: #b45309;">
                        ⚠️ Atenção: Seus dados (clientes, transações financeiras, histórico e relatórios) serão excluídos em definitivo do nosso banco de dados em mais 30 dias (ao completar 90 dias de expiração).
                    </p>
                    <p style="font-size: 13px; color: #475569; margin-bottom: 24px;">
                        Caso queira manter seu histórico financeiro e reativar a sua conta imediatamente sem perder nada, faça o login clicando no botão abaixo:
                    </p>
                    <div style="text-align: center;">
                        <a href="https://recebimentosmart.com.br/dashboard" style="display: inline-block; padding: 12px 28px; background-color: #f59e0b; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 13px; box-shadow: 0 4px 6px rgba(245, 158, 11, 0.2);">Preservar Meus Dados / Reativar</a>
                    </div>
                </div>
                <div style="text-align: center; padding: 20px; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; background-color: #f8fafc;">
                    <p style="margin: 0;">Recebimento $mart &copy; ' || EXTRACT(YEAR FROM CURRENT_DATE) || ' • Todos os direitos reservados.</p>
                </div>
            </div>
        </body>
        </html>';

    ELSIF p_days_expired = 89 THEN
        v_subject := '[TESTE 89 DIAS - ' || COALESCE(v_profile.name, v_profile.email) || '] 🚨 ÚLTIMO AVISO: Todos os seus dados serão apagados AMANHÃ';
        v_html_body := '
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f1f5f9;">
            <div style="max-width: 600px; margin: 30px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
                <div style="background-color: #0f172a; padding: 24px; text-align: center; border-bottom: 3px solid #dc2626;">
                    <div style="margin-bottom: 12px;">
                        <img src="https://recebimentosmart.com.br/images/logo.svg" alt="R$" style="height: 40px; width: 40px; border-radius: 8px;">
                    </div>
                    <div style="font-size: 20px; font-weight: bold; letter-spacing: -0.5px;">
                        <span style="color: #ffffff;">Recebimento </span><span style="color: #dc2626;">$mart</span>
                    </div>
                    <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1);">
                        <h1 style="color: #ffffff; margin: 0; font-size: 18px; font-weight: bold; text-transform: uppercase;">⚠️ Exclusão Permanente Amanhã!</h1>
                        <p style="color: #94a3b8; margin: 4px 0 0 0; font-size: 12px;">⚠️ E-MAIL DE TESTE DE 89 DIAS</p>
                    </div>
                </div>
                <div style="padding: 24px; color: #334155; line-height: 1.6;">
                    <p style="font-size: 15px; font-weight: bold; color: #1e293b; margin-top: 0;">Olá, ' || COALESCE(v_profile.name, 'Usuário') || '!</p>
                    <p style="font-size: 13px; color: #dc2626; font-weight: bold; font-size: 14px;">
                        Este é o último aviso antes do descarte total dos seus dados.
                    </p>
                    <p style="font-size: 13px; color: #475569;">
                        Amanhã completará exatamente <strong>90 dias</strong> desde o encerramento do seu plano. Sob as diretrizes de descarte de nossa Política de Privacidade, **todos os seus dados cadastrados, transações financeiras, contas, clientes e relatórios serão excluídos fisicamente de nosso banco de dados amanhã e nunca mais poderão ser recuperados**.
                    </p>
                    <p style="font-size: 13px; color: #475569; margin-bottom: 24px;">
                        Se você deseja impedir a exclusão irreversível dos seus dados e reativar o sistema para seu controle empresarial, clique no botão de emergência abaixo imediatamente:
                    </p>
                    <div style="text-align: center;">
                        <a href="https://recebimentosmart.com.br/dashboard" style="display: inline-block; padding: 12px 28px; background-color: #dc2626; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 13px; box-shadow: 0 4px 6px rgba(220, 38, 38, 0.2); text-transform: uppercase;">SALVAR MEUS DADOS AGORA</a>
                    </div>
                </div>
                <div style="text-align: center; padding: 20px; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; background-color: #f8fafc;">
                    <p style="margin: 0;">Recebimento $mart &copy; ' || EXTRACT(YEAR FROM CURRENT_DATE) || ' • Todos os direitos reservados.</p>
                </div>
            </div>
        </body>
        </html>';

    ELSIF p_days_expired >= 90 THEN
        -- Simulação de 90 dias: Apenas retorna aviso que deletaria o usuário fisicamente
        RETURN jsonb_build_object('success', true, 'message', 'Simulação de 90 dias concluída com êxito. O usuário ' || v_profile.email || ' seria excluído permanentemente via cascade no banco.', 'action', 'deleted');
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Dia de atraso inválido para testes. Use 30, 60, 89 ou 90.');
    END IF;

    -- Enviar para o e-mail de teste administrativamente (andre@andreric.com)
    IF v_html_body <> '' AND v_subject <> '' THEN
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
        
        RETURN jsonb_build_object('success', true, 'message', 'E-mail de teste (' || p_days_expired || ' dias) enviado com sucesso para ' || v_test_email);
    END IF;

    RETURN jsonb_build_object('success', false, 'error', 'Erro desconhecido na montagem do e-mail de teste.');
END;
$$;


-- 3. Agendar a cron job diária no pg_cron
DO $$
DECLARE
    v_job_id BIGINT;
BEGIN
    SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'Processamento de Retenção de Contas Expiradas' LIMIT 1;
    IF v_job_id IS NOT NULL THEN
        PERFORM cron.unschedule(v_job_id);
    END IF;
END;
$$;

SELECT cron.schedule(
  'Processamento de Retenção de Contas Expiradas',
  '30 3 * * *', -- 03:30 UTC = 00:30 BRT
  $$SELECT public.process_expired_accounts_retention();$$
);
