-- Fix: remove a coluna removida "cpf_cnpj" da função trigger "handle_new_user"
-- que quebrava o cadastro de novos usuários

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    referrer_uuid UUID;
BEGIN
    -- Insere o novo perfil com plano 'trial', validade de 7 dias e opções de e-mail ativadas
    -- (cpf_cnpj removido de public.profiles na migração anterior)
    INSERT INTO public.profiles (
        id, 
        name, 
        plano, 
        valid_until, 
        due_email_notify_enabled, 
        due_email_notify_day_of_week, 
        card_invoice_email_notify_enabled
    )
    VALUES (
        new.id,
        new.raw_user_meta_data->>'name',
        'trial',
        now() + interval '7 days',
        true, -- due_email_notify_enabled
        0,    -- due_email_notify_day_of_week (Domingo)
        true  -- card_invoice_email_notify_enabled
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
