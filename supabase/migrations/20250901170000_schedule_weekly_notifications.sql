-- Migration: Schedule Weekly Due Payments Notification
--
-- Running every Sunday at 00:00 (Midnight)
-- CRON Expression: 0 0 * * 0

SELECT
  cron.schedule(
    'weekly-due-notification-sunday', -- Job Name
    '0 0 * * 0',                      -- Schedule (Every Sunday at 00:00)
    $$
    SELECT
      net.http_post(
        url:='https://kwdweztilsoxxcgudtsz.supabase.co/functions/v1/cron-weekly-notifications',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('request.header.apikey', true) || '"}'::jsonb,
        body:='{}'::jsonb
      ) as request_id;
    $$
  );
