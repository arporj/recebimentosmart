import { supabase } from '../supabase';
import { addDays, addWeeks, addMonths, addYears, format } from 'date-fns';

export const addPeriod = (date: Date, amount: number, period: string) => {
  switch (period) {
    case 'daily': return addDays(date, amount);
    case 'weekly': return addWeeks(date, amount);
    case 'yearly': return addYears(date, amount);
    default: return addMonths(date, amount);
  }
};

export const parseLocalDate = (dateStr: string) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export async function gerarInstanciasRecorrentes(
  parentData: any,
  baseTransaction: any,
  periodicidade: string,
  intervalo: number,
  quantidade: number = 12
) {
  const occurrences = [];
  const startDate = parseLocalDate(parentData.date);

  for (let i = 1; i <= quantidade; i++) {
    const occurrenceDate = addPeriod(startDate, i * intervalo, periodicidade);
    occurrences.push({
      ...baseTransaction,
      parent_id: parentData.id,
      date: format(occurrenceDate, 'yyyy-MM-dd'),
      recurrence_period: periodicidade,
      recurrence_interval: intervalo,
    });
  }

  if (occurrences.length > 0) {
    const { error } = await supabase.from('financial_transactions').insert(occurrences);
    if (error) throw error;
  }
}
