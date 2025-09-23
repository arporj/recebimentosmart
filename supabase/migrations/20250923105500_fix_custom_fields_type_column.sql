-- Migration: Corrige a adição da coluna type na tabela custom_fields para evitar erro de "already exists"

-- Add type column to custom_fields table
ALTER TABLE custom_fields ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'text' NOT NULL;

-- Update existing records to have the default type
UPDATE custom_fields SET type = 'text' WHERE type IS NULL;
