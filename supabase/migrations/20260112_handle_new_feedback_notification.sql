-- Fix feedback trigger syntax and add error handling
CREATE OR REPLACE FUNCTION public.handle_new_feedback_notification()
RETURNS TRIGGER AS $$
DECLARE
    v_user_email TEXT;
    v_user_name TEXT;
BEGIN
    -- Get user info
    SELECT email, (raw_user_meta_data->>'name') INTO v_user_email, v_user_name
    FROM auth.users
    WHERE id = NEW.user_id;

    -- Invoke edge function to send email with safe JSON parsing
    BEGIN
        PERFORM net.http_post(
            url := 'https://kwdweztilsoxxcgudtsz.supabase.co/functions/v1/send_feedback_email',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || COALESCE((SELECT (current_setting('request.headers', true)::jsonb)->>'apikey'), '')
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
        RAISE WARNING 'Falha ao enviar e-mail de notificação: %', SQLERRM;
    END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;