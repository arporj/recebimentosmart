-- Adiciona o valor 'free' ao enum plan_type (executa apenas se não existir)
-- Nota: No postgres, ALTER TYPE ADD VALUE não pode rodar dentro de transações aninhadas no mesmo escopo.
-- Como o CLI do Supabase lida com migrações individuais, isso rodará corretamente.
ALTER TYPE public.plan_type ADD VALUE IF NOT EXISTS 'free';

-- Atualiza colunas na tabela plans
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS slug text UNIQUE;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS limit_clients integer DEFAULT 15;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS limit_transactions integer DEFAULT 30;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS limit_accounts integer DEFAULT 2;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS limit_tags integer DEFAULT 10;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS can_custom_fields boolean DEFAULT false;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS can_custom_categories boolean DEFAULT false;

-- Popula/atualiza os slugs dos planos existentes
UPDATE public.plans SET slug = 'basico' WHERE name = 'Básico' AND slug IS NULL;
UPDATE public.plans SET slug = 'pro' WHERE name = 'Pró' AND slug IS NULL;
UPDATE public.plans SET slug = 'premium' WHERE name = 'Premium' AND slug IS NULL;

-- Atualiza limites e configurações corretas nos planos pagos e insere o Free
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
  limit_clients = 15,
  limit_transactions = 30,
  limit_accounts = 2,
  limit_tags = 10,
  can_custom_fields = false,
  can_custom_categories = false;

-- Limites do Básico: Clientes e contas ilimitados (ou muito grandes), mas limitador de transações = 60
UPDATE public.plans SET 
  limit_clients = -1,
  limit_transactions = 60,
  limit_accounts = -1,
  limit_tags = -1,
  can_custom_fields = true,
  can_custom_categories = true
WHERE slug = 'basico';

-- Limites do Pró: Transações = 120
UPDATE public.plans SET 
  limit_clients = -1,
  limit_transactions = 120,
  limit_accounts = -1,
  limit_tags = -1,
  can_custom_fields = true,
  can_custom_categories = true
WHERE slug = 'pro';

-- Limites do Premium: Ilimitado (-1)
UPDATE public.plans SET 
  limit_clients = -1,
  limit_transactions = -1,
  limit_accounts = -1,
  limit_tags = -1,
  can_custom_fields = true,
  can_custom_categories = true
WHERE slug = 'premium';

-- Criação da tabela de rastreamento de uso de transações
CREATE TABLE IF NOT EXISTS public.user_transaction_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id uuid,
  action_type text NOT NULL, -- 'INSERT' ou 'UPDATE'
  executed_at timestamp with time zone DEFAULT now()
);

-- Habilitar Row Level Security
ALTER TABLE public.user_transaction_usage ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
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

-- Função da trigger de auditoria
CREATE OR REPLACE FUNCTION public.log_financial_transaction_activity()
RETURNS TRIGGER AS $$
BEGIN
  -- Executa a inserção no log
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

-- Criação da trigger na tabela financial_transactions
DROP TRIGGER IF EXISTS on_financial_transaction_change ON public.financial_transactions;
CREATE TRIGGER on_financial_transaction_change
AFTER INSERT OR UPDATE ON public.financial_transactions
FOR EACH ROW
EXECUTE FUNCTION public.log_financial_transaction_activity();

-- Redefine a trigger de criação de novo usuário para associar ao plano 'free' vitalício
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    referrer_uuid UUID;
BEGIN
    -- Insere o novo perfil com plano 'free' (substituindo 'trial') sem valid_until (vitalício)
    INSERT INTO public.profiles (id, name, cpf_cnpj, plano, valid_until)
    VALUES (
        new.id,
        new.raw_user_meta_data->>'name',
        new.raw_user_meta_data->>'cpf_cnpj',
        'free', -- Plano 'free' por padrão
        NULL -- Vitalício por padrão
    );

    -- Lógica de indicações intacta
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

-- Migra usuários que atualmente estão com plano 'trial' para o plano vitalício 'free'
UPDATE public.profiles SET plano = 'free' WHERE plano = 'trial';

-- Função auxiliar para calcular a data de início do ciclo de renovação de limites do usuário
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
  -- Resgatar o plano atual e datas marcos
  SELECT plano, created_at, last_payment_at 
  INTO v_plano, v_base_date, v_cycle_start
  FROM public.profiles 
  WHERE id = p_user_id;

  -- Se for free, trial, ou não tiver pago nada ainda, a base é a data de criação da conta.
  -- Se já teve pagamento, a data base para transações é a data do último pagamento (last_payment_at)
  IF v_plano = 'free' OR v_plano = 'trial' OR v_cycle_start IS NULL THEN
    v_base_date := coalesce(v_base_date, v_now);
  ELSE
    v_base_date := v_cycle_start;
  END IF;

  -- Pega o dia do mês da data base
  v_day := extract(day from v_base_date)::integer;

  -- Tenta criar a data correspondente a esse dia no mês e ano corrente
  BEGIN
    -- Se o dia excede o tamanho do mês (ex: dia 31 em Fevereiro), disparará exceção e pegará o último dia do mês
    v_candidate := make_timestamptz(
      extract(year from v_now)::integer, 
      extract(month from v_now)::integer, 
      v_day, 0, 0, 0, 'UTC'
    );
  EXCEPTION WHEN OTHERS THEN
    -- Pega o último dia do mês corrente
    v_candidate := date_trunc('month', v_now) + interval '1 month' - interval '1 day';
  END;

  -- Se a data construída está no futuro, o ciclo iniciou no mês passado
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

-- Função RPC para carregar uso e limites estruturados do usuário
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
  -- Resgata plano do perfil
  SELECT p.plano::text INTO v_plano
  FROM public.profiles p
  WHERE p.id = p_user_id;

  -- Define ciclo de competência das transações
  v_cycle_start := public.get_current_cycle_start_date(p_user_id);

  -- Tenta puxar os limites cadastrados da tabela plans
  SELECT * INTO v_plan_data FROM public.plans WHERE slug = coalesce(v_plano, 'free');
  
  -- Fallback para limites do Free caso não configurado no banco
  IF NOT FOUND THEN
    v_plan_data.limit_clients := 15;
    v_plan_data.limit_transactions := 30;
    v_plan_data.limit_accounts := 2;
    v_plan_data.limit_tags := 10;
    v_plan_data.can_custom_fields := false;
    v_plan_data.can_custom_categories := false;
  END IF;

  -- Contabilização de Clientes ativos
  SELECT count(*)::integer INTO v_count_clients
  FROM public.clients
  WHERE user_id = p_user_id AND deleted_at IS NULL;

  -- Contabilização de atividades de lançamentos dentro da janela mensal corrente
  SELECT count(*)::integer INTO v_count_transactions
  FROM public.user_transaction_usage
  WHERE user_id = p_user_id AND executed_at >= v_cycle_start;

  -- Contabilização de Contas ativas
  SELECT count(*)::integer INTO v_count_accounts
  FROM public.financial_accounts
  WHERE user_id = p_user_id AND is_active = true;

  -- Contabilização de Tags
  SELECT count(*)::integer INTO v_count_tags
  FROM public.financial_tags
  WHERE user_id = p_user_id;

  -- Montagem do JSON estruturado
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
