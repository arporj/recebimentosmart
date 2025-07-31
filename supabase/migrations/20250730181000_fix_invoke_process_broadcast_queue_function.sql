
-- Corrige a função para invocar a Edge Function de processamento da fila de broadcast.
-- A versão anterior falhava porque tentava acessar campos inexistentes (`status_code`, `content`)
-- no registro de resposta da chamada HTTP.
-- Esta versão usa os campos corretos: `status` e `body`.

CREATE OR REPLACE FUNCTION public.invoke_process_broadcast_queue_function()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    -- A URL da Edge Function que será chamada.
    edge_function_url TEXT := 'https://kwdweztilsoxxcgudtsz.supabase.co/functions/v1/process-broadcast-queue';
    
    -- A chave de serviço (service_role) para autorizar a chamada.
    -- ATENÇÃO: O ideal é armazenar esta chave de forma segura usando o sistema de secrets do Supabase.
    service_role_key TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3ZHdlenRpbHNveHhjZ3VkdHN6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDEzMjY3NywiZXhwIjoyMDU5NzA4Njc3fQ.1iKIZqSUyo5VCqFvdJl-ZLdCsXZVmmwnFKA-9zHpGrA';
    
    -- Variável para armazenar o resultado da chamada HTTP.
    -- O tipo net.http_response é um tipo composto que contém status, body, etc.
    http_result net.http_response;
    
    response_status INT;
    response_body TEXT;
BEGIN
    -- Executa a requisição POST para a Edge Function e armazena o resultado completo na variável http_result.
    SELECT *
    INTO http_result
    FROM net.http_post(
        url := edge_function_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || service_role_key
        ),
        body := '{}'::jsonb -- O corpo da requisição está vazio, pois a lógica principal está na Edge Function.
    );

    -- Extrai o status e o corpo da resposta da variável http_result.
    response_status := http_result.status;
    response_body := http_result.body;

    -- Loga o resultado para fins de depuração. Isso aparecerá nos logs do PostgreSQL.
    RAISE NOTICE 'Edge Function invoked. Status: %, Body: %', response_status, response_body;

    -- Se a chamada não retornar um status de sucesso (2xx), lança um aviso.
    IF response_status < 200 OR response_status >= 300 THEN
        RAISE WARNING 'Falha ao invocar Edge Function. Status: %, Body: %', response_status, response_body;
    END IF;

EXCEPTION
    -- Captura qualquer outra exceção que possa ocorrer durante a execução da função.
    WHEN OTHERS THEN
        RAISE WARNING 'Erro inesperado ao invocar a Edge Function: %', SQLERRM;
END;
$$;
