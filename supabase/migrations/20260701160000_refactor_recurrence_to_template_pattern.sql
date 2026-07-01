-- Migração para refatoração de recorrências para o padrão Template/Contrato
-- Caminho: supabase/migrations/20260701160000_refactor_recurrence_to_template_pattern.sql

-- 1. Adicionar a coluna is_template à tabela financial_transactions
ALTER TABLE public.financial_transactions 
ADD COLUMN IF NOT EXISTS is_template BOOLEAN DEFAULT false;

-- 2. Recriar a view v_financial_transactions aplicando o filtro para excluir os templates das consultas normais
DROP VIEW IF EXISTS public.v_financial_transactions;

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
LEFT JOIN public.financial_categories cat ON ft.category_id = cat.id
WHERE ft.is_template IS DISTINCT FROM true;

COMMENT ON VIEW public.v_financial_transactions IS 'View de transacoes com relacionamentos respeitando RLS e filtrando templates recorrentes.';

-- 3. Bloco PL/pgSQL para backfill das recorrências existentes
DO $$
DECLARE
    r_mae RECORD;
    v_filho_id UUID;
    v_count INT := 0;
BEGIN
    FOR r_mae IN 
        SELECT * FROM public.financial_transactions 
        WHERE modalidade = 'recorrente' 
          AND parent_id IS NULL 
          AND recurrence_enabled = true 
          AND is_template = false
    LOOP
        -- Inserir o clone filho 1 (substitui fisicamente a mãe no extrato e saldo)
        INSERT INTO public.financial_transactions (
            user_id, type, amount, date, description, client_id,
            recurrence_enabled, recurrence_period, recurrence_interval,
            due_day, recurrence_end_date, is_customized, account_id,
            category_id, auto_confirm, status, paid_date, paid_amount,
            installment_current, installment_total, parent_id, is_template
        ) VALUES (
            r_mae.user_id, r_mae.type, r_mae.amount, r_mae.date, r_mae.description, r_mae.client_id,
            false, r_mae.recurrence_period, r_mae.recurrence_interval,
            r_mae.due_day, r_mae.recurrence_end_date, true, r_mae.account_id,
            r_mae.category_id, r_mae.auto_confirm, r_mae.status, r_mae.paid_date, r_mae.paid_amount,
            1, 1, r_mae.id, false
        ) RETURNING id INTO v_filho_id;

        -- Copiar as tags da mãe para o novo filho na tabela transaction_tags
        INSERT INTO public.transaction_tags (transaction_id, tag_id)
        SELECT v_filho_id, tag_id
        FROM public.transaction_tags
        WHERE transaction_id = r_mae.id;

        -- Atualizar a mãe original para se tornar template
        UPDATE public.financial_transactions
        SET is_template = true
        WHERE id = r_mae.id;

        v_count := v_count + 1;
    END LOOP;
    
    RAISE NOTICE 'Backfill concluído: % transações mãe recorrentes convertidas em templates e clonadas como Filho 1.', v_count;
END;
$$;
