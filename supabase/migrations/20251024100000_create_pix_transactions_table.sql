
-- supabase/migrations/20251024100000_create_pix_transactions_table.sql

CREATE TABLE pix_transactions (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  amount NUMERIC(10, 2) NOT NULL,
  transaction_id TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, COMPLETED, FAILED
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
