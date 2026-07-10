-- Migração: elimina 'quarterly' como período nomeado e cria job de reposição
-- física contínua de ocorrências recorrentes.
-- Caminho: supabase/migrations/20260710120000_replenish_recurring_occurrences_cron.sql

-- ═══════════════════════════════════════════════════════════════════════
-- PARTE 1 — Eliminar 'quarterly' (e o valor espúrio 'parcelada') de
-- recurrence_period. "A cada 3 meses" passa a se expressar como
-- monthly + recurrence_interval=3, mesma semântica introduzida em
-- criarTransacao.ts para modalidade parcelada nesta mesma mudança.
-- ═══════════════════════════════════════════════════════════════════════

-- Backfill defensivo (checado antes desta migração: 0 linhas com
-- recurrence_period='quarterly' ou 'parcelada' em produção hoje, mas mantido
-- para o caso de alguma linha ter sido criada entre a checagem e o deploy).
UPDATE public.financial_transactions
SET recurrence_interval = COALESCE(recurrence_interval, 1) * 3,
    recurrence_period = 'monthly'
WHERE recurrence_period = 'quarterly';

ALTER TABLE public.financial_transactions DROP CONSTRAINT IF EXISTS financial_transactions_recurrence_period_check;
ALTER TABLE public.financial_transactions
  ADD CONSTRAINT financial_transactions_recurrence_period_check
  CHECK (recurrence_period IN ('daily', 'weekly', 'monthly', 'yearly') OR recurrence_period IS NULL);

-- ═══════════════════════════════════════════════════════════════════════
-- PARTE 2 — Reposição física contínua de ocorrências recorrentes.
--
-- Hoje as ocorrências físicas futuras de uma recorrência são geradas uma
-- única vez (na criação ou numa edição que reconstrói a série), até um
-- horizonte fixo. Nada repõe essa janela conforme o tempo passa. Como
-- fn_auto_confirm_transactions() e a notificação semanal de vencimento só
-- leem linhas físicas (nunca as ocorrências virtuais que a tela projeta
-- para exibição), uma recorrência para de ser auto-confirmada e de
-- notificar vencimento assim que a janela física acaba.
-- ═══════════════════════════════════════════════════════════════════════

-- Replica addPeriod() de src/lib/financeiro/recorrenciaUtils.ts em SQL puro:
-- daily/weekly/yearly + default mensal, com clamping de fim de mês (ex.:
-- 31/01 + 1 mês = 28/02). Sem case 'quarterly' — depois da Parte 1 esse
-- valor não existe mais na coluna.
CREATE OR REPLACE FUNCTION public.fn_add_recurrence_period(
    p_date DATE,
    p_amount INT,
    p_period TEXT
) RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_day INT;
    v_total_months INT;
    v_target_year INT;
    v_target_month INT;
    v_last_day INT;
BEGIN
    CASE p_period
        WHEN 'daily' THEN
            RETURN p_date + (p_amount || ' days')::INTERVAL;
        WHEN 'weekly' THEN
            RETURN p_date + (p_amount || ' weeks')::INTERVAL;
        WHEN 'yearly' THEN
            v_day := EXTRACT(DAY FROM p_date)::INT;
            v_target_year := EXTRACT(YEAR FROM p_date)::INT + p_amount;
            v_target_month := EXTRACT(MONTH FROM p_date)::INT;
            v_last_day := EXTRACT(DAY FROM (
                make_date(v_target_year, v_target_month, 1) + INTERVAL '1 month' - INTERVAL '1 day'
            ))::INT;
            RETURN make_date(v_target_year, v_target_month, LEAST(v_day, v_last_day));
        ELSE
            -- 'monthly' e qualquer outro valor (default: addMonths, mesmo
            -- comportamento de addPeriod() no TS).
            v_day := EXTRACT(DAY FROM p_date)::INT;
            v_total_months := (EXTRACT(YEAR FROM p_date)::INT * 12 + (EXTRACT(MONTH FROM p_date)::INT - 1)) + p_amount;
            v_target_year := v_total_months / 12;
            v_target_month := (v_total_months % 12) + 1;
            v_last_day := EXTRACT(DAY FROM (
                make_date(v_target_year, v_target_month, 1) + INTERVAL '1 month' - INTERVAL '1 day'
            ))::INT;
            RETURN make_date(v_target_year, v_target_month, LEAST(v_day, v_last_day));
    END CASE;
END;
$$;

-- Para cada template ativo, garante linhas físicas até hoje + 3 meses.
-- SECURITY DEFINER: roda como owner, ignora RLS — por isso user_id é
-- setado explicitamente a partir do template em cada INSERT.
CREATE OR REPLACE FUNCTION public.fn_replenish_recurring_occurrences()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_template RECORD;
    v_last_date DATE;
    v_last_installment INT;
    v_interval INT;
    v_horizon DATE := CURRENT_DATE + INTERVAL '3 months';
    v_k INT;
    v_next_installment INT;
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

        -- Última ocorrência física conhecida da série; se ainda não existe
        -- nenhum filho físico, o próprio template (installment_current=1)
        -- é o ponto de partida.
        SELECT MAX(date), MAX(installment_current)
        INTO v_last_date, v_last_installment
        FROM public.financial_transactions
        WHERE parent_id = v_template.id;

        IF v_last_date IS NULL THEN
            v_last_date := v_template.date;
            v_last_installment := COALESCE(v_template.installment_current, 1);
        END IF;

        v_k := 1;
        LOOP
            EXIT WHEN v_k > 400; -- trava de segurança, mesma filosofia do MAX_OCCURRENCES_PER_CALL do TS

            v_candidate := public.fn_add_recurrence_period(
                v_last_date, v_k * v_interval, v_template.recurrence_period
            );

            EXIT WHEN v_candidate > v_horizon;
            EXIT WHEN v_template.recurrence_end_date IS NOT NULL AND v_candidate > v_template.recurrence_end_date;

            v_next_installment := v_last_installment + v_k;

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

                -- Copiar tags do template para a nova ocorrência física
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

-- Agendamento idempotente: 02:00 UTC, uma hora antes de auto-confirm-daily e
-- client-notifications-daily (ambos 03:00 UTC), para que uma ocorrência que
-- vence hoje já exista fisicamente antes de esses dois jobs rodarem.
SELECT cron.unschedule('replenish-recurring-occurrences-daily')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'replenish-recurring-occurrences-daily'
);

SELECT cron.schedule(
  'replenish-recurring-occurrences-daily',
  '0 2 * * *',
  $$SELECT public.fn_replenish_recurring_occurrences();$$
);
