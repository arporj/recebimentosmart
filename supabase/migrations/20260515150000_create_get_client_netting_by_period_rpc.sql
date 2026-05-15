-- Migração para criar a função get_client_netting_by_period
-- Ela permite trazer o saldo consolidado (Netting) de um cliente filtrando por um período de datas.

CREATE OR REPLACE FUNCTION public.get_client_netting_by_period(
    p_client_id uuid,
    p_start_date date,
    p_end_date date
)
RETURNS TABLE (
    total_income_pending numeric,
    total_expense_pending numeric,
    net_balance numeric,
    overdue_balance numeric,
    pending_transactions_count bigint,
    has_recurrence boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(
            CASE
                WHEN t.type = 'income' AND t.status = 'pending' THEN t.amount
                ELSE 0
            END
        ), 0)::numeric AS total_income_pending,
        
        COALESCE(SUM(
            CASE
                WHEN t.type = 'expense' AND t.status = 'pending' THEN t.amount
                ELSE 0
            END
        ), 0)::numeric AS total_expense_pending,
        
        (COALESCE(SUM(
            CASE
                WHEN t.type = 'income' AND t.status = 'pending' THEN t.amount
                ELSE 0
            END
        ), 0) - COALESCE(SUM(
            CASE
                WHEN t.type = 'expense' AND t.status = 'pending' THEN t.amount
                ELSE 0
            END
        ), 0))::numeric AS net_balance,
        
        COALESCE(SUM(
            CASE
                WHEN t.status = 'pending' AND t.date < CURRENT_DATE THEN
                    CASE
                        WHEN t.type = 'income' THEN t.amount
                        ELSE -t.amount
                    END
                ELSE 0
            END
        ), 0)::numeric AS overdue_balance,
        
        COUNT(
            CASE
                WHEN t.status = 'pending' THEN 1
                ELSE NULL
            END
        )::bigint AS pending_transactions_count,
        
        EXISTS (
            SELECT 1
            FROM public.financial_transactions ft
            WHERE ft.client_id = p_client_id
              AND ft.parent_id IS NULL
              AND ft.modalidade = 'recorrente'
        ) AS has_recurrence
    FROM public.financial_transactions t
    WHERE t.client_id = p_client_id
      AND t.date >= p_start_date
      AND t.date <= p_end_date;
END;
$$;
