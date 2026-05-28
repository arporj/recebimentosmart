-- Migração: Adicionar RPC admin_restore_user para restauração de usuários excluídos logicamente
-- Data: 28/05/2026
-- Timestamp: 20260528130000

CREATE OR REPLACE FUNCTION public.admin_restore_user(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_result JSONB;
BEGIN
    -- Validar se o executor é admin
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND is_admin = true
    ) THEN
        RAISE EXCEPTION 'Acesso negado. Apenas administradores podem restaurar usuários.';
    END IF;

    -- Restaurar o profile
    UPDATE public.profiles
    SET deleted_at = NULL
    WHERE id = p_user_id;

    -- Desbanir o login do usuário no auth.users de forma nativa
    UPDATE auth.users
    SET banned_until = NULL
    WHERE id = p_user_id;

    v_result := jsonb_build_object('success', true);
    RETURN v_result;
END;
$$;
