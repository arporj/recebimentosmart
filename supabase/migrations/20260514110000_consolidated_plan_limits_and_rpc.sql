-- Migração Consolidada e Expansão de Cotas Operacionais (Versão Definitiva)
-- Data: 14/05/2026

-- 1. Adiciona as novas colunas necessárias à tabela plans
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS slug text UNIQUE;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS limit_clients integer DEFAULT 15;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS limit_transactions integer DEFAULT 30;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS limit_accounts integer DEFAULT 2;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS limit_tags integer DEFAULT 10;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS can_custom_fields boolean DEFAULT false;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS can_custom_categories boolean DEFAULT false;

-- 2. Popula/atualiza os slugs dos planos existentes
UPDATE public.plans SET slug = 'basico' WHERE name = 'Básico' AND slug IS NULL;
UPDATE public.plans SET slug = 'pro' WHERE name = 'Pró' AND slug IS NULL;
UPDATE public.plans SET slug = 'premium' WHERE name = 'Premium' AND slug IS NULL;

-- 3. Upsert do plano Free e atualização das cotas dos demais planos
INSERT INTO public.plans (name, slug, description, price_monthly, price_yearly, features, limit_clients, limit_transactions, limit_accounts, limit_tags, can_custom_fields, can_custom_categories)
VALUES (
  'Free', 
  'free', 
  'Plano gratuito com anúncios para organizar suas finanças básicas.', 
  0.00, 
  0.00, 
  '["Até 15 clientes", "Até 30 transações mensais", "Máximo 2 contas bancárias", "Até 10 tags", "Exibição de anúncios"]'::jsonb,
  15, 
  30, 
  2, 
  10, 
  false, 
  false
)
ON CONFLICT (slug) DO UPDATE SET
  limit_clients = EXCLUDED.limit_clients,
  limit_transactions = EXCLUDED.limit_transactions,
  limit_accounts = EXCLUDED.limit_accounts,
  limit_tags = EXCLUDED.limit_tags,
  can_custom_fields = EXCLUDED.can_custom_fields,
  can_custom_categories = EXCLUDED.can_custom_categories;

UPDATE public.plans SET 
  limit_clients = -1,
  limit_transactions = 60,
  limit_accounts = -1,
  limit_tags = -1,
  can_custom_fields = true,
  can_custom_categories = true
WHERE slug = 'basico';

UPDATE public.plans SET 
  limit_clients = -1,
  limit_transactions = 120,
  limit_accounts = -1,
  limit_tags = -1,
  can_custom_fields = true,
  can_custom_categories = true
WHERE slug = 'pro';

UPDATE public.plans SET 
  limit_clients = -1,
  limit_transactions = -1,
  limit_accounts = -1,
  limit_tags = -1,
  can_custom_fields = true,
  can_custom_categories = true
WHERE slug = 'premium';

-- 4. Tabela de auditoria de uso (user_transaction_usage)
CREATE TABLE IF NOT EXISTS public.user_transaction_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id uuid,
  action_type text NOT NULL, -- 'INSERT' ou 'UPDATE'
  executed_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.user_transaction_usage ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'user_transaction_usage' AND policyname = 'Users can view their own transaction usage'
  ) THEN
    CREATE POLICY "Users can view their own transaction usage" 
    ON public.user_transaction_usage 
    FOR SELECT 
    TO authenticated 
    USING (auth.uid() = user_id);
  END IF;
END $$;

-- 5. Trigger de auditoria em financial_transactions
CREATE OR REPLACE FUNCTION public.log_financial_transaction_activity()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.user_transaction_usage (user_id, transaction_id, action_type, executed_at)
    VALUES (NEW.user_id, NEW.id, 'INSERT', now());
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.user_transaction_usage (user_id, transaction_id, action_type, executed_at)
    VALUES (NEW.user_id, NEW.id, 'UPDATE', now());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_financial_transaction_change ON public.financial_transactions;
CREATE TRIGGER on_financial_transaction_change
AFTER INSERT OR UPDATE ON public.financial_transactions
FOR EACH ROW
EXECUTE FUNCTION public.log_financial_transaction_activity();

-- 6. Triggers de novos perfis e migrações de perfis trial
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    referrer_uuid UUID;
BEGIN
    INSERT INTO public.profiles (id, name, cpf_cnpj, plano, valid_until)
    VALUES (
        new.id,
        new.raw_user_meta_data->>'name',
        new.raw_user_meta_data->>'cpf_cnpj',
        'free',
        NULL
    );

    IF new.raw_user_meta_data->>'referral_code' IS NOT NULL THEN
        SELECT id INTO referrer_uuid
        FROM auth.users
        WHERE id::text = new.raw_user_meta_data->>'referral_code';

        IF referrer_uuid IS NOT NULL THEN
            INSERT INTO public.referrals (referrer_id, referred_id)
            VALUES (referrer_uuid, new.id);
        END IF;
    END IF;

    RETURN new;
END;
$$;

UPDATE public.profiles SET plano = 'free' WHERE plano = 'trial';

-- 7. Função auxiliar de ciclo
CREATE OR REPLACE FUNCTION public.get_current_cycle_start_date(p_user_id uuid)
RETURNS timestamp with time zone AS $$
DECLARE
  v_base_date timestamp with time zone;
  v_plano public.plan_type;
  v_cycle_start timestamp with time zone;
  v_now timestamp with time zone := now();
  v_day integer;
  v_candidate timestamp with time zone;
BEGIN
  SELECT plano, created_at, last_payment_at 
  INTO v_plano, v_base_date, v_cycle_start
  FROM public.profiles 
  WHERE id = p_user_id;

  IF v_plano = 'free' OR v_plano = 'trial' OR v_cycle_start IS NULL THEN
    v_base_date := coalesce(v_base_date, v_now);
  ELSE
    v_base_date := v_cycle_start;
  END IF;

  v_day := extract(day from v_base_date)::integer;

  BEGIN
    v_candidate := make_timestamptz(
      extract(year from v_now)::integer, 
      extract(month from v_now)::integer, 
      v_day, 0, 0, 0, 'UTC'
    );
  EXCEPTION WHEN OTHERS THEN
    v_candidate := date_trunc('month', v_now) + interval '1 month' - interval '1 day';
  END;

  IF v_candidate > v_now THEN
    BEGIN
      v_candidate := make_timestamptz(
        extract(year from (v_now - interval '1 month'))::integer, 
        extract(month from (v_now - interval '1 month'))::integer, 
        v_day, 0, 0, 0, 'UTC'
      );
    EXCEPTION WHEN OTHERS THEN
      v_candidate := date_trunc('month', v_now - interval '1 month') + interval '1 month' - interval '1 day';
    END;
  END IF;

  RETURN v_candidate;
END;
$$ LANGUAGE plpgsql STABLE;

-- 8. Recriar a RPC principal de cotas do usuário get_user_plan_usage
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
      'can_custom_categories', coalesce(v_plan_data.can_custom_categories, false)
    )
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 9. Recriações e Drops para funções Administrativas
DROP FUNCTION IF EXISTS public.get_all_users_admin();
DROP FUNCTION IF EXISTS public.get_all_plans_with_prices();
DROP FUNCTION IF EXISTS public.update_plan_settings(JSONB, JSONB);

-- 9.1. get_all_users_admin
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
    total_transactions INTEGER
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
            WHEN p.plano::TEXT = 'free' THEN 'active'
            WHEN p.valid_until IS NULL THEN 'inactive'
            WHEN p.valid_until > now() THEN 'active'
            ELSE 'expired'
        END AS subscription_status,
        p.valid_until AS subscription_end_date,
        p.is_admin,
        u.created_at,
        u.last_sign_in_at,
        (SELECT count(*)::INTEGER FROM public.financial_transactions ft WHERE ft.user_id = u.id) AS total_transactions
    FROM auth.users u
    LEFT JOIN public.profiles p ON u.id = p.id
    ORDER BY u.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9.2. get_all_plans_with_prices (Retornando todos os novos limites para configuração)
CREATE OR REPLACE FUNCTION public.get_all_plans_with_prices()
RETURNS TABLE (
    name TEXT,
    price_monthly NUMERIC,
    price_yearly NUMERIC,
    features JSONB,
    slug TEXT,
    limit_transactions INTEGER,
    limit_clients INTEGER,
    limit_tags INTEGER,
    limit_accounts INTEGER
)
AS $$
BEGIN
    RETURN QUERY 
    SELECT 
        p.name,
        p.price_monthly,
        p.price_yearly,
        p.features,
        p.slug,
        p.limit_transactions,
        p.limit_clients,
        p.limit_tags,
        p.limit_accounts
    FROM public.plans p
    ORDER BY p.price_monthly;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION public.get_all_plans_with_prices() TO anon;
GRANT EXECUTE ON FUNCTION public.get_all_plans_with_prices() TO authenticated;

-- 9.3. update_plan_settings (Reescrito para aceitar loops JSON e configurar todos os limites dinamicamente)
CREATE OR REPLACE FUNCTION public.update_plan_settings(prices_data JSONB, limits_data JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_slug TEXT;
    v_plan_limits JSONB;
BEGIN
    IF NOT is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Apenas administradores podem atualizar as configurações dos planos.';
    END IF;

    -- 1. Preços
    IF prices_data ? 'basico' THEN
        UPDATE public.plans SET price_monthly = (prices_data->>'basico')::INT / 100.0 WHERE slug = 'basico';
    END IF;
    IF prices_data ? 'pro' THEN
        UPDATE public.plans SET price_monthly = (prices_data->>'pro')::INT / 100.0 WHERE slug = 'pro';
    END IF;
    IF prices_data ? 'premium' THEN
        UPDATE public.plans SET price_monthly = (prices_data->>'premium')::INT / 100.0 WHERE slug = 'premium';
    END IF;

    -- 2. Limites estruturados dinâmicos
    IF limits_data IS NOT NULL THEN
        FOR v_slug IN SELECT jsonb_object_keys(limits_data)
        LOOP
            v_plan_limits := limits_data->v_slug;
            
            UPDATE public.plans
            SET 
                limit_transactions = COALESCE((v_plan_limits->>'transactions')::INT, limit_transactions),
                limit_clients = COALESCE((v_plan_limits->>'clients')::INT, limit_clients),
                limit_tags = COALESCE((v_plan_limits->>'tags')::INT, limit_tags),
                limit_accounts = COALESCE((v_plan_limits->>'accounts')::INT, limit_accounts)
            WHERE slug = v_slug;
        END LOOP;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_plan_settings(JSONB, JSONB) TO authenticated;
