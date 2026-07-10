-- Migration: Adiciona rastreamento de onboarding guiado para novos usuários
-- Date: 10/07/2026

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS onboarding_progress jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Atualiza handle_new_user() para que apenas contas criadas a partir de agora
-- comecem com o tour de onboarding pendente (onboarding_completed = false).
-- Contas pré-existentes já ficaram com onboarding_completed = true via DEFAULT acima.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    referrer_uuid UUID;
BEGIN
    INSERT INTO public.profiles (
        id,
        name,
        email,
        plano,
        valid_until,
        due_email_notify_enabled,
        due_email_notify_day_of_week,
        card_invoice_email_notify_enabled,
        onboarding_completed
    )
    VALUES (
        new.id,
        new.raw_user_meta_data->>'name',
        new.email,
        'trial',
        now() + interval '7 days',
        true, -- due_email_notify_enabled
        0,    -- due_email_notify_day_of_week (Domingo)
        true, -- card_invoice_email_notify_enabled
        false -- onboarding_completed: novo usuário começa com o tour pendente
    );

    -- Popula as categorias padrão do novo usuário
    PERFORM public.seed_default_categories(new.id);

    IF new.raw_user_meta_data->>'referral_code' IS NOT NULL THEN
        SELECT id INTO referrer_uuid
        FROM auth.users
        WHERE id::text = new.raw_user_meta_data->>'referral_code';

        IF referrer_uuid IS NOT NULL THEN
            INSERT INTO public.referrals (referrer_id, referred_id)
            VALUES (referrer_uuid, new.id);
        END IF;
    END IF;

    RETURN new;
END;
$$;
