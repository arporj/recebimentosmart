-- Create a function to allow admins to delete users
-- This function deletes the user from auth.users, which should cascade to public.profiles and other related tables
-- ONLY if ON DELETE CASCADE is set up correctly in the schema (which it is for profiles).

CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- 1. Check if the executing user is an admin
  -- We assume 'is_admin' function exists or we check the profile of the current user
  -- Based on 0010_create_admin_functions.sql, there is an is_admin(uid) function or we can verify manually.
  -- Let's check public.profiles directly to be safe and explicit.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado. Apenas administradores podem excluir usuários.';
  END IF;

  -- 2. Prevent deleting yourself
  IF auth.uid() = p_user_id THEN
    RAISE EXCEPTION 'Você não pode excluir sua própria conta por aqui.';
  END IF;

  -- 3. Delete the user from auth.users
  -- This requires the function to be SECURITY DEFINER and have access to auth schema
  DELETE FROM auth.users WHERE id = p_user_id;
  
  -- No need to return anything, if it fails it raises exception
END;
$$;
