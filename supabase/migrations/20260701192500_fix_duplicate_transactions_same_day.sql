-- Migração corretiva para deletar lançamentos físicos de recorrência que foram duplicados no mesmo dia
-- de vencimento com o mesmo parent_id, mesmo que o installment_current seja nulo.

DELETE FROM public.financial_transactions ft1
WHERE ft1.is_template IS DISTINCT FROM true
  AND ft1.parent_id IS NOT NULL
  AND EXISTS (
    SELECT 1 
    FROM public.financial_transactions ft2
    WHERE ft2.id < ft1.id
      AND ft2.is_template IS DISTINCT FROM true
      AND ft2.parent_id = ft1.parent_id
      AND ft2.date = ft1.date
      AND ft2.user_id = ft1.user_id
  );
