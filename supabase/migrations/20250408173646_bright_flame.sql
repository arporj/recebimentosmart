/*
  # Remove authentication requirements

  1. Changes
    - Remove RLS policies that require authentication
    - Create new policies allowing public access
    - Enable public access for all operations on tables

  2. Security
    - WARNING: This removes authentication requirements
    - All data will be publicly accessible
    - All operations (insert, select, update, delete) will be allowed
*/

-- Remove existing policies from clients table
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON clients;
DROP POLICY IF EXISTS "Enable read for authenticated users" ON clients;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON clients;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON clients;

-- Create new public access policies for clients
CREATE POLICY "Enable public insert" ON clients
  FOR INSERT TO public
  WITH CHECK (true);

CREATE POLICY "Enable public read" ON clients
  FOR SELECT TO public
  USING (true);

CREATE POLICY "Enable public update" ON clients
  FOR UPDATE TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Enable public delete" ON clients
  FOR DELETE TO public
  USING (true);

-- Remove existing policies from payments table
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON payments;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON payments;

-- Create new public access policies for payments
CREATE POLICY "Enable public insert" ON payments
  FOR INSERT TO public
  WITH CHECK (true);

CREATE POLICY "Enable public read" ON payments
  FOR SELECT TO public
  USING (true);

-- Remove existing policies from notifications table
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON notifications;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON notifications;

-- Create new public access policies for notifications
CREATE POLICY "Enable public insert" ON notifications
  FOR INSERT TO public
  WITH CHECK (true);

CREATE POLICY "Enable public read" ON notifications
  FOR SELECT TO public
  USING (true);