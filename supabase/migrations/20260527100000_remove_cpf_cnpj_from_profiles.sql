-- Migration: Remove cpf_cnpj column from public.profiles
-- Date: 27/05/2026

-- 1. Redefine handle_new_user trigger function without references to cpf_cnpj
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    referrer_uuid UUID;
BEGIN
    INSERT INTO public.profiles (id, name, email, plano, valid_until)
    VALUES (
        new.id,
        new.raw_user_meta_data->>'name',
        new.email,
        'free',
        NULL
    );

    -- Chama a funcao para popular as categorias padrao do novo usuario
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

-- 2. Drop the column cpf_cnpj from public.profiles
ALTER TABLE public.profiles DROP COLUMN IF EXISTS cpf_cnpj CASCADE;
