-- Detalhes adicionais para transações de cartão de crédito e parcelamento
ALTER TABLE public.financial_transactions
    ADD COLUMN IF NOT EXISTS invoice_month TEXT, -- Formato 'YYYY-MM'
    ADD COLUMN IF NOT EXISTS card_holder_name TEXT, -- Nome do titular ou adicional selecionado
    ADD COLUMN IF NOT EXISTS installment_current INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS installment_total INTEGER DEFAULT 1;

-- Índice para busca por mês de fatura
CREATE INDEX IF NOT EXISTS idx_financial_transactions_invoice ON public.financial_transactions(user_id, account_id, invoice_month);
