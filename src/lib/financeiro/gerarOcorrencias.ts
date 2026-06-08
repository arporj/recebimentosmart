import { supabase } from '../supabase';
import { addMonths, format, startOfMonth, endOfMonth, isBefore, parseISO } from 'date-fns';

/**
 * Esta função garante que todas as transações recorrentes 'mãe' tenham uma ocorrência
 * no mês atual ou no mês visualizado. Serve como fallback caso o pg_cron demore
 * ou para novas transações.
 */
export async function gerarOcorrencias(targetDate: Date = new Date()) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;

  const monthStart = startOfMonth(targetDate);
  const monthEnd = endOfMonth(targetDate);

  // 1. Buscar transações mãe (recorrentes e sem parent_id)
  const { data: parents } = await supabase
    .from('financial_transactions')
    .select('*')
    .eq('modalidade', 'recorrente')
    .is('parent_id', null)
    .or(`recurrence_end_date.is.null,recurrence_end_date.gte.${format(monthStart, 'yyyy-MM-dd')}`);

  if (!parents) return;

  const newOccurrences = [];

  for (const parent of parents as any[]) {
    // Verificar se já existe ocorrência para este mês
    const { data: exists } = await supabase
      .from('financial_transactions')
      .select('id')
      .eq('parent_id', parent.id)
      .gte('date', format(monthStart, 'yyyy-MM-dd'))
      .lte('date', format(monthEnd, 'yyyy-MM-dd'))
      .limit(1);

    if (!exists || exists.length === 0) {
      // Calcular a data correta para este mês baseada no due_day
      const occurrenceDate = new Date(targetDate);
      occurrenceDate.setDate(parent.due_day || 1);

      // Não gerar se for antes da data de criação original (date da mãe)
      if (isBefore(occurrenceDate, parseISO(parent.date))) continue;

      newOccurrences.push({
        user_id: parent.user_id,
        description: parent.description,
        amount: parent.amount,
        type: parent.type,
        category_id: parent.category_id,
        account_id: parent.account_id,
        modalidade: 'recorrente',
        parent_id: parent.id,
        date: format(occurrenceDate, 'yyyy-MM-dd'),
        status: 'pending',
        due_day: parent.due_day,
        auto_confirm: parent.auto_confirm ?? false,
      });
    }
  }

  if (newOccurrences.length > 0) {
    return await supabase.from('financial_transactions').insert(newOccurrences);
  }
}
