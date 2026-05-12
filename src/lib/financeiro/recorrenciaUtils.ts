import { supabase } from '../supabase';
import { addDays, addWeeks, addMonths, addYears, format } from 'date-fns';
import { calcularMesFatura, type AccountInvoiceConfig } from './faturaUtils';

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
  quantidade: number = 12,
  accountConfig?: AccountInvoiceConfig | null
) {
  const occurrences = [];
  const startDate = parseLocalDate(parentData.date);

  for (let i = 1; i <= quantidade; i++) {
    const occurrenceDate = addPeriod(startDate, i * intervalo, periodicidade);
    const occurrenceDateStr = format(occurrenceDate, 'yyyy-MM-dd');

    // Dynamically calculate invoice_month for each occurrence
    const invoiceMonth = accountConfig
      ? calcularMesFatura(occurrenceDateStr, accountConfig)
      : baseTransaction.invoice_month;

    occurrences.push({
      ...baseTransaction,
      parent_id: parentData.id,
      date: occurrenceDateStr,
      recurrence_period: periodicidade,
      recurrence_interval: intervalo,
      invoice_month: invoiceMonth,
    });
  }

  if (occurrences.length > 0) {
    const { error } = await supabase.from('financial_transactions').insert(occurrences);
    if (error) throw error;
  }
}
