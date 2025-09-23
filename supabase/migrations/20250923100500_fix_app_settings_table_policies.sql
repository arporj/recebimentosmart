-- Migration: Corrige a criação da tabela app_settings e suas políticas RLS para evitar erro de "already exists"

-- 1. Criar a tabela para configurações globais da aplicação
CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS (Row Level Security) na tabela
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- 2. Políticas de Acesso
-- Apenas administradores autenticados podem ler e modificar as configurações.
-- Usamos a função `is_admin()` que verifica o custom claim, que por sua vez é definido por um trigger no perfil.

-- Primeiro, vamos garantir que a função is_admin exista.
-- Se ela já foi criada em outra migration, isso não causará erro.
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    is_admin_flag BOOLEAN;
BEGIN
    SELECT COALESCE(is_admin, FALSE) INTO is_admin_flag
    FROM public.profiles
    WHERE id = p_user_id;
    RETURN is_admin_flag;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Política para permitir que administradores leiam todas as configurações
DROP POLICY IF EXISTS "Allow admins to read all settings" ON public.app_settings;
CREATE POLICY "Allow admins to read all settings"
ON public.app_settings
FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));

-- Política para permitir que administradores modifiquem todas as configurações
DROP POLICY IF EXISTS "Allow admins to update settings" ON public.app_settings;
CREATE POLICY "Allow admins to update settings"
ON public.app_settings
FOR UPDATE
TO authenticated
USING (is_admin(auth.uid()));

-- 3. Inserir a configuração inicial do preço da assinatura
-- Usamos `ON CONFLICT` para evitar erros se a migração for executada mais de uma vez.
INSERT INTO public.app_settings (key, value, description)
VALUES ('subscription_price', '35.00', 'Valor mensal da assinatura padrão em BRL.')
ON CONFLICT (key) DO NOTHING;

-- 4. Trigger para atualizar o campo `updated_at` automaticamente
CREATE OR REPLACE FUNCTION public.handle_app_settings_update()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_app_settings_update ON public.app_settings;
CREATE TRIGGER on_app_settings_update
BEFORE UPDATE ON public.app_settings
FOR EACH ROW EXECUTE FUNCTION public.handle_app_settings_update();
