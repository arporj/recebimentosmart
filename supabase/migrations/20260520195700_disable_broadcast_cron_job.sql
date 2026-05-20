-- Desativar o Job 8 (process-email-broadcast-queue-job)
-- Motivo: roda a cada 5 minutos desnecessariamente. Não existe tela de envio em massa.
-- Os 2 broadcasts enviados (jul/2025) foram inseridos manualmente via SQL.
-- Quando a tela de admin for criada, o envio será sob demanda (sem cron).
-- Nota: UPDATE direto em cron.job requer superuser. Usamos cron.alter_job() em vez disso.
SELECT cron.alter_job(8, active := false);
