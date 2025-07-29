-- supabase/migrations/0020_add_referral_logic_to_new_user.sql

-- 1. Remove o trigger existente para que possamos recriar a função
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 2. Recria a função `handle_new_user` com a lógica de indicação
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    referrer_uuid UUID;
BEGIN
    -- Insere o novo perfil
    INSERT INTO public.profiles (id, name, valid_until)
    VALUES (
        new.id,
        new.raw_user_meta_data->>'name',
        (new.raw_user_meta_data->>'valid_until')::timestamptz
    );

    -- Verifica se há um código de indicação nos metadados do novo usuário
    IF new.raw_user_meta_data->>'referral_code' IS NOT NULL THEN
        -- Busca o ID do usuário que indicou (referrer)
        SELECT id INTO referrer_uuid
        FROM public.profiles
        WHERE referral_code = new.raw_user_meta_data->>'referral_code';

        -- Se o referrer for encontrado, insere na tabela de indicações
        IF referrer_uuid IS NOT NULL THEN
            INSERT INTO public.referrals (referrer_id, referred_id)
            VALUES (referrer_uuid, new.id);
        END IF;
    END IF;

    RETURN new;
END;
$$;

-- 3. Recria o trigger que é acionado após cada novo usuário ser criado.
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();