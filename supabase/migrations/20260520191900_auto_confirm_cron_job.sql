-- Cron job: marca lançamentos com auto_confirm como pagos no dia do vencimento
-- Executa diariamente às 03:00 (horário UTC, ~00:00 BRT)

-- 1. Função que realiza a confirmação automática
CREATE OR REPLACE FUNCTION public.fn_auto_confirm_transactions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected_count integer;
BEGIN
  UPDATE public.financial_transactions
  SET
    status = 'paid',
    updated_at = now()
  WHERE
    auto_confirm = true
    AND status = 'pending'
    AND date <= CURRENT_DATE;

  GET DIAGNOSTICS affected_count = ROW_COUNT;

  IF affected_count > 0 THEN
    RAISE LOG '[auto_confirm] % lançamento(s) confirmado(s) automaticamente em %', affected_count, CURRENT_DATE;
  END IF;
END;
$$;

-- 2. Agendar o cron job para rodar todo dia às 03:00 UTC (~00:00 BRT)
SELECT cron.schedule(
  'auto-confirm-daily',
  '0 3 * * *',
  $$SELECT public.fn_auto_confirm_transactions();$$
);
