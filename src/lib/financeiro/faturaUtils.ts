import { parseISO, setDate as setDateFns, subDays, addMonths, subMonths, isAfter, isBefore, format } from 'date-fns';

export interface AccountInvoiceConfig {
  type: string;
  due_day?: number | null;
  closing_days_before?: number | null;
}

/**
 * Calculates which invoice month (yyyy-MM) a transaction date falls into,
 * based on the credit card's due_day and closing_days_before configuration.
 *
 * Returns null if the account is not a credit card or lacks the required fields.
 */
export function calcularMesFatura(
  dateStr: string,
  account: AccountInvoiceConfig
): string | null {
  if (account.type !== 'credit_card' || !account.due_day || !account.closing_days_before) {
    return null;
  }

  try {
    const tDate = parseISO(dateStr);

    // Check invoice windows from -1 to +2 months relative to the transaction date
    for (let i = -1; i <= 2; i++) {
      const m = addMonths(tDate, i);
      const dueDate = setDateFns(m, Math.min(account.due_day, 28));
      const closingDate = subDays(dueDate, account.closing_days_before);
      const endDate = subDays(closingDate, 1);

      const prevDueDate = setDateFns(subMonths(m, 1), Math.min(account.due_day, 28));
      const prevClosingDate = subDays(prevDueDate, account.closing_days_before);
      const startDate = prevClosingDate;

      if (!isBefore(tDate, startDate) && !isAfter(tDate, endDate)) {
        return format(m, 'yyyy-MM');
      }
    }

    // Fallback: return the month of the transaction date itself
    return format(tDate, 'yyyy-MM');
  } catch (err) {
    console.error('Erro ao calcular invoice_month:', err);
    return null;
  }
}
