-- Migration: Adiciona função para criar perfis de usuário com SECURITY DEFINER
--
-- Motivo:
-- Permitir que administradores criem perfis para usuários durante impersonação
-- sem violar as políticas de segurança em nível de linha (RLS)

CREATE OR REPLACE FUNCTION public.admin_create_user_profile(
    p_user_id UUID,
    p_name TEXT,
    p_plano public.plan_type DEFAULT 'basico',
    p_valid_until TIMESTAMPTZ DEFAULT (now() + interval '7 days')
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    profile_data JSONB;
BEGIN
    -- Verifica se o chamador é um administrador
    IF NOT is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Apenas administradores podem executar esta ação.';
    END IF;

    -- Verifica se o perfil já existe
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
        RAISE EXCEPTION 'Perfil já existe para este usuário.';
    END IF;

    -- Insere o novo perfil
    INSERT INTO public.profiles (id, name, plano, valid_until)
    VALUES (p_user_id, p_name, p_plano, p_valid_until);

    -- Retorna os dados do perfil criado
    SELECT row_to_json(p)::JSONB INTO profile_data
    FROM public.profiles p
    WHERE p.id = p_user_id;

    RETURN profile_data;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.admin_create_user_profile IS 'Função para administradores criarem perfis de usuário, contornando as políticas RLS.';