-- Migração: corrige fn_replenish_recurring_occurrences (criada em
-- 20260710120000) para ancorar cada nova ocorrência no vencimento original
-- do template, e corrige o desvio já gerado hoje na recorrência do Plano de
-- Saúde UNIMED.
-- Caminho: supabase/migrations/20260710170000_fix_replenish_anchor_date_drift.sql

-- ═══════════════════════════════════════════════════════════════════════
-- PARTE 1 — fn_replenish_recurring_occurrences ancorava a data de cada nova
-- ocorrência em MAX(date) da última ocorrência física existente. Se essa
-- última ocorrência foi paga num dia diferente do vencimento nominal (ex.:
-- parcela de vencimento dia 19 paga adiantada no dia 05), o dia do mês
-- "vazava" e todas as próximas ocorrências herdavam o dia errado
-- indefinidamente. Agora ancora sempre em `template.date` (o vencimento
-- original), contando quantos períodos se passaram até cada parcela —
-- imune a quando/em que dia a parcela anterior foi de fato paga.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_replenish_recurring_occurrences()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_template RECORD;
    v_last_installment INT;
    v_interval INT;
    v_horizon DATE := CURRENT_DATE + INTERVAL '3 months';
    v_k INT;
    v_next_installment INT;
    v_base_installment INT;
    v_candidate DATE;
    v_new_id UUID;
    v_total_created INT := 0;
BEGIN
    FOR v_template IN
        SELECT *
        FROM public.financial_transactions
        WHERE is_template = true
          AND recurrence_enabled = true
          AND (recurrence_end_date IS NULL OR recurrence_end_date >= CURRENT_DATE)
    LOOP
        v_interval := GREATEST(COALESCE(v_template.recurrence_interval, 1), 1);
        v_base_installment := COALESCE(v_template.installment_current, 1);

        -- Última ocorrência física conhecida da série (só pra numeração de
        -- parcela); se ainda não existe nenhum filho físico, o próprio
        -- template é o ponto de partida.
        SELECT MAX(installment_current)
        INTO v_last_installment
        FROM public.financial_transactions
        WHERE parent_id = v_template.id;

        IF v_last_installment IS NULL THEN
            v_last_installment := v_base_installment;
        END IF;

        v_k := 1;
        LOOP
            EXIT WHEN v_k > 400; -- trava de segurança, mesma filosofia do MAX_OCCURRENCES_PER_CALL do TS

            v_next_installment := v_last_installment + v_k;

            -- Âncora no vencimento original do template, não na última
            -- ocorrência física.
            v_candidate := public.fn_add_recurrence_period(
                v_template.date,
                (v_next_installment - v_base_installment) * v_interval,
                v_template.recurrence_period
            );

            EXIT WHEN v_candidate > v_horizon;
            EXIT WHEN v_template.recurrence_end_date IS NOT NULL AND v_candidate > v_template.recurrence_end_date;

            -- Evita duplicar se já existir fisicamente por data OU por
            -- número de ocorrência (mesmo espírito de
            -- 20260701192500_fix_duplicate_transactions_same_day.sql).
            IF NOT EXISTS (
                SELECT 1 FROM public.financial_transactions
                WHERE parent_id = v_template.id
                  AND (date = v_candidate OR installment_current = v_next_installment)
            ) THEN
                INSERT INTO public.financial_transactions (
                    user_id, type, amount, description, client_id, account_id,
                    destination_account_id, category_id, card_holder_name,
                    date, modalidade, status, parent_id, is_template,
                    recurrence_enabled, recurrence_period, recurrence_interval,
                    due_day, installment_current, installment_total, auto_confirm
                ) VALUES (
                    v_template.user_id, v_template.type, v_template.amount, v_template.description,
                    v_template.client_id, v_template.account_id, v_template.destination_account_id,
                    v_template.category_id, v_template.card_holder_name,
                    v_candidate, 'recorrente', 'pending', v_template.id, false,
                    false, v_template.recurrence_period, v_template.recurrence_interval,
                    v_template.due_day, v_next_installment, 1, v_template.auto_confirm
                    -- invoice_month não é setado aqui de propósito: o trigger
                    -- trg_calculate_invoice_month (BEFORE INSERT) calcula
                    -- sozinho quando a coluna vem NULL.
                )
                RETURNING id INTO v_new_id;

                INSERT INTO public.transaction_tags (transaction_id, tag_id)
                SELECT v_new_id, tag_id
                FROM public.transaction_tags
                WHERE transaction_id = v_template.id;

                v_total_created := v_total_created + 1;
            END IF;

            v_k := v_k + 1;
        END LOOP;
    END LOOP;

    IF v_total_created > 0 THEN
        RAISE LOG '[replenish_recurring] % ocorrência(s) física(s) repostas em %', v_total_created, CURRENT_DATE;
    END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- PARTE 2 — Backfill pontual: as 4 ocorrências do Plano de Saúde UNIMED
-- (parent_id 067ce127-9554-49d4-b0d7-e8054f5c6b2f) geradas mais cedo hoje
-- pela versão anterior do job herdaram o dia 05 (data em que a parcela de
-- junho foi paga) em vez do vencimento real, dia 19 (data original do
-- template). Corrige só essas 4 linhas, mantendo status pendente.
-- ═══════════════════════════════════════════════════════════════════════

UPDATE public.financial_transactions
SET date = make_date(EXTRACT(YEAR FROM date)::int, EXTRACT(MONTH FROM date)::int, 19)
WHERE parent_id = '067ce127-9554-49d4-b0d7-e8054f5c6b2f'
  AND status = 'pending'
  AND is_customized = false
  AND EXTRACT(DAY FROM date) = 5;
