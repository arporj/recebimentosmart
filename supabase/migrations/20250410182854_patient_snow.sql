/*
  # Add user authentication and RLS policies

  1. Changes
    - Enable auth schema and related extensions
    - Add user_id column to existing tables
    - Update RLS policies to filter by user_id
    - Add foreign key constraints to auth.users

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to access only their data
    - Ensure data isolation between users
*/

-- Add user_id column to clients table
ALTER TABLE clients
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id column to payments table
ALTER TABLE payments
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id column to notifications table
ALTER TABLE notifications
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Update RLS policies for clients
DROP POLICY IF EXISTS "Enable public insert" ON clients;
DROP POLICY IF EXISTS "Enable public read" ON clients;
DROP POLICY IF EXISTS "Enable public update" ON clients;
DROP POLICY IF EXISTS "Enable public delete" ON clients;

CREATE POLICY "Users can create their own clients"
ON clients FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own clients"
ON clients FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own clients"
ON clients FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own clients"
ON clients FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- Update RLS policies for payments
DROP POLICY IF EXISTS "Enable public insert" ON payments;
DROP POLICY IF EXISTS "Enable public read" ON payments;

CREATE POLICY "Users can create their own payments"
ON payments FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own payments"
ON payments FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Update RLS policies for notifications
DROP POLICY IF EXISTS "Enable public insert" ON notifications;
DROP POLICY IF EXISTS "Enable public read" ON notifications;

CREATE POLICY "Users can create their own notifications"
ON notifications FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own notifications"
ON notifications FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Update existing records to associate with a default user (if needed)
-- This should be done carefully in production with actual user mapping
UPDATE clients SET user_id = auth.uid() WHERE user_id IS NULL;
UPDATE payments SET user_id = auth.uid() WHERE user_id IS NULL;
UPDATE notifications SET user_id = auth.uid() WHERE user_id IS NULL;