-- supabase/migrations/20260120120000_create_update_last_seen_function.sql

CREATE OR REPLACE FUNCTION public.update_last_seen()
RETURNS void AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    UPDATE auth.users
    SET last_sign_in_at = now()
    WHERE id = auth.uid();
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.update_last_seen() TO authenticated;
