-- Fix: Redefine as funções de geração de código de indicação com SECURITY DEFINER e search_path explícito
-- Isso evita erros de "function generate_referral_code() does not exist" ou tabela não encontrada 
-- durante o cadastro de novos usuários via Supabase Auth (onde o search_path do sistema é restrito).

CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
        
        -- Verificar se o código já existe (referenciando public.profiles de forma explícita)
        SELECT EXISTS(SELECT 1 FROM public.profiles WHERE referral_code = result) INTO code_exists;
    END LOOP;
    
    RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_referral_code_for_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.referral_code IS NULL THEN
        NEW.referral_code := public.generate_referral_code();
    END IF;
    RETURN NEW;
END;
$$;
