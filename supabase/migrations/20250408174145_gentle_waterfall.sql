/*
  # Add payment due date to clients table

  1. Changes
    - Add payment_due_day column to clients table
      - Integer between 1-31 representing the day of the month payment is due
    - Update late payment calculation to consider payment due day
*/

ALTER TABLE clients
ADD COLUMN payment_due_day integer CHECK (payment_due_day BETWEEN 1 AND 31);

COMMENT ON COLUMN clients.payment_due_day IS 'Day of the month when payment is due (1-31)';