/*
  # Fix profiles table RLS policies for signup

  1. Changes
    - Add INSERT policy for profiles table to allow creation during signup
    - Keep existing policies for UPDATE and SELECT

  2. Security
    - Maintains RLS enabled on profiles table
    - Adds specific policy for INSERT during signup
    - Preserves existing security for other operations
*/

-- Drop existing policies that might conflict
DROP POLICY IF EXISTS "Users can create profile during signup" ON profiles;

-- Add new policy to allow profile creation during signup
CREATE POLICY "Users can create profile during signup"
ON profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);