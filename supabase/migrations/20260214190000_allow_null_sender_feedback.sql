-- Allow null sender_id in feedback_messages to support system messages
ALTER TABLE public.feedback_messages ALTER COLUMN sender_id DROP NOT NULL;

-- Update trigger function to handle NULL sender_id (System Messages)
-- System messages should generally NOT mark as unread for the person who triggered the action,
-- but since system messages are triggered by an action (like status change), 
-- we need to decide who should see it as unread.
-- Logic:
-- If sender_id is NULL (System Message):
--   We assume it's a status change or automated message.
--   Ideally, we want to notify the USER if the ADMIN changed status.
--   We want to notify the ADMIN if the USER reopened the ticket.
--   However, the trigger doesn't know WHO triggered the action easily without extra context or looking at auth.uid().
--   But auth.uid() might be reliable here properly.

CREATE OR REPLACE FUNCTION public.handle_new_feedback_message()
RETURNS TRIGGER AS $$
DECLARE
    v_feedback_owner UUID;
    v_current_user UUID;
BEGIN
    -- Get feedback owner
    SELECT user_id INTO v_feedback_owner FROM public.feedbacks WHERE id = NEW.feedback_id;
    
    -- Get current user (who triggered the action)
    v_current_user := auth.uid();

    -- Update timestamps and unread status
    -- If sender_id is present, logic remains: if sender is owner -> unread admin. If sender is not owner -> unread user.
    -- If sender_id is NULL (System Message), we rely on auth.uid() to know who performed the action.
    -- If auth.uid() == owner -> User did something (e.g. reopened) -> unread ADMIN.
    -- If auth.uid() != owner (e.g. Admin changed status) -> unread USER.
    
    UPDATE public.feedbacks
    SET 
        updated_at = NOW(),
        last_activity_at = NOW(),
        -- Unread Admin: True if sender is owner OR (sender is NULL and current_user is owner)
        has_unread_admin = CASE 
            WHEN NEW.sender_id = v_feedback_owner THEN TRUE 
            WHEN NEW.sender_id IS NULL AND v_current_user = v_feedback_owner THEN TRUE
            ELSE has_unread_admin 
        END,
        -- Unread User: True if sender is NOT owner OR (sender is NULL and current_user is NOT owner)
        has_unread_user = CASE 
            WHEN NEW.sender_id IS DISTINCT FROM v_feedback_owner AND NEW.sender_id IS NOT NULL THEN TRUE
            WHEN NEW.sender_id IS NULL AND v_current_user IS DISTINCT FROM v_feedback_owner THEN TRUE
            ELSE has_unread_user 
        END
    WHERE id = NEW.feedback_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
