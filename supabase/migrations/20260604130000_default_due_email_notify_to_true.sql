-- Migração: Define o valor padrão das notificações de e-mail como TRUE e atualiza usuários existentes
-- Data: 04/06/2026

-- 1. Altera o valor padrão das colunas de notificação de e-mail na tabela public.profiles para TRUE
ALTER TABLE public.profiles ALTER COLUMN due_email_notify_enabled SET DEFAULT TRUE;
ALTER TABLE public.profiles ALTER COLUMN card_invoice_email_notify_enabled SET DEFAULT TRUE;

-- 2. Atualiza todos os usuários ativos existentes para estarem habilitados por padrão
UPDATE public.profiles 
SET 
    due_email_notify_enabled = TRUE, 
    card_invoice_email_notify_enabled = TRUE
WHERE deleted_at IS NULL;
