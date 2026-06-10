-- Fix: remove referência à coluna inexistente "updated_at" na função de auto-confirm
-- A função anterior falhava com:
--   ERROR: column "updated_at" of relation "financial_transactions" does not exist

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
    paid_date = CURRENT_DATE
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
