-- Corrigido: Script para a função get_all_users_admin que busca os dados da tabela `profiles`.

DROP FUNCTION IF EXISTS public.get_all_users_admin();

CREATE OR REPLACE FUNCTION public.get_all_users_admin()
RETURNS TABLE (
    id UUID,
    name TEXT,
    email TEXT,
    plan_name TEXT,
    subscription_status TEXT,
    subscription_end_date TIMESTAMPTZ,
    is_admin BOOLEAN,
    created_at TIMESTAMPTZ,
    last_sign_in_at TIMESTAMPTZ
)
AS $$
BEGIN
    -- Verifica se o chamador é um administrador
    IF NOT is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Apenas administradores podem acessar esta informação.';
    END IF;

    -- Retorna a tabela com os dados dos usuários e suas informações de assinatura da tabela de perfis
    RETURN QUERY
    SELECT
        u.id,
        p.name,
        u.email::TEXT,
        p.plano::TEXT AS plan_name, -- O plano está na tabela de perfis
        CASE
            WHEN p.valid_until IS NULL THEN 'inactive'
            WHEN p.valid_until > now() THEN 'active'
            ELSE 'expired'
        END AS subscription_status, -- O status é derivado da data de validade
        p.valid_until AS subscription_end_date, -- A data de validade também está nos perfis
        p.is_admin,
        u.created_at,
        u.last_sign_in_at
    FROM auth.users u
    LEFT JOIN public.profiles p ON u.id = p.id
    ORDER BY u.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comentário sobre a correção:
-- A versão anterior desta função tentava buscar informações de plano e assinatura (`plan_name`, `status`, `end_date`)
-- da tabela `public.subscriptions`. No entanto, uma análise do esquema do banco de dados revelou que essas
-- colunas não existem na tabela `subscriptions`. A informação correta do plano (`plano`) e a data de expiração
-- (`valid_until`) estão na tabela `public.profiles`.
--
-- Esta versão corrigida:
-- 1. Remove a CTE (Common Table Expression) desnecessária e incorreta que lia da tabela `subscriptions`.
-- 2. Busca o nome do plano (`plano`) e a data de validade (`valid_until`) diretamente da tabela `profiles`.
-- 3. Deriva o status da assinatura (`subscription_status`) com base na data de `valid_until`.
-- 4. Mantém a adição da coluna `last_sign_in_at` como pretendido.
-- 5. Usa `plano` como o nome da coluna do plano, pois é o que consta na maioria das migrações relevantes.
