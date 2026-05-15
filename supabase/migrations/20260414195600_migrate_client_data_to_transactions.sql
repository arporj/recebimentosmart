-- Migração de Dados: Replicar lançamentos legados de clients para financial_transactions
-- Esta migração copia os dados financeiros de clientes existentes para a nova estrutura.
-- Somente clientes com monthly_payment > 0 e não deletados serão migrados.
-- Clientes que já possuem lançamento vinculado em financial_transactions serão ignorados.

INSERT INTO public.financial_transactions (
    user_id,
    type,
    amount,
    date,
    description,
    client_id,
    recurrence_enabled,
    recurrence_period,
    recurrence_interval,
    status
)
SELECT
    c.user_id,
    'income' AS type,
    c.monthly_payment AS amount,
    -- Data de vencimento: usa start_date com o dia de vencimento correto
    CASE
        WHEN c.payment_due_day IS NOT NULL AND c.payment_due_day > 0 THEN
            make_date(
                EXTRACT(YEAR FROM c.start_date)::int,
                EXTRACT(MONTH FROM c.start_date)::int,
                LEAST(c.payment_due_day, (DATE_TRUNC('month', c.start_date) + INTERVAL '1 month' - INTERVAL '1 day')::date - DATE_TRUNC('month', c.start_date)::date + 1)::int
            )
        ELSE c.start_date
    END AS date,
    'Mensalidade - ' || c.name AS description,
    c.id AS client_id,
    true AS recurrence_enabled,
    -- Mapeamento de frequência legada para novo formato
    CASE c.payment_frequency
        WHEN 'monthly'    THEN 'monthly'
        WHEN 'bimonthly'  THEN 'monthly'
        WHEN 'quarterly'  THEN 'quarterly'
        WHEN 'semiannual' THEN 'monthly'
        WHEN 'annual'     THEN 'yearly'
        ELSE 'monthly'
    END AS recurrence_period,
    -- Intervalo baseado na frequência legada
    CASE c.payment_frequency
        WHEN 'monthly'    THEN 1
        WHEN 'bimonthly'  THEN 2
        WHEN 'quarterly'  THEN 1
        WHEN 'semiannual' THEN 6
        WHEN 'annual'     THEN 1
        ELSE 1
    END AS recurrence_interval,
    'pending' AS status
FROM public.clients c
WHERE c.deleted_at IS NULL
  AND c.monthly_payment > 0
  AND c.user_id IS NOT NULL
  -- Não duplicar: só migra clientes que ainda não têm lançamento na nova tabela
  AND NOT EXISTS (
      SELECT 1 FROM public.financial_transactions ft
      WHERE ft.client_id = c.id
  );
