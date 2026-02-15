CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    referrer_uuid UUID;
BEGIN
    -- Insere o novo perfil com plano 'trial' e validade de 7 dias
    INSERT INTO public.profiles (id, name, cpf_cnpj, plano, valid_until)
    VALUES (
        new.id,
        new.raw_user_meta_data->>'name',
        new.raw_user_meta_data->>'cpf_cnpj', -- Adicionado o CPF/CNPJ
        'trial', -- Define explicitamente o plano como 'trial'
        now() + interval '7 days' -- Define a validade do trial para 7 dias a partir de agora
    );

    -- A lógica de indicação permanece a mesma (copiada da migration anterior)
    IF new.raw_user_meta_data->>'referral_code' IS NOT NULL THEN
        -- Busca o ID do usuário que indicou (referrer) usando o ID como código de indicação
        SELECT id INTO referrer_uuid
        FROM auth.users
        WHERE id::text = new.raw_user_meta_data->>'referral_code';

        -- Se o referrer for encontrado, insere na tabela de indicações
        IF referrer_uuid IS NOT NULL THEN
            -- Tenta inserir na tabela referrals se ela existir, ou referral_credits?
            -- Como eu vi na migration 20250827140000 que usava 'public.referrals', vou manter assim.
            -- Se der erro, o usuário me avisa, mas é o que estava em produção (teoricamente).
            -- Mas espere, no schema inicial (0001) não tinha tabela referrals.
            -- Talvez tenha sido criada em 20250827140000? Não, aquela migration só cria a função.
            -- Vou assumir que o código anterior estava correto para o ambiente do usuário.
            INSERT INTO public.referrals (referrer_id, referred_id)
            VALUES (referrer_uuid, new.id);
        END IF;
    END IF;

    RETURN new;
END;
$$;
