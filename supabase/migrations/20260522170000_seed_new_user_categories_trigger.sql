-- Migration: Adiciona seed_default_categories na criacao de usuarios e popula usuarios existentes
-- Date: 22/05/2026

-- 1. Atualiza a funcao handle_new_user para chamar seed_default_categories
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    referrer_uuid UUID;
BEGIN
    INSERT INTO public.profiles (id, name, email, cpf_cnpj, plano, valid_until)
    VALUES (
        new.id,
        new.raw_user_meta_data->>'name',
        new.email,
        new.raw_user_meta_data->>'cpf_cnpj',
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

-- 2. Backfill para usuarios existentes que nao possuem nenhuma categoria cadastrada
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
