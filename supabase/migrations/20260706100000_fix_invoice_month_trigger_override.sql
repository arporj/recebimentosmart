-- Migração para corrigir o comportamento da trigger de cálculo do invoice_month
-- Garantindo que invoice_month informado manualmente pelo usuário (ex: no INSERT ou UPDATE) não seja sobrescrito.
-- Caminho: supabase/migrations/20260706100000_fix_invoice_month_trigger_override.sql

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
            -- Se invoice_month for nulo ou vazio, calcula automaticamente
            IF NEW.invoice_month IS NULL OR NEW.invoice_month = '' THEN
                NEW.invoice_month := public.fn_calculate_invoice_month(NEW.date, v_due_day, v_closing_days);
            -- Se for UPDATE e a data ou a conta mudarem, e o usuário NÃO alterou explicitamente o invoice_month
            ELSIF TG_OP = 'UPDATE' 
              AND (OLD.date IS DISTINCT FROM NEW.date OR OLD.account_id IS DISTINCT FROM NEW.account_id) 
              AND OLD.invoice_month IS NOT DISTINCT FROM NEW.invoice_month THEN
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
