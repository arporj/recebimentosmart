-- Migration: Adiciona coluna email à tabela clients (opcional)
-- Coluna phone já existe mas é NOT NULL na schema original; tornamos nullable aqui
-- para consistência com o novo fluxo de cadastro simplificado

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS email TEXT DEFAULT NULL;

-- Tornar phone nullable (antes era NOT NULL na schema original)
-- Como é um ADD COLUMN IF NOT EXISTS que pode já ser NOT NULL no banco ao vivo,
-- usamos ALTER COLUMN para garantir que seja nullable
ALTER TABLE public.clients
  ALTER COLUMN phone DROP NOT NULL;

COMMENT ON COLUMN public.clients.email IS 'E-mail do cliente para notificações (opcional)';
COMMENT ON COLUMN public.clients.phone IS 'Telefone do cliente para notificações WhatsApp (opcional)';
