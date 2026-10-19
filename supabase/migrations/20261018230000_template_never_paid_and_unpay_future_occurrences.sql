-- Migration: 20261018230000_template_never_paid_and_unpay_future_occurrences.sql
-- Description: O status "pago" de uma ocorrência não pode se espalhar pela série.
--
-- Dois caminhos levavam o "pago" de uma ocorrência para outras:
--   1. Criar um recorrente já pago gravava a mãe (template) como 'paid', e editar
--      "este e os futuros" marcando a ocorrência como paga fazia o mesmo com a mãe
--      nova (fn_dividir_serie_recorrente copia p_series_update para a mãe).
--   2. Editar com escopo "todos", ou "este e os futuros" numa parcelada, aplicava o
--      status/paid_date do formulário a todas as ocorrências da série. Ex.: editar a
--      parcela 35/60 já paga de "Parcelamento Simples Nacional (ARRC)" em 2026-10-14
--      marcou as parcelas 38 a 60 (2027-01 a 2028-11) como pagas.
-- O código (criarTransacao/editarTransacao) foi corrigido; este trigger garante a
-- regra no banco para qualquer outro caminho (RPCs, Artie, voz).

-- 1. Template é só a regra da série: nunca é pago (quem é pago é a ocorrência física).
--    'cancelled' é preservado (usado no fluxo de compartilhamento).
CREATE OR REPLACE FUNCTION public.fn_template_status_pending()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_template = true AND NEW.status IN ('paid', 'partial') THEN
    NEW.status := 'pending';
    NEW.paid_date := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_template_status_pending ON public.financial_transactions;
CREATE TRIGGER trg_template_status_pending
  BEFORE INSERT OR UPDATE OF status, is_template, paid_date ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.fn_template_status_pending();

-- 2. Corrige templates já gravados como pagos (o trigger acima faz a troca).
UPDATE public.financial_transactions
SET status = 'pending'
WHERE is_template = true
  AND status IN ('paid', 'partial');

-- 3. Ocorrências futuras de parceladas/recorrentes marcadas como pagas voltam a
--    pendente. Auditado em 2026-10-18: 23 linhas, todas do parcelamento citado acima
--    (paid_date 2026-10-14, propagado pela edição em massa), nenhuma compartilhada.
UPDATE public.financial_transactions
SET status = 'pending',
    paid_date = NULL
WHERE is_template = false
  AND status = 'paid'
  AND modalidade IN ('parcelada', 'recorrente')
  AND date > CURRENT_DATE;

-- 4. A mesma edição em massa copiava a descrição da parcela editada, com a numeração
--    dela, para as outras. Restaura a numeração "(n/total)" de cada parcela a partir de
--    installment_current/installment_total (mesma regra de numerarDescricaoParcela em
--    src/lib/financeiro/editarTransacao.ts: troca só a última numeração do texto).
--    Auditado em 2026-10-18: 28 linhas (parcelas 33 a 60 do parcelamento citado acima,
--    todas com "(32/60)").
UPDATE public.financial_transactions
SET description = regexp_replace(
      description,
      '\(\d+/\d+\)(?!.*\(\d+/\d+\))',
      '(' || installment_current || '/' || installment_total || ')'
    )
WHERE modalidade = 'parcelada'
  AND is_template = false
  AND regexp_replace(
        description,
        '\(\d+/\d+\)(?!.*\(\d+/\d+\))',
        '(' || installment_current || '/' || installment_total || ')'
      ) <> description;
