-- Fix feedback trigger authentication and ensure pgnet extension
CREATE EXTENSION IF NOT EXISTS "pgnet" WITH SCHEMA "extensions";

CREATE OR REPLACE FUNCTION public.handle_new_feedback_notification()
RETURNS TRIGGER AS $$
DECLARE
    v_user_email TEXT;
    v_user_name TEXT;
    v_supabase_url TEXT;
    v_service_role_key TEXT;
BEGIN
    -- Get user info from auth.users
    SELECT email, (raw_user_meta_data->>'name') INTO v_user_email, v_user_name
    FROM auth.users
    WHERE id = NEW.user_id;

    -- Get secrets for internal request (Vault/Settings)
    v_supabase_url := current_setting('secrets.SUPABASE_URL', true);
    v_service_role_key := current_setting('secrets.SUPABASE_SERVICE_ROLE_KEY', true);

    -- Fallback to project URL if secret not found
    IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
        v_supabase_url := 'https://kwdweztilsoxxcgudtsz.supabase.co';
    END IF;

    -- Invoke edge function to send email
    -- We use service_role key to ensure permission to invoke the function
    BEGIN
        PERFORM net.http_post(
            url := v_supabase_url || '/functions/v1/send_feedback_email',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || COALESCE(v_service_role_key, (SELECT (current_setting('request.headers', true)::jsonb)->>'apikey'))
            ),
            body := jsonb_build_object(
                'from', v_user_email,
                'name', COALESCE(v_user_name, v_user_email),
                'type', NEW.type,
                'subject', NEW.subject,
                'comment', 'Um novo feedback foi aberto no sistema. Acesse o painel administrativo para responder.'
            )
        );
    EXCEPTION WHEN OTHERS THEN
        -- Log warning but don't fail transaction
        RAISE WARNING 'Falha ao enviar e-mail de notificação de feedback: %', SQLERRM;
    END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-ensure trigger is attached
DROP TRIGGER IF EXISTS on_new_feedback_created ON public.feedbacks;
CREATE TRIGGER on_new_feedback_created
    AFTER INSERT ON public.feedbacks
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_feedback_notification();
