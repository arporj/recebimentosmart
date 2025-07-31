-- Aumenta o tempo de pg_sleep na função invoke_process_broadcast_queue_function
-- para dar mais tempo para a Edge Function responder.

DROP FUNCTION IF EXISTS public.invoke_process_broadcast_queue_function();

CREATE OR REPLACE FUNCTION public.invoke_process_broadcast_queue_function()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    edge_function_url TEXT := 'https://kwdweztilsoxxcgudtsz.supabase.co/functions/v1/process-broadcast-queue';
    service_role_key TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3ZHdlenRpbHNveHhjZ3VkdHN6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDEzMjY3NywiZXhwIjoyMDU5NzA4Njc3fQ.1iKIZqSUyo5VCqFvdJl-ZLdCsXZVmmwnFKA-9zGtA';
    request_id BIGINT;
    response_status_code INT;
    response_body TEXT;
BEGIN
    -- 1. Inicia a requisição HTTP POST e obtém o ID da requisição.
    SELECT net.http_post(
        url := edge_function_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || service_role_key
        ),
        body := '{}'::jsonb
    ) INTO request_id;

    -- 2. Aguarda um período maior para a requisição ser processada e o resultado estar disponível na tabela de respostas.
    PERFORM pg_sleep(15); -- Aumentado para 15 segundos.

    -- 3. Consulta a tabela net._http_response para obter o resultado da requisição.
    SELECT T.status_code, T.content
    INTO response_status_code, response_body
    FROM net._http_response AS T
    WHERE T.id = request_id;

    -- Loga o resultado da invocação da Edge Function
    IF response_status_code IS NOT NULL THEN
        RAISE NOTICE 'Edge Function invoked. Request ID: %, Status: %, Body: %', request_id, response_status_code, response_body;

        -- Verifica se a chamada à Edge Function foi bem-sucedida (status 2xx)
        IF response_status_code < 200 OR response_status_code >= 300 THEN
            RAISE WARNING 'Falha ao invocar Edge Function. Request ID: %, Status: %, Body: %', request_id, response_status_code, response_body;
        END IF;
    ELSE
        RAISE WARNING 'Resposta da Edge Function não disponível em net._http_response após 15 segundos. Request ID: %', request_id;
    END IF;

EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Erro inesperado na função invoke_process_broadcast_queue_function: %', SQLERRM;
END;
$$;
