-- Migration: 20261013180000_atomic_recurring_series_split.sql
-- Description: "Editar/excluir este e os futuros" de uma recorrencia passa a rodar
-- numa unica transacao no banco.
--
-- Antes, src/lib/financeiro/editarTransacao.ts fazia a divisao da serie em varias
-- chamadas REST independentes: primeiro APAGAVA as ocorrencias futuras e encerrava a
-- mae antiga (serieRecorrente.ts), e so depois criava a mae nova, a primeira filha e
-- as proximas ocorrencias. Qualquer falha no meio do caminho (insert recusado, rede,
-- aba fechada) deixaria a serie sem futuros. Correcao preventiva: o relato de
-- "futuros sumiram" de 2026-10-13 ("Celular VIVO") nao foi causado por isso - os
-- logs mostram a divisao completa e os dados ficaram corretos -, mas o risco e real.
-- Como funcoes plpgsql rodam numa transacao so, agora ou tudo acontece, ou nada muda.
--
-- SECURITY INVOKER: roda com as permissoes de quem chama, entao o RLS de
-- financial_transactions/transaction_tags continua valendo exatamente como nas
-- chamadas REST que estas funcoes substituem.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Encerra, a partir de p_cut_from, TODOS os pedacos (maes) da mesma serie.
--    Porta 1:1 de encerrarSerieAPartirDe (src/lib/financeiro/serieRecorrente.ts).
--    Retorna o series_id que uma mae nova (se houver) deve herdar.
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_encerrar_serie_recorrente(
    p_mother_id UUID,
    p_cut_from DATE,
    p_keep_paid_children BOOLEAN,
    p_cancel_children BOOLEAN DEFAULT false
) RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_series_id UUID;
    v_user_id UUID;
    v_segment RECORD;
    v_end_before_cut DATE := p_cut_from - 1;
    v_remaining INT;
BEGIN
    SELECT COALESCE(series_id, id), user_id
    INTO v_series_id, v_user_id
    FROM financial_transactions
    WHERE id = p_mother_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Série recorrente não encontrada';
    END IF;

    -- FOR UPDATE: duas divisões simultâneas da mesma série passam a ser serializadas.
    FOR v_segment IN
        SELECT id, date, recurrence_end_date
        FROM financial_transactions
        WHERE user_id = v_user_id
          AND parent_id IS NULL
          AND (id = p_mother_id OR series_id = v_series_id)
        FOR UPDATE
    LOOP
        -- 1. Filhas físicas do pedaço a partir do corte
        IF p_cancel_children THEN
            UPDATE financial_transactions
            SET status = 'cancelled', shared_status = 'modified'
            WHERE parent_id = v_segment.id
              AND date >= p_cut_from
              AND (NOT p_keep_paid_children OR status <> 'paid');
        ELSE
            DELETE FROM financial_transactions
            WHERE parent_id = v_segment.id
              AND date >= p_cut_from
              AND (NOT p_keep_paid_children OR status <> 'paid');
        END IF;

        IF v_segment.date >= p_cut_from THEN
            -- 2a. Pedaço inteiro depois do corte: não pode gerar mais nada. Só apaga a
            -- mãe se não sobrou filha (ex.: já paga) — senão as filhas ficariam órfãs
            -- (parent_id ON DELETE SET NULL).
            SELECT count(*) INTO v_remaining
            FROM financial_transactions
            WHERE parent_id = v_segment.id;

            IF v_remaining > 0 THEN
                UPDATE financial_transactions
                SET recurrence_end_date = v_end_before_cut
                WHERE id = v_segment.id;
            ELSE
                DELETE FROM financial_transactions WHERE id = v_segment.id;
            END IF;
        ELSIF v_segment.recurrence_end_date IS NULL OR v_segment.recurrence_end_date >= p_cut_from THEN
            -- 2b. Pedaço que atravessa o corte: termina na véspera
            UPDATE financial_transactions
            SET recurrence_end_date = v_end_before_cut
            WHERE id = v_segment.id;
        END IF;
    END LOOP;

    RETURN v_series_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Divide a série em "este e os futuros": encerra a série antiga, aplica a
--    edição na ocorrência (se paga), cria a mãe nova, a primeira filha e as
--    ocorrências físicas até o horizonte padrão (hoje + 3 meses).
--    Porta do ramo scope='following' + modalidade='recorrente' de
--    src/lib/financeiro/editarTransacao.ts. Retorna o id da primeira filha.
--
--    p_series_update     campos novos da série (já sem date, tags, periodicidade e
--                        intervalo — higienizados no TS).
--    p_occurrence_update campos novos da própria ocorrência, usados só quando ela
--                        está paga (continua na série antiga recebendo os dados).
--    p_tags              NULL = não mexe em tags.
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_dividir_serie_recorrente(
    p_transaction_id UUID,
    p_original_date DATE,
    p_new_date DATE,
    p_series_update JSONB,
    p_occurrence_update JSONB,
    p_tags UUID[] DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_current financial_transactions;
    v_mother financial_transactions;
    v_child financial_transactions;
    v_is_paid BOOLEAN;
    v_interval INT;
    v_period TEXT;
    v_cut_from DATE;
    v_start DATE;
    v_next_cycle DATE;
    v_last_day INT;
    v_series_id UUID;
    v_set_clause TEXT;
    v_horizon DATE := (CURRENT_DATE + INTERVAL '3 months')::DATE;
    v_k INT := 1;
    v_candidate DATE;
    v_new_id UUID;
BEGIN
    SELECT * INTO v_current
    FROM financial_transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Erro ao buscar transação';
    END IF;

    v_interval := GREATEST(COALESCE(v_current.recurrence_interval, 1), 1);
    v_period := COALESCE(v_current.recurrence_period, 'monthly');

    -- Só uma ocorrência física pode estar paga. Numa ocorrência virtual v_current é o
    -- template, cujo status cru (herdado da criação) não diz nada sobre a ocorrência.
    v_is_paid := v_current.status = 'paid' AND NOT COALESCE(v_current.is_template, false);

    IF v_is_paid THEN
        -- Ocorrência paga continua na série antiga; a nova mãe começa no ciclo
        -- seguinte ao da data ORIGINAL (partir da nova data pularia um mês quando o
        -- pagamento é lançado no mês seguinte), com o novo dia.
        v_cut_from := p_original_date + 1;
        v_next_cycle := fn_add_recurrence_period(p_original_date, v_interval, v_period);
        v_last_day := EXTRACT(DAY FROM (date_trunc('month', v_next_cycle) + INTERVAL '1 month' - INTERVAL '1 day'))::INT;
        v_start := make_date(
            EXTRACT(YEAR FROM v_next_cycle)::INT,
            EXTRACT(MONTH FROM v_next_cycle)::INT,
            LEAST(EXTRACT(DAY FROM p_new_date)::INT, v_last_day)
        );
    ELSE
        -- Ocorrência não paga passa para a nova série, na nova data. O corte usa a
        -- menor entre data original e nova: cortar só pela nova deixava a original
        -- viva quando a data ia para frente (28 → 30).
        v_cut_from := LEAST(p_original_date, p_new_date);
        v_start := p_new_date;
    END IF;

    v_series_id := fn_encerrar_serie_recorrente(
        COALESCE(v_current.parent_id, v_current.id),
        v_cut_from,
        true,
        false
    );

    IF v_is_paid THEN
        -- "Este e os futuros" inclui ESTE: a ocorrência paga também recebe os novos dados.
        SELECT string_agg(format('%I = r.%I', k, k), ', ')
        INTO v_set_clause
        FROM jsonb_object_keys(COALESCE(p_occurrence_update, '{}'::jsonb)) AS k
        WHERE k <> 'is_customized';

        EXECUTE format(
            'UPDATE financial_transactions t SET %s is_customized = true
             FROM jsonb_populate_record(NULL::financial_transactions, $1) r
             WHERE t.id = $2',
            COALESCE(v_set_clause || ',', '')
        ) USING p_occurrence_update, p_transaction_id;

        IF p_tags IS NOT NULL THEN
            DELETE FROM transaction_tags WHERE transaction_id = p_transaction_id;
            INSERT INTO transaction_tags (transaction_id, tag_id)
            SELECT p_transaction_id, unnest(p_tags);
        END IF;
    END IF;

    -- Nova mãe (template): copia a ocorrência editada + campos novos da série.
    v_mother := jsonb_populate_record(v_current, COALESCE(p_series_update, '{}'::jsonb));
    v_mother.id := gen_random_uuid();
    v_mother.created_at := now();
    v_mother.parent_id := NULL;
    v_mother.recurrence_end_date := NULL;
    v_mother.series_id := v_series_id;
    v_mother.date := v_start;
    v_mother.due_day := EXTRACT(DAY FROM p_new_date)::INT;
    v_mother.modalidade := 'recorrente';
    v_mother.recurrence_enabled := true;
    v_mother.is_template := true;
    v_mother.installment_current := COALESCE(v_current.installment_current, 1) + CASE WHEN v_is_paid THEN 1 ELSE 0 END;
    IF v_is_paid OR COALESCE(p_series_update->>'status', '') = '' THEN
        v_mother.status := 'pending';
    END IF;
    IF v_is_paid OR jsonb_typeof(p_series_update->'paid_date') IS DISTINCT FROM 'string' THEN
        v_mother.paid_date := NULL;
    END IF;

    INSERT INTO financial_transactions SELECT (v_mother).*;

    IF p_tags IS NOT NULL THEN
        INSERT INTO transaction_tags (transaction_id, tag_id)
        SELECT v_mother.id, unnest(p_tags);
    END IF;

    -- Primeira filha física da nova série, na data de início.
    v_child := v_mother;
    v_child.id := gen_random_uuid();
    v_child.parent_id := v_mother.id;
    v_child.is_template := false;
    v_child.recurrence_enabled := false;

    INSERT INTO financial_transactions SELECT (v_child).*;

    IF p_tags IS NOT NULL THEN
        INSERT INTO transaction_tags (transaction_id, tag_id)
        SELECT v_child.id, unnest(p_tags);
    END IF;

    -- Próximas ocorrências físicas até o horizonte (mesmas colunas do cron
    -- fn_replenish_recurring_occurrences; invoice_month fica a cargo do trigger).
    LOOP
        EXIT WHEN v_k > 400;
        v_candidate := fn_add_recurrence_period(v_start, v_k * v_interval, v_period);
        EXIT WHEN v_candidate > v_horizon;

        INSERT INTO financial_transactions (
            user_id, type, amount, description, client_id, account_id,
            destination_account_id, category_id, card_holder_name,
            date, modalidade, status, parent_id, is_template,
            recurrence_enabled, recurrence_period, recurrence_interval,
            due_day, installment_current, installment_total, auto_confirm
        ) VALUES (
            v_mother.user_id, v_mother.type, v_mother.amount, v_mother.description,
            v_mother.client_id, v_mother.account_id, v_mother.destination_account_id,
            v_mother.category_id, v_mother.card_holder_name,
            v_candidate, 'recorrente', 'pending', v_mother.id, false,
            false, v_period, v_interval,
            v_mother.due_day, v_mother.installment_current + v_k, 1, v_mother.auto_confirm
        )
        RETURNING id INTO v_new_id;

        IF p_tags IS NOT NULL THEN
            INSERT INTO transaction_tags (transaction_id, tag_id)
            SELECT v_new_id, unnest(p_tags);
        END IF;

        v_k := v_k + 1;
    END LOOP;

    RETURN v_child.id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_encerrar_serie_recorrente(UUID, DATE, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_dividir_serie_recorrente(UUID, DATE, DATE, JSONB, JSONB, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_encerrar_serie_recorrente(UUID, DATE, BOOLEAN, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_dividir_serie_recorrente(UUID, DATE, DATE, JSONB, JSONB, UUID[]) TO authenticated;
