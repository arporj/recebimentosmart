/*
  # Fix payments RLS policies

  1. Changes
    - Enable RLS on payments table (if not already enabled)
    - Add policy for authenticated users to insert their own payments (if not exists)
    - Add policy for authenticated users to view their own payments (if not exists)

  2. Security
    - Ensures RLS is enabled
    - Adds missing policies while avoiding conflicts with existing ones
*/

-- Enable RLS on payments table (if not already enabled)
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Add insert policy if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'payments' 
        AND policyname = 'Users can insert their own payments'
    ) THEN
        CREATE POLICY "Users can insert their own payments"
        ON payments
        FOR INSERT
        TO authenticated
        WITH CHECK (auth.uid() = user_id);
    END IF;
END
$$;

-- Add select policy if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'payments' 
        AND policyname = 'Users can view their own payments'
    ) THEN
        CREATE POLICY "Users can view their own payments"
        ON payments
        FOR SELECT
        TO authenticated
        USING (auth.uid() = user_id);
    END IF;
END
$$;