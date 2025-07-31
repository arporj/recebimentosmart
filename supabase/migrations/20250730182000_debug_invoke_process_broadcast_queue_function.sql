-- Adiciona logs detalhados à função invoke_process_broadcast_queue_function
-- para depurar por que a Edge Function não está sendo invocada.

DROP FUNCTION IF EXISTS public.invoke_process_broadcast_queue_function();

CREATE OR REPLACE FUNCTION public.invoke_process_broadcast_queue_function()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    edge_function_url TEXT := 'https://kwdweztilsoxxcgudtsz.supabase.co/functions/v1/process-broadcast-queue';
    service_role_key TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3ZHdlenRpbHNveHhjZ3VkdHN6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDEzMjY3NywiZXhwIjoyMDU5NzA4Njc3fQ.1iKIZqSUyo5VCqFvdJl-ZLdCsXZVmmwnFKA-9zHpGrA';
    http_response_record RECORD; -- Usar RECORD para inspecionar todos os campos
    response_status INT;
    response_body TEXT;
BEGIN
    -- Faz a requisição POST para a Edge Function e captura o resultado completo
    SELECT * INTO http_response_record
    FROM net.http_post(
        url := edge_function_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || service_role_key
        ),
        body := '{}'::jsonb
    );

    -- Loga o registro completo da resposta HTTP para depuração
    RAISE NOTICE 'HTTP Response Record: %', http_response_record;

    -- Tenta acessar os campos status e body, tratando possíveis erros
    BEGIN
        response_status := http_response_record.status;
        response_body := http_response_record.body;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE WARNING 'Erro ao acessar campos do http_response_record: %. O registro retornado foi: %', SQLERRM, http_response_record;
            -- Define valores padrão para evitar falha posterior
            response_status := 500;
            response_body := 'Erro ao parsear resposta HTTP';
    END;

    RAISE NOTICE 'Edge Function invoked. Status: %, Body: % (se disponível)', response_status, response_body;

    IF response_status < 200 OR response_status >= 300 THEN
        RAISE WARNING 'Falha ao invocar Edge Function. Status: %, Body: % (se disponível)', response_status, response_body;
    END IF;

EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Erro inesperado na função invoke_process_broadcast_queue_function: %', SQLERRM;
END;
$$;
