-- Adicionar colunas de conta, categoria e confirmação parcial em financial_transactions

-- Conta financeira vinculada
ALTER TABLE public.financial_transactions
    ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.financial_accounts(id) ON DELETE SET NULL;

-- Categoria vinculada
ALTER TABLE public.financial_transactions
    ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.financial_categories(id) ON DELETE SET NULL;

-- Valor efetivamente pago (para confirmação com ajuste ou parcial)
ALTER TABLE public.financial_transactions
    ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(15, 2);

-- Data efetiva do pagamento
ALTER TABLE public.financial_transactions
    ADD COLUMN IF NOT EXISTS paid_date DATE;

-- Atualizar constraint de status para incluir 'partial'
ALTER TABLE public.financial_transactions
    DROP CONSTRAINT IF EXISTS financial_transactions_status_check;

ALTER TABLE public.financial_transactions
    ADD CONSTRAINT financial_transactions_status_check
    CHECK (status IN ('pending', 'paid', 'partial'));

-- Índices para as novas colunas
CREATE INDEX IF NOT EXISTS idx_financial_transactions_account ON public.financial_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_category ON public.financial_transactions(category_id);
