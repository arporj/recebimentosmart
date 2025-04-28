/*
  # Add next payment date to clients table

  1. Changes
    - Add next_payment_date column to clients table
    - Create function to calculate next payment date based on frequency
    - Update trigger function to set next_payment_date when payment is registered
    - Calculate initial next_payment_date for existing clients

  2. Security
    - No changes to RLS policies needed
*/

-- Add next_payment_date column to clients table
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS next_payment_date timestamptz;

-- Create function to calculate next payment date
CREATE OR REPLACE FUNCTION calculate_next_payment_date(
  payment_timestamp timestamptz,
  payment_freq payment_frequency_type,
  payment_day integer
)
RETURNS timestamptz AS $$
DECLARE
  next_date timestamptz;
  months_to_add integer;
BEGIN
  -- Set months to add based on frequency
  months_to_add := CASE payment_freq
    WHEN 'monthly' THEN 1
    WHEN 'bimonthly' THEN 2
    WHEN 'quarterly' THEN 3
    WHEN 'semiannual' THEN 6
    WHEN 'annual' THEN 12
  END;

  -- Calculate initial next date by adding months
  next_date := payment_timestamp + (months_to_add || ' months')::interval;
  
  -- Set the correct payment day
  next_date := date_trunc('month', next_date) + ((payment_day - 1) || ' days')::interval;
  
  -- If the calculated date is before or equal to payment_timestamp, add one more period
  IF next_date <= payment_timestamp THEN
    next_date := next_date + (months_to_add || ' months')::interval;
  END IF;

  RETURN next_date;
END;
$$ LANGUAGE plpgsql;

-- Update the trigger function to set next_payment_date
CREATE OR REPLACE FUNCTION update_client_last_payment()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE clients
  SET 
    last_payment_date = NEW.payment_date,
    next_payment_date = calculate_next_payment_date(
      NEW.payment_date,
      payment_frequency,
      payment_due_day
    )
  WHERE id = NEW.client_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Calculate initial next_payment_date for existing clients
UPDATE clients
SET next_payment_date = calculate_next_payment_date(
  COALESCE(last_payment_date, start_date),
  payment_frequency,
  payment_due_day
)
WHERE next_payment_date IS NULL;