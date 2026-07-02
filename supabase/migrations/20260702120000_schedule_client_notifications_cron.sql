-- Migration: Cron job para envio automático de notificações de clientes
-- Executa diariamente à meia-noite (horário de Brasília, UTC-3 = 03:00 UTC)

-- Garante que a extensão pg_cron está disponível
-- (já deve estar habilitada no projeto Supabase)

-- Remove job existente se houver (idempotente)
SELECT cron.unschedule('client-notifications-daily')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'client-notifications-daily'
);

-- Cria o cron job: diariamente às 03:00 UTC (meia-noite em Brasília)
SELECT cron.schedule(
  'client-notifications-daily',   -- nome do job
  '0 3 * * *',                     -- cron expression: todo dia às 03:00 UTC
  $$
  SELECT
    net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/send-client-notifications-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
      ),
      body := '{"trigger":"cron"}'::jsonb
    )
  $$
);

COMMENT ON EXTENSION pg_cron IS 'Cron scheduler for PostgreSQL';
