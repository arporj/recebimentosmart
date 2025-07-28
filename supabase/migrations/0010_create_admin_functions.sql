-- supabase/migrations/0010_create_admin_functions.sql

-- 1. Função para atualizar o preço e notificar usuários ativos
-- Esta função deve ser chamada com a chave de serviço (service_role) a partir de um ambiente seguro (ex: uma Edge Function)
-- pois o envio de e-mails em massa não deve ser exposto diretamente ao cliente.

-- A implementação do envio de e-mail aqui é um placeholder.
-- Você precisará integrar com um serviço de e-mail real (como Resend, Postmark, ou o próprio SMTP do Supabase).
CREATE OR REPLACE FUNCTION public.update_price_and_notify(new_price TEXT)
RETURNS TEXT AS $$
DECLARE
    user_record RECORD;
    email_subject TEXT := 'Atualização no Preço da Assinatura - RecebimentoSmart';
    email_body TEXT;
    users_notified INT := 0;
BEGIN
    -- Passo 1: Atualizar o preço na tabela de configurações
    UPDATE public.app_settings
    SET value = new_price
    WHERE key = 'subscription_price';

    -- Passo 2: Preparar o corpo do e-mail
    email_body := 'Olá, [User]! Gostaríamos de informar que o valor da assinatura do RecebimentoSmart foi atualizado para R$ ' || new_price || ' por mês. Esta alteração será aplicada na sua próxima renovação. Agradecemos por fazer parte da nossa comunidade!';

    -- Passo 3: Iterar sobre todos os usuários ativos e enviar o e-mail
    FOR user_record IN 
        SELECT u.email, p.name 
        FROM auth.users u
        JOIN public.profiles p ON u.id = p.id
        WHERE p.valid_until > NOW()
    LOOP
        -- Substitui o placeholder [User] pelo nome do usuário
        DECLARE
            personalized_body TEXT := REPLACE(email_body, '[User]', COALESCE(user_record.name, 'usuário'));
        BEGIN
            -- Usar a API de admin para enviar um e-mail customizado.
            -- Isso requer que o template de "Invite" no Supabase seja customizado para esta notificação.
            PERFORM supabase.auth.admin.invite_user_by_email(
                user_record.email,
                json_build_object(
                    'name', user_record.name,
                    'new_price', new_price
                )::jsonb
            );
            users_notified := users_notified + 1;
        EXCEPTION
            WHEN OTHERS THEN
                RAISE WARNING 'Falha ao enviar e-mail para: %', user_record.email;
        END;
    END LOOP;

    RETURN 'Preço atualizado para ' || new_price || '. Notificação enviada para ' || users_notified || ' usuários ativos.';
END;
$$ LANGUAGE plpgsql;

-- 2. Função para um admin atualizar a data de validade de um usuário
CREATE OR REPLACE FUNCTION public.admin_update_user_validity(p_user_id UUID, new_valid_until TIMESTAMPTZ)
RETURNS VOID AS $$
BEGIN
    -- Verifica se o chamador é um administrador
    IF NOT is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Apenas administradores podem executar esta ação.';
    END IF;

    UPDATE public.profiles
    SET valid_until = new_valid_until
    WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Função para um admin atualizar o status de admin de um usuário
CREATE OR REPLACE FUNCTION public.admin_update_user_admin_status(p_user_id UUID, p_is_admin BOOLEAN)
RETURNS VOID AS $$
BEGIN
    -- Verifica se o chamador é um administrador
    IF NOT is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Apenas administradores podem executar esta ação.';
    END IF;

    -- Impede que um admin remova o próprio status de admin
    IF auth.uid() = p_user_id AND p_is_admin = FALSE THEN
        RAISE EXCEPTION 'Você não pode remover seu próprio status de administrador.';
    END IF;

    UPDATE public.profiles
    SET is_admin = p_is_admin
    WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
