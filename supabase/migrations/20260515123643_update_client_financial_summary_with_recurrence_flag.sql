-- Atualizar View de Resumo Financeiro por Cliente (Netting)
-- Adiciona a flag has_recurrence para a interface identificar clientes legados que precisam migrar.
-- Mantém security_invoker = true para RLS.

CREATE OR REPLACE VIEW public.client_financial_summary 
WITH (security_invoker = true) AS
SELECT 
    c.id AS client_id,
    c.user_id,
    c.name AS client_name,
    c.phone AS client_phone,
    c.status AS client_status,
    -- Somatorio de receitas pendentes
    COALESCE(SUM(CASE WHEN t.type = 'income' AND t.status = 'pending' THEN t.amount ELSE 0 END), 0) AS total_income_pending,
    -- Somatorio de despesas pendentes
    COALESCE(SUM(CASE WHEN t.type = 'expense' AND t.status = 'pending' THEN t.amount ELSE 0 END), 0) AS total_expense_pending,
    -- Saldo liquido pendente (Netting: Receitas - Despesas)
    (
        COALESCE(SUM(CASE WHEN t.type = 'income' AND t.status = 'pending' THEN t.amount ELSE 0 END), 0) - 
        COALESCE(SUM(CASE WHEN t.type = 'expense' AND t.status = 'pending' THEN t.amount ELSE 0 END), 0)
    ) AS net_balance,
    -- Saldo liquido vencido (Netting de transacoes pendentes cuja data ja passou)
    COALESCE(SUM(
        CASE 
            WHEN t.status = 'pending' AND t.date < CURRENT_DATE THEN 
                CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END
            ELSE 0 
        END
    ), 0) AS overdue_balance,
    -- Contagem de transacoes pendentes totais
    COUNT(CASE WHEN t.status = 'pending' THEN 1 END) AS pending_transactions_count,
    -- Indicador se possui recorrencia configurada na V2 (transacao mae)
    EXISTS (
        SELECT 1 FROM public.financial_transactions ft 
        WHERE ft.client_id = c.id AND ft.parent_id IS NULL AND ft.modalidade = 'recorrente'
    ) AS has_recurrence
FROM 
    public.clients c
LEFT JOIN 
    public.financial_transactions t ON c.id = t.client_id
WHERE 
    c.deleted_at IS NULL
GROUP BY 
    c.id, c.user_id, c.name, c.phone, c.status;

COMMENT ON VIEW public.client_financial_summary IS 'View consolidada enriquecida com flag de recorrencia para calculo de netting pendente por cliente.';
