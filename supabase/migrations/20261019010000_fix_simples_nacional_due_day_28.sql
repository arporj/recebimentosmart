-- Migration: 20261019010000_fix_simples_nacional_due_day_28.sql
-- Description: Devolve ao dia 28 o vencimento das parcelas pendentes do
-- "Parcelamento Simples Nacional (ARRC)".
--
-- O vencimento desse parcelamento é sempre no dia 28 (confirmado pelo usuário em
-- 2026-10-19). Em 2026-10-14 a parcela 35/60 foi editada com "este e os futuros"
-- mudando a data para o dia do pagamento (14); o dia 14 foi aplicado às parcelas
-- pendentes seguintes. Auditado em 2026-10-19: parcelas 38 a 60 (2027-01 a 2028-11)
-- no dia 14; 36 e 37 já estão no dia 28. As parcelas pagas guardam a data do
-- pagamento e não são tocadas.
--
-- Correção de dados de uma série específica (identificada pela parcela raiz):
-- em qualquer outro banco não encontra linhas e não faz nada.

UPDATE public.financial_transactions
SET date = make_date(EXTRACT(YEAR FROM date)::int, EXTRACT(MONTH FROM date)::int, 28)
WHERE (id = '2b52e3fa-8775-4df1-980b-11e6039afb7b'
       OR parent_id = '2b52e3fa-8775-4df1-980b-11e6039afb7b')
  AND status = 'pending'
  AND EXTRACT(DAY FROM date) <> 28;
