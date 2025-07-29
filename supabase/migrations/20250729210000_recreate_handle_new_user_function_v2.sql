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
        -- Busca o ID do usuário que indicou (referrer) usando o ID como código de indicação
        SELECT id INTO referrer_uuid
        FROM auth.users
        WHERE id::text = new.raw_user_meta_data->>'referral_code';

        -- Se o referrer for encontrado, insere na tabela de indicações
        IF referrer_uuid IS NOT NULL THEN
            INSERT INTO public.referrals (referrer_id, referred_id)
            VALUES (referrer_uuid, new.id);
        END IF;
    END IF;

    RETURN new;
END;
$$;

-- Recria o trigger que é acionado após cada novo usuário ser criado.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();