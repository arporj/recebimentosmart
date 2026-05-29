-- Alterar paid_date de DATE para TIMESTAMPTZ para registrar hora exata de pagamentos
-- Necessário fazer o drop e recreate da view v_financial_transactions que usa a tabela

DROP VIEW IF EXISTS public.v_financial_transactions;

ALTER TABLE public.financial_transactions 
    ALTER COLUMN paid_date TYPE TIMESTAMPTZ USING paid_date::TIMESTAMPTZ;

CREATE OR REPLACE VIEW public.v_financial_transactions 
WITH (security_invoker = true) AS
SELECT 
    ft.*,
    a.name AS account_name,
    a.type AS account_type,
    da.name AS destination_account_name,
    da.type AS destination_account_type,
    c.name AS client_name,
    cat.name AS category_name,
    cat.icon AS category_icon,
    cat.parent_id AS category_parent_id
FROM public.financial_transactions ft
LEFT JOIN public.financial_accounts a ON ft.account_id = a.id
LEFT JOIN public.financial_accounts da ON ft.destination_account_id = da.id
LEFT JOIN public.clients c ON ft.client_id = c.id
LEFT JOIN public.financial_categories cat ON ft.category_id = cat.id;

COMMENT ON VIEW public.v_financial_transactions IS 'View de transacoes com relacionamentos (Account, Client, Category) respeitando RLS via security_invoker.';
