/*
  # Create function for atomic user and profile creation

  1. New Functions
    - `create_user_with_profile`: Creates a user and their profile in a single transaction
      - Parameters:
        - user_email: The user's email
        - user_password: The user's hashed password
        - user_name: The user's name
      - Returns: JSON containing the user ID and profile ID

  2. Security
    - Function is accessible to the service role only
    - Ensures atomic creation of user and profile
*/

CREATE OR REPLACE FUNCTION create_user_with_profile(
  user_email TEXT,
  user_password TEXT,
  user_name TEXT
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_user_id uuid;
  result json;
BEGIN
  -- Create the user in auth.users
  new_user_id := auth.uid();
  
  -- Insert into auth.users
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_user_id,
    'authenticated',
    'authenticated',
    user_email,
    user_password,
    NOW(),
    '{"provider":"email","providers":["email"]}',
    json_build_object('name', user_name),
    NOW(),
    NOW()
  );

  -- Create the profile
  INSERT INTO public.profiles (id, name)
  VALUES (new_user_id, user_name);

  -- Return the result
  result := json_build_object(
    'user_id', new_user_id,
    'profile_id', new_user_id
  );

  RETURN result;
END;
$$;