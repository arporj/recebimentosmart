-- Migration: Atualiza a função handle_new_user para incluir a lógica de Trial
--
-- Motivo:
-- Garante que todo novo usuário seja configurado com o plano 'trial'
-- e uma data de validade de 7 dias, de forma explícita e controlada pelo servidor.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    referrer_uuid UUID;
BEGIN
    -- Insere o novo perfil com plano 'trial' e validade de 7 dias
    INSERT INTO public.profiles (id, name, plano, valid_until)
    VALUES (
        new.id,
        new.raw_user_meta_data->>'name',
        'trial', -- Define explicitamente o plano como 'trial'
        now() + interval '7 days' -- Define a validade do trial para 7 dias a partir de agora
    );

    -- A lógica de indicação permanece a mesma
    IF new.raw_user_meta_data->>'referral_code' IS NOT NULL THEN
        -- Busca o ID do usuário que indicou (referrer) usando o ID como código de indicação
        -- NOTA: A lógica original assume que o código de indicação é o UUID do referrer.
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

-- Recria o trigger para garantir que ele use a nova versão da função.
-- Isso é importante para garantir que a alteração na função seja efetivamente utilizada.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
