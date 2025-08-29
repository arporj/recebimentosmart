-- Migration: Atualiza a função `get_all_users_admin` para incluir o plano do usuário.
--
-- Motivo:
-- A página de administração precisa exibir qual plano cada usuário possui.
-- Esta alteração adiciona o campo `plano` aos dados retornados pela função.

CREATE OR REPLACE FUNCTION public.get_all_users_admin()
RETURNS TABLE (
    id UUID,
    name TEXT,
    email TEXT,
    plano public.plan_type, -- Adicionado
    valid_until TIMESTAMPTZ,
    is_admin BOOLEAN,
    created_at TIMESTAMPTZ
)
AS $$
BEGIN
    -- Verifica se o chamador é um administrador antes de executar a query
    IF NOT is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Apenas administradores podem acessar esta informação.';
    END IF;

    -- Retorna a tabela com os dados dos usuários
    RETURN QUERY 
    SELECT 
        u.id,
        p.name,
        u.email::TEXT, -- Cast para TEXT para corresponder ao tipo de retorno
        p.plano, -- Adicionado
        p.valid_until,
        p.is_admin,
        u.created_at
    FROM auth.users u
    LEFT JOIN public.profiles p ON u.id = p.id
    ORDER BY u.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
