-- Migration: Corrige a adição da coluna referral_credits para evitar erro de "already exists"

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS referral_credits NUMERIC(10, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.profiles.referral_credits IS 'Créditos acumulados por indicação, em BRL, para serem usados como desconto na próxima fatura.';
