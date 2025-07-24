-- supabase/migrations/0006_add_valid_until_to_profiles.sql

-- Adiciona a coluna para rastrear a data de validade da assinatura/trial
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ;
