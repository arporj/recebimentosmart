-- Migration: Limpeza de lançamentos duplicados pendentes gerados no 1º dia do mês
-- Remove ocorrências duplicadas pendentes geradas automaticamente quando já existe
-- outra ocorrência (paga ou pendente) para o mesmo contrato no mesmo mês.

DELETE FROM public.financial_transactions ft1
WHERE ft1.is_template IS DISTINCT FROM true
  AND ft1.status = 'pending'
  AND (ft1.parent_id IS NOT NULL OR ft1.modalidade = 'recorrente')
  AND EXTRACT(DAY FROM ft1.date::date) = 1
  AND EXISTS (
    SELECT 1 
    FROM public.financial_transactions ft2
    WHERE ft2.id != ft1.id
      AND ft2.is_template IS DISTINCT FROM true
      AND ft2.user_id = ft1.user_id
      AND (
        (ft1.parent_id IS NOT NULL AND ft2.parent_id = ft1.parent_id)
        OR (ft1.parent_id IS NULL AND ft2.description = ft1.description)
      )
      AND DATE_TRUNC('month', ft2.date::date) = DATE_TRUNC('month', ft1.date::date)
  );
