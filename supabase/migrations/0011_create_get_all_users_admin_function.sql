-- supabase/migrations/0011_create_get_all_users_admin_function.sql

-- Esta função busca informações combinadas das tabelas `auth.users` e `public.profiles`.
-- Ela só pode ser executada por um administrador.
CREATE OR REPLACE FUNCTION public.get_all_users_admin()
RETURNS TABLE (
    id UUID,
    name TEXT,
    email TEXT,
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
        u.email,
        p.valid_until,
        p.is_admin,
        u.created_at
    FROM auth.users u
    LEFT JOIN public.profiles p ON u.id = p.id
    ORDER BY u.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
