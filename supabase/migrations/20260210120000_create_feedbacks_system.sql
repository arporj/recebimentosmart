-- Create feedbacks table
CREATE TABLE IF NOT EXISTS public.feedbacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('Crítica', 'Sugestão', 'Outro')),
    subject TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    has_unread_admin BOOLEAN NOT NULL DEFAULT TRUE,
    has_unread_user BOOLEAN NOT NULL DEFAULT FALSE
);

-- Create feedback_messages table
CREATE TABLE IF NOT EXISTS public.feedback_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feedback_id UUID NOT NULL REFERENCES public.feedbacks(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_messages ENABLE ROW LEVEL SECURITY;

-- Policies for feedbacks
CREATE POLICY "Users can view their own feedbacks" ON public.feedbacks
    FOR SELECT USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Users can insert their own feedbacks" ON public.feedbacks
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own feedbacks" ON public.feedbacks
    FOR UPDATE USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- Policies for feedback_messages
CREATE POLICY "Users can view messages for their feedbacks" ON public.feedback_messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.feedbacks f
            WHERE f.id = feedback_messages.feedback_id
            AND (f.user_id = auth.uid() OR public.is_admin(auth.uid()))
        )
    );

CREATE POLICY "Users can insert messages to their feedbacks" ON public.feedback_messages
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.feedbacks f
            WHERE f.id = feedback_messages.feedback_id
            AND (f.user_id = auth.uid() OR public.is_admin(auth.uid()))
        )
    );

-- Trigger function to update feedback status/timestamps on new message
CREATE OR REPLACE FUNCTION public.handle_new_feedback_message()
RETURNS TRIGGER AS $$
DECLARE
    v_feedback_owner UUID;
BEGIN
    -- Get feedback owner
    SELECT user_id INTO v_feedback_owner FROM public.feedbacks WHERE id = NEW.feedback_id;

    -- Update timestamps
    UPDATE public.feedbacks
    SET 
        updated_at = NOW(),
        last_activity_at = NOW(),
        has_unread_admin = CASE WHEN NEW.sender_id = v_feedback_owner THEN TRUE ELSE has_unread_admin END,
        has_unread_user = CASE WHEN NEW.sender_id != v_feedback_owner THEN TRUE ELSE has_unread_user END
    WHERE id = NEW.feedback_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function to notify admin by email on new feedback
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

    -- Invoke edge function to send email
    -- We use the existing send_feedback_email function
    -- Note: We use a safe check for the apikey header to avoid errors if not present
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
        -- If email fails, don't block the feedback creation
        RAISE WARNING 'Falha ao enviar e-mail de notificação: %', SQLERRM;
    END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new feedback notification
CREATE TRIGGER on_new_feedback_created
    AFTER INSERT ON public.feedbacks
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_feedback_notification();

-- Trigger
CREATE TRIGGER on_new_feedback_message
    AFTER INSERT ON public.feedback_messages
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_feedback_message();
