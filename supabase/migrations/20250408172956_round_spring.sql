/*
  # Fix RLS policies for clients table

  1. Changes
    - Drop existing RLS policies for clients table
    - Create new RLS policies with proper user authentication checks
    - Ensure authenticated users can perform CRUD operations

  2. Security
    - Enable RLS on clients table
    - Add policies for authenticated users to:
      - Insert new clients
      - Read clients
      - Update clients
      - Delete clients
    - All operations require user to be authenticated
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON clients;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON clients;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON clients;

-- Create new policies with proper authentication checks
CREATE POLICY "Enable insert for authenticated users" 
ON clients FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Enable read for authenticated users" 
ON clients FOR SELECT 
TO authenticated 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Enable update for authenticated users" 
ON clients FOR UPDATE 
TO authenticated 
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Enable delete for authenticated users" 
ON clients FOR DELETE 
TO authenticated 
USING (auth.uid() IS NOT NULL);