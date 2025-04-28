/*
  # Initial Schema for Client Payment System

  1. New Tables
    - `clients`
      - `id` (uuid, primary key)
      - `name` (text, client's full name)
      - `phone` (text, formatted phone number)
      - `monthly_payment` (decimal, monthly payment amount)
      - `status` (boolean, active/inactive status)
      - `last_payment_date` (timestamptz, date of last payment)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `payments`
      - `id` (uuid, primary key)
      - `client_id` (uuid, foreign key to clients)
      - `amount` (decimal, payment amount)
      - `payment_date` (timestamptz)
      - `created_at` (timestamptz)
    
    - `notifications`
      - `id` (uuid, primary key)
      - `client_id` (uuid, foreign key to clients)
      - `type` (text, notification type: email/sms)
      - `message` (text)
      - `sent_at` (timestamptz)
      - `status` (text)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users
*/

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Clients table
CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  phone text NOT NULL,
  monthly_payment decimal(10,2) NOT NULL,
  status boolean DEFAULT true,
  last_payment_date timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Payments table
CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  amount decimal(10,2) NOT NULL,
  payment_date timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Notifications table
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  type text NOT NULL,
  message text NOT NULL,
  sent_at timestamptz DEFAULT now(),
  status text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Enable read access for authenticated users" ON clients
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert access for authenticated users" ON clients
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable update access for authenticated users" ON clients
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Enable read access for authenticated users" ON payments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert access for authenticated users" ON payments
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable read access for authenticated users" ON notifications
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert access for authenticated users" ON notifications
  FOR INSERT TO authenticated WITH CHECK (true);

-- Create function to update client's last payment date
CREATE OR REPLACE FUNCTION update_client_last_payment()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE clients
  SET last_payment_date = NEW.payment_date
  WHERE id = NEW.client_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update last payment date
CREATE TRIGGER update_last_payment_date
  AFTER INSERT ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_client_last_payment();

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updating updated_at
CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();