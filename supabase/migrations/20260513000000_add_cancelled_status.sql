-- Add 'cancelled' to the status CHECK constraint for soft-delete support
ALTER TABLE financial_transactions
  DROP CONSTRAINT financial_transactions_status_check;

ALTER TABLE financial_transactions
  ADD CONSTRAINT financial_transactions_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'paid'::text, 'partial'::text, 'cancelled'::text]));
