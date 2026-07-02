-- Purge all spurious pending transactions generated automatically during page load on 2026-07-02
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT id FROM public.financial_transactions 
    WHERE created_at >= '2026-07-02 12:10:00+00' AND is_template = false
  LOOP
    DELETE FROM public.financial_transactions WHERE id = r.id;
  END LOOP;
END $$;
