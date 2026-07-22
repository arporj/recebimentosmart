-- Migração corretiva: remove duplicidades mensais geradas pela janela de bug de
-- fn_replenish_recurring_occurrences() entre 2026-07-10 12:00 e 17:00 UTC.
-- Caminho: supabase/migrations/20260722190000_fix_replenish_cron_duplicate_months.sql
--
-- CONTEXTO (ver 20260710120000_replenish_recurring_occurrences_cron.sql e
-- 20260710170000_fix_replenish_anchor_date_drift.sql):
--
-- A primeira versão do cron de reposição física de recorrências (ativa por
-- ~5h em 10/07) ancorava a próxima ocorrência em MAX(date) da última física
-- existente. Quando essa última ocorrência tinha sido paga num dia diferente
-- do vencimento nominal do template, o dia do mês "vazava" e todas as
-- ocorrências seguintes herdavam o dia errado indefinidamente.
--
-- A correção (17:00 do mesmo dia) passou a ancorar sempre em template.date,
-- mas seu backfill só corrigiu 1 cliente citado nominalmente na migration
-- (Plano de Saúde UNIMED). Na execução seguinte do cron (11/07 02:00, já
-- corrigido), a checagem de "já existe" (date = candidata OU
-- installment_current = próximo) não reconheceu as ocorrências erradas do dia
-- anterior como cobertura do mesmo mês — porque nenhuma delas repete a mesma
-- data nem o mesmo installment_current — e gerou uma segunda sequência
-- completa no dia certo, duplicando os meses.
--
-- Escopo real do bug (auditado antes desta migração): ~99 templates em 10
-- usuários distintos, todos com pelo menos 1 ocorrência física criada na
-- janela 2026-07-10T12:00:00Z–17:00:00Z.
--
-- Resolução por (template, mês-calendário) com 2+ ocorrências não-canceladas:
--   a) 1 paga + 1(+) pendente(s)  -> apaga as pendentes (mesmo padrão da
--      migration histórica 20260701170000_fix_recurrence_backfill_duplicates.sql,
--      que já deletava pendentes duplicadas quando havia irmã paga/cancelada).
--   b) todas pendentes, e exatamente uma bate com o dia nominal do template
--      (EXTRACT(DAY FROM date) = EXTRACT(DAY FROM template.date)) -> apaga as
--      que não batem.
--   c) qualquer outro caso (2+ pagas no mesmo mês, ambiguidade de dia, 3+
--      linhas) -> não mexe, só loga para revisão manual.

DO $$
DECLARE
    v_group RECORD;
    v_template RECORD;
    v_ids_to_delete UUID[];
    v_paid_count INT;
    v_pending_count INT;
    v_nominal_day INT;
    v_matching_nominal INT;
    v_total_deleted INT := 0;
    v_total_skipped_ambiguous INT := 0;
BEGIN
    FOR v_group IN
        SELECT parent_id, date_trunc('month', date)::date AS month_bucket
        FROM public.financial_transactions
        WHERE parent_id IS NOT NULL
          AND status <> 'cancelled'
          AND is_template = false
        GROUP BY parent_id, date_trunc('month', date)
        HAVING COUNT(*) >= 2
    LOOP
        SELECT * INTO v_template
        FROM public.financial_transactions
        WHERE id = v_group.parent_id;

        IF NOT FOUND THEN
            CONTINUE;
        END IF;

        v_nominal_day := EXTRACT(DAY FROM v_template.date)::INT;

        SELECT
            COUNT(*) FILTER (WHERE status = 'paid'),
            COUNT(*) FILTER (WHERE status = 'pending')
        INTO v_paid_count, v_pending_count
        FROM public.financial_transactions
        WHERE parent_id = v_group.parent_id
          AND status <> 'cancelled'
          AND is_template = false
          AND date_trunc('month', date)::date = v_group.month_bucket;

        -- Caso (a): exatamente 1 paga + o resto pendente -> apaga as pendentes
        IF v_paid_count = 1 AND v_pending_count >= 1 THEN
            SELECT array_agg(id) INTO v_ids_to_delete
            FROM public.financial_transactions
            WHERE parent_id = v_group.parent_id
              AND status = 'pending'
              AND is_template = false
              AND date_trunc('month', date)::date = v_group.month_bucket;

            DELETE FROM public.financial_transactions WHERE id = ANY(v_ids_to_delete);
            v_total_deleted := v_total_deleted + COALESCE(array_length(v_ids_to_delete, 1), 0);

        -- Caso (b): todas pendentes, resolve pelo dia nominal do template
        ELSIF v_paid_count = 0 AND v_pending_count >= 2 THEN
            SELECT COUNT(*) INTO v_matching_nominal
            FROM public.financial_transactions
            WHERE parent_id = v_group.parent_id
              AND status = 'pending'
              AND is_template = false
              AND date_trunc('month', date)::date = v_group.month_bucket
              AND EXTRACT(DAY FROM date)::INT = v_nominal_day;

            IF v_matching_nominal = 1 THEN
                SELECT array_agg(id) INTO v_ids_to_delete
                FROM public.financial_transactions
                WHERE parent_id = v_group.parent_id
                  AND status = 'pending'
                  AND is_template = false
                  AND date_trunc('month', date)::date = v_group.month_bucket
                  AND EXTRACT(DAY FROM date)::INT <> v_nominal_day;

                DELETE FROM public.financial_transactions WHERE id = ANY(v_ids_to_delete);
                v_total_deleted := v_total_deleted + COALESCE(array_length(v_ids_to_delete, 1), 0);
            ELSE
                v_total_skipped_ambiguous := v_total_skipped_ambiguous + 1;
                RAISE LOG '[fix_replenish_duplicates] Ambíguo (dia nominal não bate de forma única): parent_id=%, mes=%', v_group.parent_id, v_group.month_bucket;
            END IF;

        -- Caso (c): 2+ pagas no mesmo mês, ou qualquer combinação não coberta acima
        ELSE
            v_total_skipped_ambiguous := v_total_skipped_ambiguous + 1;
            RAISE LOG '[fix_replenish_duplicates] Pulado para revisão manual: parent_id=%, mes=%, pagas=%, pendentes=%', v_group.parent_id, v_group.month_bucket, v_paid_count, v_pending_count;
        END IF;
    END LOOP;

    RAISE LOG '[fix_replenish_duplicates] % linha(s) duplicada(s) removida(s), % grupo(s) pulado(s) para revisão manual', v_total_deleted, v_total_skipped_ambiguous;
END $$;
