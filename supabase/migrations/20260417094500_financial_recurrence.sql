-- Migração para suporte a parcelas e recorrências no sistema financeiro

-- 1. Adicionar colunas necessárias à tabela financial_transactions
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS modalidade text
    CHECK (modalidade IN ('unica', 'parcelada', 'recorrente'))
    DEFAULT 'unica';

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS parent_id uuid
    REFERENCES public.financial_transactions(id) ON DELETE SET NULL;

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS installment_number integer;

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS total_installments integer;

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS due_day integer
    CHECK (due_day BETWEEN 1 AND 31);

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS recurrence_end_date date;

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS is_customized boolean DEFAULT false;

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.financial_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.financial_categories(id) ON DELETE SET NULL;

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS auto_confirm boolean DEFAULT false;

-- 2. Índices para otimização de consultas recorrentes e filtragem
CREATE INDEX IF NOT EXISTS idx_ft_parent_id ON public.financial_transactions(parent_id);
CREATE INDEX IF NOT EXISTS idx_ft_user_status_date ON public.financial_transactions(user_id, status, date);
CREATE INDEX IF NOT EXISTS idx_ft_modalidade ON public.financial_transactions(user_id, modalidade);

-- 3. Configuração do pg_cron para geração automática (Executar separadamente se necessário no Dashboard)
-- Nota: pg_cron pode exigir permissões de superusuário ou estar em um esquema específico em provedores gerenciados.

-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Job para gerar as recorrências do mês futuro todo dia 1
-- Esta query busca transações 'mãe' (parent_id IS NULL) de modalidade 'recorrente'
-- e insere uma nova ocorrência para o mês subsequente se ainda não existir.
/*
SELECT cron.schedule(
  'gerar-recorrencias-mensais',
  '0 6 1 * *', -- todo dia 1 às 06h
  $$
  INSERT INTO public.financial_transactions (
    user_id, type, description, amount, date, modalidade,
    parent_id, recurrence_enabled,
    recurrence_period, due_day, account_id, category_id,
    status, is_customized, auto_confirm
  )
  SELECT
    mae.user_id,
    mae.type,
    mae.description,
    mae.amount,
    (date_trunc('month', now()) + interval '2 month' - interval '1 day' +
      make_interval(days := mae.due_day - 1))::date,
    'recorrente',
    mae.id,
    true,
    mae.recurrence_period,
    mae.due_day,
    mae.account_id,
    mae.category_id,
    'pending',
    false,
    mae.auto_confirm
  FROM public.financial_transactions mae
  WHERE mae.modalidade = 'recorrente'
    AND mae.parent_id IS NULL
    AND (mae.recurrence_end_date IS NULL OR mae.recurrence_end_date > now())
    AND NOT EXISTS (
      SELECT 1 FROM public.financial_transactions filha
      WHERE filha.parent_id = mae.id
        AND filha.date >= date_trunc('month', now()) + interval '2 month'
        AND filha.date < date_trunc('month', now()) + interval '3 month'
    );
  $$
);
*/
