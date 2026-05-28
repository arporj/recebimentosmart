-- Migração: Exclusão Lógica e Física, Correção de RLS (PostgREST 400) e Notificações Customizadas
-- Data: 28/05/2026
-- Timestamp: 20260528120000

-- 1. Adicionar colunas necessárias na tabela public.profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS due_email_notify_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS due_email_notify_day_of_week INTEGER DEFAULT 1; -- 1 = Segunda-feira, 0 = Domingo, etc.

-- 2. Adicionar coluna can_due_email_notify na tabela public.plans e atualizar os planos elegíveis
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS can_due_email_notify BOOLEAN DEFAULT false;
UPDATE public.plans SET can_due_email_notify = true WHERE slug IN ('basico', 'pro', 'premium');

-- 3. Atualizar as chaves estrangeiras da tabela payment_transactions e pix_transactions para ON DELETE CASCADE
-- Isso garante integridade absoluta e que a exclusão física remova todos os dados sem deixar lixo ou órfãos
ALTER TABLE public.payment_transactions 
    DROP CONSTRAINT IF EXISTS payment_transactions_user_id_fkey,
    ADD CONSTRAINT payment_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.pix_transactions 
    DROP CONSTRAINT IF EXISTS pix_transactions_user_id_fkey,
    ADD CONSTRAINT pix_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 4. Criar funções SECURITY DEFINER para encapsular as RLS policies com EXISTS/subqueries complexas
-- Isso resolve em definitivo o bug do parser do PostgREST (Error 400 - OR expression) ao rodar PATCH
CREATE OR REPLACE FUNCTION public.fn_has_shared_transaction_access(p_client_id UUID, p_user_email TEXT)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.client_shares
        WHERE client_shares.client_id = p_client_id
          AND LOWER(client_shares.receiver_email) = LOWER(p_user_email)
          AND client_shares.status IN ('pending', 'accepted')
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_has_shared_client_access(p_client_id UUID, p_user_email TEXT)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.client_shares
        WHERE client_shares.client_id = p_client_id
          AND LOWER(client_shares.receiver_email) = LOWER(p_user_email)
          AND client_shares.status IN ('pending', 'accepted')
    );
END;
$$;

-- 5. Redefinir as RLS policies usando as novas funções limpas e de alto desempenho
DROP POLICY IF EXISTS "Users can view shared transactions" ON public.financial_transactions;
CREATE POLICY "Users can view shared transactions" ON public.financial_transactions
    FOR SELECT TO authenticated
    USING ( public.fn_has_shared_transaction_access(client_id, auth.jwt()->>'email') );

DROP POLICY IF EXISTS "Users can view shared clients" ON public.clients;
CREATE POLICY "Users can view shared clients" ON public.clients
    FOR SELECT TO authenticated
    USING ( public.fn_has_shared_client_access(id, auth.jwt()->>'email') );

-- 6. Reescrever a RPC admin_delete_user para implementar exclusão em 2 etapas (Lógica + Física)
DROP FUNCTION IF EXISTS public.admin_delete_user(UUID);
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_deleted_at TIMESTAMPTZ;
    v_result JSONB;
BEGIN
    -- 6.1. Validar se o executor é admin
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND is_admin = true
    ) THEN
        RAISE EXCEPTION 'Acesso negado. Apenas administradores podem excluir usuários.';
    END IF;

    -- 6.2. Evitar auto-deleção
    IF auth.uid() = p_user_id THEN
        RAISE EXCEPTION 'Você não pode excluir sua própria conta por aqui.';
    END IF;

    -- 6.3. Verificar se o usuário já possui deleção lógica
    SELECT deleted_at INTO v_deleted_at
    FROM public.profiles
    WHERE id = p_user_id;

    IF v_deleted_at IS NOT NULL THEN
        -- SEGUNDA ETAPA: Deleção física definitiva
        DELETE FROM auth.users WHERE id = p_user_id;
        v_result := jsonb_build_object('success', true, 'status', 'permanently_deleted');
    ELSE
        -- PRIMEIRA ETAPA: Deleção lógica
        -- Seta deleted_at = NOW() no profile
        UPDATE public.profiles
        SET deleted_at = NOW()
        WHERE id = p_user_id;

        -- Bane o login do usuário no auth.users de forma nativa e limpa no Supabase
        UPDATE auth.users
        SET banned_until = '3000-01-01 00:00:00+00'::TIMESTAMPTZ
        WHERE id = p_user_id;

        v_result := jsonb_build_object('success', true, 'status', 'soft_deleted');
    END IF;

    RETURN v_result;
END;
$$;

-- 7. Reescrever get_all_users_admin para contemplar deleted_at e ordenar excluídos por último
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
    last_sign_in_at TIMESTAMPTZ,
    total_transactions INTEGER,
    deleted_at TIMESTAMPTZ
)
AS $$
BEGIN
    IF NOT is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Apenas administradores podem acessar esta informação.';
    END IF;

    RETURN QUERY
    SELECT
        u.id,
        p.name,
        u.email::TEXT,
        p.plano::TEXT AS plan_name,
        CASE
            WHEN p.deleted_at IS NOT NULL THEN 'deleted'
            WHEN p.plano::TEXT = 'free' THEN 'active'
            WHEN p.valid_until IS NULL THEN 'inactive'
            WHEN p.valid_until > now() THEN 'active'
            ELSE 'expired'
        END AS subscription_status,
        p.valid_until AS subscription_end_date,
        p.is_admin,
        u.created_at,
        u.last_sign_in_at,
        (SELECT count(*)::INTEGER FROM public.financial_transactions ft WHERE ft.user_id = u.id) AS total_transactions,
        p.deleted_at
    FROM auth.users u
    LEFT JOIN public.profiles p ON u.id = p.id
    ORDER BY (p.deleted_at IS NOT NULL) ASC, u.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Atualizar get_user_plan_usage para incluir o novo limite de e-mail no retorno das cotas
CREATE OR REPLACE FUNCTION public.get_user_plan_usage(p_user_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_plano text;
  v_cycle_start timestamp with time zone;
  v_count_transactions integer;
  v_count_clients integer;
  v_count_accounts integer;
  v_count_tags integer;
  v_plan_data record;
  v_result jsonb;
BEGIN
  SELECT p.plano::text INTO v_plano
  FROM public.profiles p
  WHERE p.id = p_user_id;

  v_cycle_start := public.get_current_cycle_start_date(p_user_id);

  SELECT * INTO v_plan_data FROM public.plans WHERE slug = coalesce(v_plano, 'free');
  
  IF NOT FOUND THEN
    v_plan_data.limit_clients := 15;
    v_plan_data.limit_transactions := 30;
    v_plan_data.limit_accounts := 2;
    v_plan_data.limit_tags := 10;
    v_plan_data.can_custom_fields := false;
    v_plan_data.can_custom_categories := false;
    v_plan_data.can_due_email_notify := false;
  END IF;

  SELECT count(*)::integer INTO v_count_clients
  FROM public.clients
  WHERE user_id = p_user_id AND deleted_at IS NULL;

  SELECT count(*)::integer INTO v_count_transactions
  FROM public.user_transaction_usage
  WHERE user_id = p_user_id AND executed_at >= v_cycle_start;

  SELECT count(*)::integer INTO v_count_accounts
  FROM public.financial_accounts
  WHERE user_id = p_user_id AND is_active = true;

  SELECT count(*)::integer INTO v_count_tags
  FROM public.financial_tags
  WHERE user_id = p_user_id;

  v_result := jsonb_build_object(
    'plan_slug', coalesce(v_plano, 'free'),
    'cycle_start', v_cycle_start,
    'usage', jsonb_build_object(
      'clients', v_count_clients,
      'transactions', v_count_transactions,
      'accounts', v_count_accounts,
      'tags', v_count_tags
    ),
    'limits', jsonb_build_object(
      'clients', coalesce(v_plan_data.limit_clients, 15),
      'transactions', coalesce(v_plan_data.limit_transactions, 30),
      'accounts', coalesce(v_plan_data.limit_accounts, 2),
      'tags', coalesce(v_plan_data.limit_tags, 10),
      'can_custom_fields', coalesce(v_plan_data.can_custom_fields, false),
      'can_custom_categories', coalesce(v_plan_data.can_custom_categories, false),
      'can_due_email_notify', coalesce(v_plan_data.can_due_email_notify, false)
    )
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
