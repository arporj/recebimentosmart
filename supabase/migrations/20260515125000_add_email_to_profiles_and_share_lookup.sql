-- Migration: Add email to profiles and configure search lookup
-- Date: 15/05/2026

-- 1. Add email column to public.profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Backfill existing email values from auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND (p.email IS NULL OR p.email <> u.email);

-- 3. Create a unique index on email for fast lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles (email);

-- 4. Update handle_new_user trigger function to save email
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
        new.email, -- Salvando o e-mail diretamente da tabela auth.users
        new.raw_user_meta_data->>'cpf_cnpj',
        'free',
        NULL
    );

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

-- 5. Create secure RPC function to fetch public profile name by email
CREATE OR REPLACE FUNCTION public.get_profile_by_email(email_search text)
RETURNS TABLE (
    id uuid,
    name text,
    email text
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT p.id, p.name, p.email
    FROM public.profiles p
    WHERE LOWER(p.email) = LOWER(email_search)
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_profile_by_email(text) TO authenticated;

-- 6. Create RLS Policy for public.profiles to allow viewing profiles involved in sharing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'profiles' AND policyname = 'Permitir visualizacao de perfil para participantes de compartilhamento'
  ) THEN
    CREATE POLICY "Permitir visualizacao de perfil para participantes de compartilhamento"
    ON public.profiles FOR SELECT TO authenticated
    USING (
      id IN (SELECT sender_id FROM public.client_shares WHERE LOWER(receiver_email) = LOWER(auth.jwt()->>'email'))
      OR
      LOWER(email) IN (SELECT LOWER(receiver_email) FROM public.client_shares WHERE sender_id = auth.uid())
    );
  END IF;
END $$;
