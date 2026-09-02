-- Migration: 20260902093000_fix_recurrence_child_flags_and_cleanup.sql
-- Description: Corrige transacoes fisicas reais (is_template = false) que ficaram com recurrence_enabled = true indevidamente,
-- evitando duplicacao em telas financeiras e faturas de cartao.

UPDATE financial_transactions
SET recurrence_enabled = false
WHERE is_template = false
  AND recurrence_enabled = true;

-- Garantir que novos templates gerados como filhos em splits tenham parent_id NULL para serem raizes independentes
UPDATE financial_transactions
SET parent_id = NULL
WHERE is_template = true
  AND parent_id IS NOT NULL;
