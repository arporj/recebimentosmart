// instanceExpansion — expande lançamentos físicos + templates de recorrência em "instâncias"
// de um mês/período. Fonte única desta lógica, hoje duplicada em FinancialTransactionsV2.tsx
// (allInstancesUpToMonth) e DashboardV2.tsx (expandedInstances), com pequenas divergências
// silenciosas entre as duas cópias.

import { parseISO, isBefore, isSameDay, addDays, addWeeks, addMonths, addYears, isAfter } from 'date-fns';

export interface RawFinancialTransaction {
  id: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  date: string;
  status: 'pending' | 'paid' | 'partial' | 'cancelled';
  description?: string | null;
  parent_id?: string | null;
  installment_current?: number | null;
  installment_total?: number | null;
  recurrence_enabled?: boolean;
  recurrence_period?: string;
  recurrence_interval?: number;
  recurrence_end_date?: string | null;
  account_id?: string;
  destination_account_id?: string;
  account_type?: string;
  invoice_month?: string | null;
  auto_confirm?: boolean;
  category_id?: string;
  category_name?: string;
  client_name?: string;
  account_name?: string;
  destination_account_type?: string;
  destination_account_name?: string;
}

export interface TransactionInstance extends RawFinancialTransaction {
  instanceDate: string;
  originalInstanceDate: string;
  isVirtual: boolean;
  isInvoiceSummary?: boolean;
  isOverdueRollover?: boolean;
  invoiceData?: {
    cardId: string;
    cardName: string;
    linkedAccountName: string | null;
    invoicePaymentAccountId: string | null;
    total: number;
  };
}

export interface ExpandInstancesOptions {
  /** Instâncias são geradas até esta data, inclusive. */
  horizonEnd: Date;
  /**
   * Se true, lançamentos físicos não pagos com data no passado têm sua instanceDate
   * "rolada" para hoje (comportamento do DashboardV2). Se false (padrão), a instância
   * fica na sua data original (comportamento do FinancialTransactionsV2, necessário para
   * que a lista de um mês reconcilie só com aquele mês).
   */
  rollOverUnpaidToToday?: boolean;
  /**
   * Se true, instâncias cuja account_type === 'credit_card' são forçadas para status
   * 'paid' (usado pelo Dashboard para KPIs de receita/despesa — uma compra no cartão já
   * aconteceu financeiramente mesmo que o pagamento da fatura ainda esteja pendente).
   * Nunca usar esta opção para cálculo de saldo/projeção de contas.
   */
  treatCreditCardChargesAsPaid?: boolean;
  /** Injetável para testes determinísticos; padrão `new Date()`. */
  today?: Date;
}

export function expandTransactionInstances(
  transactions: RawFinancialTransaction[],
  templates: RawFinancialTransaction[],
  options: ExpandInstancesOptions,
): TransactionInstance[] {
  const { horizonEnd, rollOverUnpaidToToday = false, treatCreditCardChargesAsPaid = false } = options;
  const today = options.today ?? new Date();

  const instances: TransactionInstance[] = [];

  // 1. Identificar registros físicos daquela cadeia para evitar sobreposição com virtuais
  const physicalDatesByParent = new Map<string, Set<string>>();
  const physicalMonthsByParent = new Map<string, Set<string>>();
  const physicalIndicesByParent = new Map<string, Set<number>>();
  for (const t of transactions) {
    const parentId = t.parent_id || t.id;
    if (!physicalDatesByParent.has(parentId)) physicalDatesByParent.set(parentId, new Set());
    physicalDatesByParent.get(parentId)!.add(t.date);

    if (!physicalMonthsByParent.has(parentId)) physicalMonthsByParent.set(parentId, new Set());
    physicalMonthsByParent.get(parentId)!.add(t.date.substring(0, 7));

    if (t.parent_id && t.installment_current !== null && t.installment_current !== undefined) {
      if (!physicalIndicesByParent.has(parentId)) physicalIndicesByParent.set(parentId, new Set());
      physicalIndicesByParent.get(parentId)!.add(t.installment_current);
    }
  }

  // Fase 1: transações físicas reais
  const todayStr = today.toISOString().substring(0, 10);
  for (const t of transactions) {
    if (t.status === 'cancelled') continue;

    const tDate = parseISO(t.date);
    if (!(isBefore(tDate, horizonEnd) || isSameDay(tDate, horizonEnd))) continue;

    const status = treatCreditCardChargesAsPaid && t.account_type === 'credit_card' ? 'paid' : t.status;

    let instanceDate = t.date;
    if (rollOverUnpaidToToday && status !== 'paid' && t.date < todayStr && t.account_type !== 'credit_card') {
      instanceDate = todayStr;
    }

    instances.push({
      ...t,
      status,
      instanceDate,
      originalInstanceDate: t.date,
      isVirtual: false,
    });
  }

  // Fase 2: ocorrências virtuais futuras projetadas a partir dos templates de recorrência
  for (const t of templates) {
    const interval = t.recurrence_interval || 1;
    const period = t.recurrence_period || 'monthly';
    const recEndDate = t.recurrence_end_date ? parseISO(t.recurrence_end_date) : null;
    const tDate = parseISO(t.date);

    let cursor = new Date(tDate);
    const parentId = t.id;
    let occurrenceIndex = 0;

    while (isBefore(cursor, horizonEnd) || isSameDay(cursor, horizonEnd)) {
      if (recEndDate && isAfter(cursor, recEndDate)) break;

      const dateStr = cursor.toISOString().substring(0, 10);
      const currentInst = (t.installment_current || 1) + occurrenceIndex;

      const hasPhysicalByIndex = physicalIndicesByParent.get(parentId)?.has(currentInst);
      const hasPhysicalByDate = physicalDatesByParent.get(parentId)?.has(dateStr);
      const hasPhysicalByMonth = period === 'monthly' && physicalMonthsByParent.get(parentId)?.has(dateStr.substring(0, 7));
      const alreadyHasPhysical = hasPhysicalByIndex || hasPhysicalByDate || hasPhysicalByMonth;

      if (!alreadyHasPhysical) {
        let newInvoiceMonth = t.invoice_month;
        if (t.account_type === 'credit_card' && t.invoice_month) {
          const [y, m] = t.invoice_month.split('-');
          const origInvoiceDate = new Date(Number(y), Number(m) - 1, 1);
          const diffMonths = (cursor.getFullYear() - tDate.getFullYear()) * 12 + (cursor.getMonth() - tDate.getMonth());
          newInvoiceMonth = addMonths(origInvoiceDate, diffMonths).toISOString().substring(0, 7);
        }

        const status = treatCreditCardChargesAsPaid && t.account_type === 'credit_card' ? 'paid' : 'pending';

        instances.push({
          ...t,
          instanceDate: dateStr,
          originalInstanceDate: dateStr,
          isVirtual: true,
          status,
          installment_current: currentInst,
          invoice_month: newInvoiceMonth,
        });
      }

      occurrenceIndex++;
      switch (period) {
        case 'daily': cursor = addDays(cursor, interval); break;
        case 'weekly': cursor = addWeeks(cursor, interval); break;
        case 'monthly': cursor = addMonths(cursor, interval); break;
        case 'yearly': cursor = addYears(cursor, interval); break;
        default: cursor = addMonths(cursor, interval);
      }
    }
  }

  return instances.sort((a, b) => {
    const dateCompare = a.instanceDate.localeCompare(b.instanceDate);
    if (dateCompare !== 0) return dateCompare;
    return (a.id ?? '').localeCompare(b.id ?? '');
  });
}
