/*
  # Add start date to clients table

  1. Changes
    - Add `start_date` column to `clients` table
    - Default to created_at date for existing clients
    - Make start_date required for new clients

  2. Security
    - No changes to RLS policies needed
*/

ALTER TABLE clients
ADD COLUMN start_date timestamp with time zone NOT NULL DEFAULT now();

-- Set start_date to created_at for existing clients
UPDATE clients
SET start_date = created_at
WHERE start_date = now();