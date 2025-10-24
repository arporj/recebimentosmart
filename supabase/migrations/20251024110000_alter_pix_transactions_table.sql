ALTER TABLE public.pix_transactions
  ALTER COLUMN transaction_id TYPE TEXT,
  ALTER COLUMN status TYPE TEXT;

ALTER TABLE public.pix_transactions
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

COMMENT ON COLUMN public.pix_transactions.status IS 'PENDING, COMPLETED, FAILED';