-- Function to get all feedbacks for admin with user details
-- This avoids the need for direct foreign key lookup on auth.users which is restricted

CREATE OR REPLACE FUNCTION public.get_admin_feedbacks()
RETURNS TABLE (
    id UUID,
    user_id UUID,
    type TEXT,
    subject TEXT,
    status TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    last_activity_at TIMESTAMPTZ,
    has_unread_admin BOOLEAN,
    has_unread_user BOOLEAN,
    user_data JSONB
)
AS $$
BEGIN
    -- Check if user is admin
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    RETURN QUERY
    SELECT 
        f.id,
        f.user_id,
        f.type,
        f.subject,
        f.status,
        f.created_at,
        f.updated_at,
        f.last_activity_at,
        f.has_unread_admin,
        f.has_unread_user,
        jsonb_build_object(
            'email', u.email,
            'user_metadata', u.raw_user_meta_data
        ) AS user_data
    FROM public.feedbacks f
    JOIN auth.users u ON f.user_id = u.id
    ORDER BY f.last_activity_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
