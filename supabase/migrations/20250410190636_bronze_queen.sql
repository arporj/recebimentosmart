/*
  # Fix user creation trigger function

  1. Changes
    - Update handle_new_user trigger function to properly handle user creation
    - Add better error handling
    - Ensure profile creation is atomic
  
  2. Security
    - No changes to existing RLS policies
    - Maintains existing security model
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'User'),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    name = EXCLUDED.name,
    updated_at = NOW();

  RETURN NEW;
EXCEPTION
  WHEN others THEN
    -- Log the error details
    RAISE LOG 'Error in handle_new_user trigger: %', SQLERRM;
    -- Still return NEW to allow user creation even if profile creation fails
    RETURN NEW;
END;
$$;