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

/** Horizonte padrão de geração física: hoje + 3 meses. */
export const defaultRecurrenceHorizon = () => addMonths(new Date(), 3);

// Trava de segurança: mesmo com um horizonte mal configurado (ex.: recorrência
// diária com horizonte de vários anos), nunca gera mais que isso numa chamada.
const MAX_OCCURRENCES_PER_CALL = 400;

export async function gerarInstanciasRecorrentes(
  parentData: any,
  baseTransaction: any,
  periodicidade: string,
  intervalo: number,
  horizonEnd: Date = defaultRecurrenceHorizon(),
  accountConfig?: AccountInvoiceConfig | null,
  tags?: string[]
) {
  const occurrences = [];
  const startDate = parseLocalDate(parentData.date);
  const safeIntervalo = intervalo && intervalo > 0 ? intervalo : 1;

  let i = 1;
  let occurrenceDate = addPeriod(startDate, i * safeIntervalo, periodicidade);

  while (occurrenceDate.getTime() <= horizonEnd.getTime() && i <= MAX_OCCURRENCES_PER_CALL) {
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
      installment_current: (parentData.installment_current || 1) + i,
      installment_total: 1,
    });

    i++;
    occurrenceDate = addPeriod(startDate, i * safeIntervalo, periodicidade);
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
