/*
  # Add payment frequency to clients table

  1. Changes
    - Add payment_frequency column to clients table
      - ENUM type for payment frequencies (monthly, bimonthly, quarterly, semiannual, annual)
    - Set default value to 'monthly' for existing clients

  2. Security
    - No changes to RLS policies needed
*/

-- Create the payment frequency enum type
DO $$ BEGIN
    CREATE TYPE payment_frequency_type AS ENUM (
        'monthly',
        'bimonthly',
        'quarterly',
        'semiannual',
        'annual'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add payment_frequency column to clients table
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS payment_frequency payment_frequency_type NOT NULL DEFAULT 'monthly';

-- Update existing clients to have monthly frequency
UPDATE clients
SET payment_frequency = 'monthly'
WHERE payment_frequency IS NULL;