-- Remove templates recorrentes com amount = 0 que não possuem nenhum filho físico.
-- Esses registros são inválidos (criados com dados incompletos em migrações anteriores)
-- e estão causando projeção de ocorrências virtuais zeradas em todos os meses futuros
-- para os usuários afetados (Ricardo Cabral, André Ricardo, Alicia Galhano).

DELETE FROM public.financial_transactions
WHERE is_template = true
  AND recurrence_enabled = true
  AND amount = 0.00
  AND id NOT IN (
    -- Garante que só excluiremos templates que não têm NENHUM filho físico
    SELECT DISTINCT parent_id
    FROM public.financial_transactions
    WHERE parent_id IS NOT NULL
  );
