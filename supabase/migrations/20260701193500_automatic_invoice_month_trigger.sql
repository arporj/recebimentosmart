-- Migração para criação da trigger de cálculo automático do invoice_month
-- Caminho: supabase/migrations/20260701193500_automatic_invoice_month_trigger.sql

-- 1. Função auxiliar para calcular o mes da fatura (equivalente ao calcularMesFatura do frontend)
CREATE OR REPLACE FUNCTION public.fn_calculate_invoice_month(
    p_date DATE,
    p_due_day INT,
    p_closing_days_before INT
) RETURNS TEXT AS $$
DECLARE
    v_target_date DATE;
    v_due_date DATE;
    v_closing_date DATE;
    v_start_date DATE;
    v_end_date DATE;
    v_month_offset INT;
    v_year INT;
    v_month INT;
    v_day INT;
BEGIN
    -- Procurar janelas de faturas de -1 a +2 meses relativos à data da transação
    FOR v_month_offset IN -1..2 LOOP
        -- Data base para o vencimento (mês corrente + offset)
        v_target_date := p_date + (v_month_offset || ' month')::INTERVAL;
        v_year := EXTRACT(YEAR FROM v_target_date)::INT;
        v_month := EXTRACT(MONTH FROM v_target_date)::INT;
        v_day := LEAST(p_due_day, 28); -- Math.min(due_day, 28)

        -- Dia de vencimento no mês selecionado
        v_due_date := TO_DATE(v_year || '-' || v_month || '-' || v_day, 'YYYY-MM-DD');

        -- Dia do fechamento da fatura
        v_closing_date := v_due_date - p_closing_days_before;
        v_end_date := v_closing_date - 1;

        -- Início do período da fatura (fechamento da fatura anterior)
        DECLARE
            v_prev_target DATE := v_due_date - '1 month'::INTERVAL;
            v_prev_year INT := EXTRACT(YEAR FROM v_prev_target)::INT;
            v_prev_month INT := EXTRACT(MONTH FROM v_prev_target)::INT;
            v_prev_due DATE := TO_DATE(v_prev_year || '-' || v_prev_month || '-' || v_day, 'YYYY-MM-DD');
        BEGIN
            v_start_date := v_prev_due - p_closing_days_before;
        END;

        -- Se a data da transação está no intervalo da fatura [startDate, endDate]
        IF p_date >= v_start_date AND p_date <= v_end_date THEN
            RETURN TO_CHAR(v_due_date, 'YYYY-MM');
        END IF;
    END LOOP;

    -- Fallback: retorna o mês da própria transação
    RETURN TO_CHAR(p_date, 'YYYY-MM');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. Função de trigger para computar o invoice_month automaticamente
CREATE OR REPLACE FUNCTION public.fn_trigger_calculate_invoice_month()
RETURNS TRIGGER AS $$
DECLARE
    v_acc_type TEXT;
    v_due_day INT;
    v_closing_days INT;
BEGIN
    -- Se a transação tem conta associada
    IF NEW.account_id IS NOT NULL THEN
        -- Obter configurações da conta
        SELECT type, due_day, closing_days_before
        INTO v_acc_type, v_due_day, v_closing_days
        FROM public.financial_accounts
        WHERE id = NEW.account_id;

        -- Se a conta for cartão de crédito e as configurações forem válidas
        IF v_acc_type = 'credit_card' AND v_due_day IS NOT NULL AND v_closing_days IS NOT NULL THEN
            -- Se invoice_month for nulo ou for insert/update e precisamos recalcular
            -- (Recalcular se mudar a data da transação ou a conta)
            IF NEW.invoice_month IS NULL OR TG_OP = 'INSERT' OR OLD.date IS DISTINCT FROM NEW.date OR OLD.account_id IS DISTINCT FROM NEW.account_id THEN
                NEW.invoice_month := public.fn_calculate_invoice_month(NEW.date, v_due_day, v_closing_days);
            END IF;
        ELSE
            -- Se não for cartão de crédito, garante que seja nulo
            NEW.invoice_month := NULL;
        END IF;
    ELSE
        NEW.invoice_month := NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Criar a trigger BEFORE INSERT OR UPDATE
DROP TRIGGER IF EXISTS trg_calculate_invoice_month ON public.financial_transactions;

CREATE TRIGGER trg_calculate_invoice_month
BEFORE INSERT OR UPDATE ON public.financial_transactions
FOR EACH ROW
EXECUTE FUNCTION public.fn_trigger_calculate_invoice_month();

-- 4. Executar backfill retroativo de transações de cartão de crédito pendentes de invoice_month
UPDATE public.financial_transactions ft
SET invoice_month = public.fn_calculate_invoice_month(ft.date, fa.due_day, fa.closing_days_before)
FROM public.financial_accounts fa
WHERE ft.account_id = fa.id
  AND fa.type = 'credit_card'
  AND fa.due_day IS NOT NULL
  AND fa.closing_days_before IS NOT NULL
  AND (ft.invoice_month IS NULL OR ft.invoice_month = '');
