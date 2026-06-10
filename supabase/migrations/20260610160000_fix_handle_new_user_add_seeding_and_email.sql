-- Fix: Corrige a função trigger handle_new_user() para incluir o email do usuário no insert,
-- chamar a função seed_default_categories() para popular as categorias básicas do novo usuário,
-- e definir explicitamente o search_path por segurança.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    referrer_uuid UUID;
BEGIN
    -- Insere o novo perfil com plano 'trial', validade de 7 dias, email e opções de e-mail ativadas
    INSERT INTO public.profiles (
        id, 
        name, 
        email,
        plano, 
        valid_until, 
        due_email_notify_enabled, 
        due_email_notify_day_of_week, 
        card_invoice_email_notify_enabled
    )
    VALUES (
        new.id,
        new.raw_user_meta_data->>'name',
        new.email,
        'trial',
        now() + interval '7 days',
        true, -- due_email_notify_enabled
        0,    -- due_email_notify_day_of_week (Domingo)
        true  -- card_invoice_email_notify_enabled
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

-- Backfill para usuários criados recentemente que ficaram sem categorias cadastradas
DO $$
DECLARE
    r_user RECORD;
BEGIN
    FOR r_user IN 
        SELECT id FROM public.profiles 
        WHERE id NOT IN (SELECT DISTINCT user_id FROM public.financial_categories)
    LOOP
        PERFORM public.seed_default_categories(r_user.id);
    END LOOP;
END $$;
