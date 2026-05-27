-- Adiciona a coluna plan_name à tabela pix_transactions para rastrear o plano específico nas cobranças
ALTER TABLE public.pix_transactions
  ADD COLUMN IF NOT EXISTS plan_name text;
