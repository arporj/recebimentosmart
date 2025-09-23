-- Migration: Corrige a criação das tabelas de campos dinâmicos e suas políticas RLS para evitar erro de "already exists"

-- 1. Create custom_fields table
CREATE TABLE IF NOT EXISTS custom_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, name) -- Each user has a unique set of custom field names
);

-- Enable RLS
ALTER TABLE custom_fields ENABLE ROW LEVEL SECURITY;

-- Policies for custom_fields
DROP POLICY IF EXISTS "Allow users to manage their own custom fields" ON custom_fields;
CREATE POLICY "Allow users to manage their own custom fields"
ON custom_fields
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 2. Create client_custom_field_values table
CREATE TABLE IF NOT EXISTS client_custom_field_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    field_id UUID REFERENCES custom_fields(id) ON DELETE CASCADE,
    value TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (client_id, field_id)
);

-- Enable RLS
ALTER TABLE client_custom_field_values ENABLE ROW LEVEL SECURITY;

-- Policies for client_custom_field_values
DROP POLICY IF EXISTS "Allow users to manage their own client custom field values" ON client_custom_field_values;
CREATE POLICY "Allow users to manage their own client custom field values"
ON client_custom_field_values
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM clients
    WHERE clients.id = client_custom_field_values.client_id AND clients.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM clients
    WHERE clients.id = client_custom_field_values.client_id AND clients.user_id = auth.uid()
  )
);

-- As seções de migração de dados e remoção de colunas antigas foram removidas,
-- pois presume-se que já foram executadas em uma migração anterior.