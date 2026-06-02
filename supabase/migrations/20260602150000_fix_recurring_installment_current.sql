-- Migration para corrigir installment_current de recorrências filhas existentes na base de dados

-- 1. Para recorrências mensais:
UPDATE public.financial_transactions child
SET installment_current = 1 + ROUND(EXTRACT(epoch FROM age(child.date::timestamp, mother.date::timestamp)) / (30.436875 * 24 * 60 * 60 * (COALESCE(mother.recurrence_interval, 1))))
FROM public.financial_transactions mother
WHERE child.parent_id = mother.id
  AND mother.modalidade = 'recorrente'
  AND mother.recurrence_period = 'monthly'
  AND child.installment_current = 1;

-- 2. Para recorrências semanais:
UPDATE public.financial_transactions child
SET installment_current = 1 + ROUND(EXTRACT(epoch FROM (child.date::timestamp - mother.date::timestamp)) / (7 * 24 * 60 * 60 * (COALESCE(mother.recurrence_interval, 1))))
FROM public.financial_transactions mother
WHERE child.parent_id = mother.id
  AND mother.modalidade = 'recorrente'
  AND mother.recurrence_period = 'weekly'
  AND child.installment_current = 1;

-- 3. Para recorrências diárias:
UPDATE public.financial_transactions child
SET installment_current = 1 + ROUND(EXTRACT(epoch FROM (child.date::timestamp - mother.date::timestamp)) / (24 * 60 * 60 * (COALESCE(mother.recurrence_interval, 1))))
FROM public.financial_transactions mother
WHERE child.parent_id = mother.id
  AND mother.modalidade = 'recorrente'
  AND mother.recurrence_period = 'daily'
  AND child.installment_current = 1;

-- 4. Para recorrências anuais:
UPDATE public.financial_transactions child
SET installment_current = 1 + ROUND(EXTRACT(year FROM age(child.date::timestamp, mother.date::timestamp)) / (COALESCE(mother.recurrence_interval, 1)))
FROM public.financial_transactions mother
WHERE child.parent_id = mother.id
  AND mother.modalidade = 'recorrente'
  AND mother.recurrence_period = 'yearly'
  AND child.installment_current = 1;
