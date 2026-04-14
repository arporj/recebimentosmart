-- Atualização da Lógica de Recorrência para Lançamentos Financeiros

-- 1. Adicionar coluna de intervalo de recorrência
ALTER TABLE public.financial_transactions 
ADD COLUMN IF NOT EXISTS recurrence_interval INTEGER DEFAULT 1;

-- 2. Atualizar a constraint de recurrence_period para incluir 'daily'
-- Primeiro removemos a anterior (identificando pelo padrão de CHECK)
DO $$
BEGIN
    ALTER TABLE public.financial_transactions DROP CONSTRAINT IF EXISTS financial_transactions_recurrence_period_check;
END $$;

ALTER TABLE public.financial_transactions 
ADD CONSTRAINT financial_transactions_recurrence_period_check 
CHECK (recurrence_period IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly'));

-- 3. Remover a coluna recurrence_day (será substituída pela data de vencimento)
ALTER TABLE public.financial_transactions 
DROP COLUMN IF EXISTS recurrence_day;

-- Comentários para documentação
COMMENT ON COLUMN public.financial_transactions.recurrence_interval IS 'Intervalo entre as ocorrências (ex: a cada 2 meses)';
COMMENT ON COLUMN public.financial_transactions.recurrence_period IS 'Frequência da recorrência: diaria, semanal, mensal, trimestral ou anual';
