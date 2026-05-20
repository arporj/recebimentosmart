-- Migração: Corrigir horários dos cron jobs para meia-noite BRT (03:00 UTC)
-- e corrigir o job 9 (weekly-due-notification-sunday) que está falhando

-- ============================================================================
-- 1. Job 1: Renovação Diária de Assinaturas
--    De: 0 0 * * * (meia-noite UTC = 21h BRT)
--    Para: 0 3 * * * (03:00 UTC = meia-noite BRT)
-- ============================================================================
SELECT cron.unschedule(1);
SELECT cron.schedule(
  'Renovação Diária de Assinaturas',
  '0 3 * * *',
  $$SELECT public.process_subscription_renewals()$$
);

-- ============================================================================
-- 2. Job 9: Notificação Semanal de Vencimentos
--    PROBLEMA: Usava current_setting('request.header.apikey') que retorna NULL
--    em contexto de cron (não há request HTTP), gerando JSON inválido.
--    CORREÇÃO: Criar função wrapper igual ao padrão do Job 8, usando
--    service_role_key diretamente.
--    HORÁRIO: De 0 0 * * 0 (meia-noite UTC) para 0 3 * * 0 (meia-noite BRT)
-- ============================================================================

-- 2a. Criar a função wrapper para notificações semanais
CREATE OR REPLACE FUNCTION public.invoke_weekly_notifications_function()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    edge_function_url TEXT := 'https://kwdweztilsoxxcgudtsz.supabase.co/functions/v1/cron-weekly-notifications';
    service_role_key TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3ZHdlenRpbHNveHhjZ3VkdHN6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDEzMjY3NywiZXhwIjoyMDU5NzA4Njc3fQ.1iKIZqSUyo5VCqFvdJl-ZLdCsXZVmmwnFKA-9zGtA';
    request_id BIGINT;
    response_status_code INT;
    response_body TEXT;
BEGIN
    -- 1. Inicia a requisição HTTP POST
    SELECT net.http_post(
        url := edge_function_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || service_role_key
        ),
        body := '{}'::jsonb
    ) INTO request_id;

    -- 2. Aguarda a Edge Function processar
    PERFORM pg_sleep(15);

    -- 3. Consulta o resultado
    SELECT T.status_code, T.content
    INTO response_status_code, response_body
    FROM net._http_response AS T
    WHERE T.id = request_id;

    IF response_status_code IS NOT NULL THEN
        RAISE NOTICE 'Weekly Notifications invoked. Request ID: %, Status: %, Body: %', request_id, response_status_code, response_body;
        IF response_status_code < 200 OR response_status_code >= 300 THEN
            RAISE WARNING 'Falha ao invocar Weekly Notifications. Request ID: %, Status: %, Body: %', request_id, response_status_code, response_body;
        END IF;
    ELSE
        RAISE WARNING 'Resposta da Edge Function não disponível após 15 segundos. Request ID: %', request_id;
    END IF;

EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Erro inesperado na função invoke_weekly_notifications_function: %', SQLERRM;
END;
$$;

-- 2b. Remover o job antigo com problema e recriar com a função wrapper
SELECT cron.unschedule(9);
SELECT cron.schedule(
  'weekly-due-notification-sunday',
  '0 3 * * 0',
  $$SELECT public.invoke_weekly_notifications_function();$$
);
