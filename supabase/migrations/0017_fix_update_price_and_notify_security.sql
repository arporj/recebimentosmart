-- supabase/migrations/0017_fix_update_price_and_notify_security.sql

-- Corrige a função update_price_and_notify para ser SECURITY DEFINER
-- Isso permite que ela execute operações privilegiadas (como atualizar app_settings e enviar e-mails)
-- com as permissões do usuário que a definiu (geralmente supabase_admin), ignorando RLS.

CREATE OR REPLACE FUNCTION public.update_price_and_notify(new_price TEXT)
RETURNS TEXT AS $$
DECLARE
    user_record RECORD;
    users_notified INT := 0;
    error_details TEXT;
BEGIN
    -- Passo 1: Atualizar o preço na tabela de configurações
    UPDATE public.app_settings
    SET value = new_price
    WHERE key = 'subscription_price';

    -- Passo 2: Iterar sobre todos os usuários ativos para enviar o e-mail
    FOR user_record IN 
        SELECT u.id, u.email, p.name 
        FROM auth.users u
        JOIN public.profiles p ON u.id = p.id
        WHERE p.valid_until > NOW()
    LOOP
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
                GET STACKED DIAGNOSTICS error_details = PG_EXCEPTION_CONTEXT;
                RAISE WARNING 'Falha ao enviar e-mail para: %. Detalhes: %', user_record.email, error_details;
        END;
    END LOOP;

    RETURN 'Preço atualizado para ' || new_price || '. Notificação enviada para ' || users_notified || ' usuários ativos.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
