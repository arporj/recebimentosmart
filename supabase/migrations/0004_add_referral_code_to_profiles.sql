-- Migração para adicionar código de indicação aos perfis
-- Execute este script no seu banco Supabase

-- Adicionar coluna referral_code na tabela profiles (se não existir)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20) UNIQUE;

-- Função para gerar código de indicação único
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TEXT AS $$
DECLARE
    chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    result TEXT := '';
    i INTEGER := 0;
    code_exists BOOLEAN := TRUE;
BEGIN
    WHILE code_exists LOOP
        result := '';
        FOR i IN 1..8 LOOP
            result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
        END LOOP;
        
        -- Verificar se o código já existe
        SELECT EXISTS(SELECT 1 FROM profiles WHERE referral_code = result) INTO code_exists;
    END LOOP;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Função para criar código de indicação automaticamente quando um perfil é criado
CREATE OR REPLACE FUNCTION create_referral_code_for_profile()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.referral_code IS NULL THEN
        NEW.referral_code := generate_referral_code();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para gerar código de indicação automaticamente
DROP TRIGGER IF EXISTS trigger_create_referral_code ON profiles;
CREATE TRIGGER trigger_create_referral_code
    BEFORE INSERT ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION create_referral_code_for_profile();

-- Atualizar perfis existentes que não têm código de indicação
UPDATE profiles 
SET referral_code = generate_referral_code() 
WHERE referral_code IS NULL;

-- Criar índice para melhor performance
CREATE INDEX IF NOT EXISTS idx_profiles_referral_code ON profiles(referral_code);

-- Comentários para documentação
COMMENT ON COLUMN profiles.referral_code IS 'Código único de indicação do usuário para compartilhar com outros';
COMMENT ON FUNCTION generate_referral_code() IS 'Gera um código de indicação único de 8 caracteres alfanuméricos';
COMMENT ON FUNCTION create_referral_code_for_profile() IS 'Função trigger para criar código de indicação automaticamente quando um perfil é criado';

