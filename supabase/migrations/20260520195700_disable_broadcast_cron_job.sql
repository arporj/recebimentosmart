-- Desativar o Job 8 (process-email-broadcast-queue-job)
-- Motivo: roda a cada 5 minutos desnecessariamente. Não existe tela de envio em massa.
-- Os 2 broadcasts enviados (jul/2025) foram inseridos manualmente via SQL.
-- Quando a tela de admin for criada, o envio será sob demanda (sem cron).
UPDATE cron.job SET active = false WHERE jobid = 8;
