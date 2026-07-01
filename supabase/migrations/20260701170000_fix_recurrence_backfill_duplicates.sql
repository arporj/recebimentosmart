-- Migração corretiva para remover duplicidades geradas no backfill de recorrências
-- Caminho: supabase/migrations/20260701170000_fix_recurrence_backfill_duplicates.sql

-- Deletar transações pendentes duplicadas onde já exista um lançamento pago ou cancelado para o mesmo ciclo
DELETE FROM public.financial_transactions pending_tx
WHERE pending_tx.is_template = false
  AND pending_tx.status = 'pending'
  AND pending_tx.parent_id IS NOT NULL
  AND EXISTS (
      SELECT 1 FROM public.financial_transactions sibling_tx
      WHERE sibling_tx.parent_id = pending_tx.parent_id
        AND sibling_tx.installment_current = pending_tx.installment_current
        AND sibling_tx.id <> pending_tx.id
        AND sibling_tx.status IN ('paid', 'cancelled')
  );
