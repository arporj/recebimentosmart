-- Expansão dos campos de Cartão de Crédito
-- Adiciona suporte a tipo de limite, ciclo de faturamento e cartões adicionais

ALTER TABLE public.financial_accounts
    ADD COLUMN IF NOT EXISTS limit_type TEXT CHECK (limit_type IN ('total', 'monthly', 'undefined')) DEFAULT 'total',
    ADD COLUMN IF NOT EXISTS first_invoice_due_date DATE,
    ADD COLUMN IF NOT EXISTS closing_days_before INTEGER CHECK (closing_days_before >= 1 AND closing_days_before <= 28) DEFAULT 10,
    ADD COLUMN IF NOT EXISTS invoice_payment_account_id UUID REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS main_card_name TEXT,
    ADD COLUMN IF NOT EXISTS secondary_cards JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.financial_accounts.limit_type IS 'Tipo de limite: total (todas faturas), monthly (apenas mês), undefined (sem controle)';
COMMENT ON COLUMN public.financial_accounts.first_invoice_due_date IS 'Data de vencimento da primeira fatura para alinhar o ciclo';
COMMENT ON COLUMN public.financial_accounts.closing_days_before IS 'Quantidade de dias antes do vencimento em que a fatura fecha';
COMMENT ON COLUMN public.financial_accounts.invoice_payment_account_id IS 'Conta para previsão de débito automático da fatura';
COMMENT ON COLUMN public.financial_accounts.main_card_name IS 'Nome do titular do cartão principal';
COMMENT ON COLUMN public.financial_accounts.secondary_cards IS 'Array JSON com nomes dos cartões adicionais';
