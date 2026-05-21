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
  accountConfig?: AccountInvoiceConfig | null,
  tags?: string[]
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
      status: 'pending', // Future instances are always pending
    });
  }

  if (occurrences.length > 0) {
    const { data: createdOccurrences, error } = await supabase
      .from('financial_transactions')
      .insert(occurrences)
      .select('id');
    if (error) throw error;

    if (tags && tags.length > 0 && createdOccurrences) {
      const junctionRows = createdOccurrences.flatMap(occurrence => 
        tags.map(tagId => ({
          transaction_id: occurrence.id,
          tag_id: tagId
        }))
      );
      const { error: tagError } = await supabase.from('transaction_tags').insert(junctionRows);
      if (tagError) console.error('Erro ao salvar tags das ocorrências recorrentes:', tagError);
    }
  }
}
