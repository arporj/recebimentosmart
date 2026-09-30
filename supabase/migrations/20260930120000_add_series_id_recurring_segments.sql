-- Migration: 20260930120000_add_series_id_recurring_segments.sql
-- Description: Liga entre si os "pedacos" (maes/templates) de uma mesma recorrencia.
--
-- Cada edicao "este e os futuros" de uma recorrencia encerra a mae atual e cria uma
-- mae nova a partir do ponto editado. Sem nenhum vinculo entre elas, uma segunda
-- edicao "este e os futuros" feita numa ocorrencia que ainda pertence a mae antiga
-- (ex.: editar de novo o mesmo mes) so encerrava a mae antiga, deixando a mae criada
-- pela primeira edicao ativa -> duas series ativas, valor duplicado todo mes
-- (ex.: "Seguro Cartao (Inter)", 2026-09-30). O mesmo valia para "excluir este e os
-- futuros". series_id identifica a serie logica; todo pedaco novo herda o series_id
-- de quem ele divide (ver src/lib/financeiro/serieRecorrente.ts).

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS series_id uuid;

CREATE INDEX IF NOT EXISTS idx_financial_transactions_series_id
  ON public.financial_transactions (series_id)
  WHERE series_id IS NOT NULL;

-- Toda mae nova sem series_id explicito inicia a propria serie (cobre criacao normal,
-- mudanca de modalidade, Artie, voz etc. sem precisar alterar cada caminho).
CREATE OR REPLACE FUNCTION public.set_default_series_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.series_id IS NULL AND NEW.parent_id IS NULL AND NEW.is_template = true THEN
    NEW.series_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_default_series_id ON public.financial_transactions;
CREATE TRIGGER trg_set_default_series_id
  BEFORE INSERT OR UPDATE OF parent_id, is_template, series_id ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_default_series_id();

-- Backfill: reconstroi o vinculo das divisoes ja existentes de forma conservadora.
-- Uma mae Y e considerada continuacao de X quando: mesmo usuario, mesma descricao
-- (exata), mesma conta e tipo, X foi encerrada, Y comeca depois do fim de X (ate 45
-- dias) e Y foi criada depois de X. Maes sem predecessora viram raiz da propria serie.
WITH RECURSIVE templ AS (
  SELECT id, user_id, trim(description) AS d, account_id, type, date, recurrence_end_date, created_at
  FROM public.financial_transactions
  WHERE parent_id IS NULL AND is_template = true AND modalidade = 'recorrente'
), pred AS (
  SELECT DISTINCT ON (y.id) y.id AS child_id, x.id AS pred_id
  FROM templ y
  JOIN templ x
    ON x.user_id = y.user_id
   AND x.d = y.d
   AND x.account_id IS NOT DISTINCT FROM y.account_id
   AND x.type = y.type
   AND x.id <> y.id
   AND x.recurrence_end_date IS NOT NULL
   AND y.date > x.recurrence_end_date
   AND y.date <= x.recurrence_end_date + 45
   AND y.created_at > x.created_at
  ORDER BY y.id, x.recurrence_end_date DESC, x.created_at DESC
), chain AS (
  SELECT t.id, t.id AS root
  FROM templ t
  WHERE NOT EXISTS (SELECT 1 FROM pred p WHERE p.child_id = t.id)
  UNION ALL
  SELECT p.child_id, c.root
  FROM pred p
  JOIN chain c ON p.pred_id = c.id
)
UPDATE public.financial_transactions ft
SET series_id = chain.root
FROM chain
WHERE ft.id = chain.id
  AND ft.series_id IS NULL;

-- Demais maes (parceladas, templates fora do padrao) iniciam a propria serie.
UPDATE public.financial_transactions
SET series_id = id
WHERE series_id IS NULL
  AND parent_id IS NULL
  AND is_template = true;
