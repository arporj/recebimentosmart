-- Migration: Corrige a criação do tipo plan_type e a adição da coluna plano para evitar erro de "already exists"

-- Adiciona o valor 'trial' ao tipo ENUM plan_type, se ainda não existir.
ALTER TYPE public.plan_type ADD VALUE IF NOT EXISTS 'trial';

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS plano public.plan_type DEFAULT 'basico';

COMMENT ON COLUMN public.profiles.plano IS 'O plano de assinatura atual do usuário.';