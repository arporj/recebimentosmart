-- Corrige a trigger de cálculo automático de invoice_month: ela zerava o invoice_month de
-- QUALQUER transação cuja conta de origem (account_id) não fosse um cartão de crédito, mesmo
-- quando se tratava de uma transferência de PAGAMENTO DE FATURA (destination_account_id = um
-- cartão de crédito). Isso fazia com que toda transferência criada ao "Fechar Fatura" tivesse
-- seu invoice_month explicitamente definido pela aplicação apagado imediatamente pela trigger,
-- quebrando a reconciliação entre a fatura e o pagamento (a aplicação para de reconhecer que a
-- fatura já foi paga/agendada e passa a descontar o valor da fatura duas vezes: uma via a
-- própria transferência, outra via a fatura "ainda não paga").
-- Caminho: supabase/migrations/20260706190000_fix_invoice_month_transfer_to_card.sql

CREATE OR REPLACE FUNCTION public.fn_trigger_calculate_invoice_month()
RETURNS TRIGGER AS $$
DECLARE
    v_acc_type TEXT;
    v_due_day INT;
    v_closing_days INT;
    v_dest_is_card BOOLEAN := FALSE;
BEGIN
    -- Verifica se o DESTINO desta transação é um cartão de crédito (ex: pagamento de fatura).
    -- Nesse caso o invoice_month se refere à fatura do cartão de destino, não da conta de
    -- origem, e não deve ser zerado mesmo que a conta de origem não seja um cartão.
    IF NEW.destination_account_id IS NOT NULL THEN
        SELECT (type = 'credit_card') INTO v_dest_is_card
        FROM public.financial_accounts
        WHERE id = NEW.destination_account_id;
    END IF;

    IF NEW.account_id IS NOT NULL THEN
        SELECT type, due_day, closing_days_before
        INTO v_acc_type, v_due_day, v_closing_days
        FROM public.financial_accounts
        WHERE id = NEW.account_id;

        IF v_acc_type = 'credit_card' AND v_due_day IS NOT NULL AND v_closing_days IS NOT NULL THEN
            IF NEW.invoice_month IS NULL OR NEW.invoice_month = '' THEN
                NEW.invoice_month := public.fn_calculate_invoice_month(NEW.date, v_due_day, v_closing_days);
            ELSIF TG_OP = 'UPDATE'
              AND (OLD.date IS DISTINCT FROM NEW.date OR OLD.account_id IS DISTINCT FROM NEW.account_id)
              AND OLD.invoice_month IS NOT DISTINCT FROM NEW.invoice_month THEN
                NEW.invoice_month := public.fn_calculate_invoice_month(NEW.date, v_due_day, v_closing_days);
            END IF;
        ELSIF NOT v_dest_is_card THEN
            -- Não é cartão de crédito nem transferência para um cartão: garante que seja nulo.
            NEW.invoice_month := NULL;
        END IF;
    ELSIF NOT v_dest_is_card THEN
        NEW.invoice_month := NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Backfill: reconstrói o invoice_month das transferências de "Pagamento Fatura" já corrompidas
-- pela trigger anterior. A descrição segue o padrão fixo "Pagamento Fatura - YYYY-MM" definido
-- em CloseBillModal.tsx, permitindo recuperar o valor original com precisão.
UPDATE public.financial_transactions ft
SET invoice_month = substring(ft.description FROM 'Pagamento Fatura - (\d{4}-\d{2})')
FROM public.financial_accounts fa
WHERE ft.destination_account_id = fa.id
  AND fa.type = 'credit_card'
  AND ft.type = 'transfer'
  AND ft.invoice_month IS NULL
  AND ft.description ~ 'Pagamento Fatura - \d{4}-\d{2}';
