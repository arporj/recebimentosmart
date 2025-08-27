CREATE TYPE public.plan_type AS ENUM (
    'basico',
    'pro',
    'premium'
);

ALTER TABLE public.profiles
ADD COLUMN plano public.plan_type DEFAULT 'basico';

COMMENT ON COLUMN public.profiles.plano IS 'O plano de assinatura atual do usuário.';
