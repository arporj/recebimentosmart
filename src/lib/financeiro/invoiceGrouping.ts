// invoiceGrouping — agrupa lançamentos de cartão de crédito por (cartão, invoice_month) e
// decide se a fatura já está reconciliada (existe uma transferência real de pagamento).
// Fonte única desta lógica, hoje duplicada em FinancialTransactionsV2.tsx (invoiceInstances +
// o loop de pendingInvoiceDeduction dentro de accountsData) e DashboardV2.tsx
// (monthVirtualInvoices + seu próprio loop de dedução + o unpaidExpenses de balanceSheetData).

import type { TransactionInstance } from './instanceExpansion';

export interface CreditCardAccountLike {
  id: string;
  name: string;
  due_day?: number | null;
  invoice_payment_account_id?: string | null;
  linkedAccountName?: string | null;
}

export interface InvoiceGroup {
  cardId: string;
  cardName: string;
  invoiceMonth: string; // 'YYYY-MM'
  /** Positivo = fatura a pagar; negativo = crédito a favor do usuário. */
  total: number;
  dueDate: string; // 'YYYY-MM-DD'
  invoicePaymentAccountId: string | null;
  linkedAccountName: string | null;
  /** true quando já existe uma transferência real (paga ou agendada) pagando esta fatura. */
  reconciled: boolean;
  billTransfer: TransactionInstance | null;
  isPaid: boolean;
}

export interface GroupInvoicesOptions {
  /** Quando true, soma apenas lançamentos com status 'paid' do cartão. */
  onlyConfirmed?: boolean;
}

function resolveDueDate(invoiceMonth: string, dueDay: number | null | undefined): string {
  const [y, mo] = invoiceMonth.split('-').map(Number);
  const day = dueDay || 1;
  const lastDay = new Date(y, mo, 0).getDate();
  const safeDay = Math.min(day, lastDay);
  return `${y}-${String(mo).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

export function groupCreditCardInvoices(
  instances: TransactionInstance[],
  creditCardAccounts: CreditCardAccountLike[],
  options: GroupInvoicesOptions = {},
): InvoiceGroup[] {
  const { onlyConfirmed = false } = options;
  const cardsById = new Map(creditCardAccounts.map(c => [c.id, c]));

  const totals = new Map<string, number>(); // key: `${cardId}::${invoiceMonth}`
  // Fatura sem transferência de pagamento formal, mas cujos lançamentos já foram todos
  // marcados como pagos individualmente (usuário que paga item a item, em vez de um
  // "Pagamento Fatura" único), também deve contar como paga — sem isso, essa fatura
  // fica pendente/amarela pra sempre, mesmo com tudo já quitado.
  const hasUnpaidItem = new Map<string, boolean>();

  for (const t of instances) {
    if (!t.account_id || !cardsById.has(t.account_id)) continue;
    if (t.type !== 'expense' && t.type !== 'income') continue;
    if (!t.invoice_month) continue;
    if (onlyConfirmed && t.status !== 'paid') continue;

    const amount = Number(t.amount) || 0;
    const adjusted = t.type === 'expense' ? amount : -amount;
    const key = `${t.account_id}::${t.invoice_month}`;
    totals.set(key, (totals.get(key) || 0) + adjusted);
    if (t.status !== 'paid' && t.status !== 'cancelled') {
      hasUnpaidItem.set(key, true);
    }
  }

  const realTransfers = instances.filter(i => !i.isVirtual && i.type === 'transfer');

  const groups: InvoiceGroup[] = [];
  for (const [key, total] of totals.entries()) {
    const [cardId, invoiceMonth] = key.split('::');
    const card = cardsById.get(cardId);
    if (!card) continue;

    const billTransfer = realTransfers.find(
      t => t.destination_account_id === cardId && t.invoice_month === invoiceMonth,
    ) || null;

    groups.push({
      cardId,
      cardName: card.name,
      invoiceMonth,
      total,
      dueDate: resolveDueDate(invoiceMonth, card.due_day),
      invoicePaymentAccountId: card.invoice_payment_account_id || null,
      linkedAccountName: card.linkedAccountName || null,
      reconciled: !!billTransfer,
      billTransfer,
      isPaid: billTransfer?.status === 'paid' || !hasUnpaidItem.get(key),
    });
  }

  return groups;
}

/**
 * Constrói as linhas sintéticas de "Fatura X" para exibição em uma lista de lançamentos.
 *
 * Filtra pelo mês da DATA DE EXIBIÇÃO (finalDate), não pelo invoice_month nominal do grupo:
 * uma fatura reconciliada é exibida na data real do pagamento (billTransfer.date), que pode
 * cair num mês diferente do invoice_month (ex: fatura de junho paga em julho). A lista esconde
 * a transferência real (para não duplicar visualmente) usando a DATA da transação, então a
 * linha substituta precisa aparecer nesse mesmo mês — senão o valor da transferência some da
 * visualização sem nenhuma linha compensando, inflando o saldo acumulado exibido.
 */
export function buildInvoiceSummaryInstances(
  groups: InvoiceGroup[],
  targetMonth: string,
): TransactionInstance[] {
  return groups
    .filter(g => {
      const finalDate = g.billTransfer ? g.billTransfer.date : g.dueDate;
      return finalDate.substring(0, 7) === targetMonth;
    })
    .map(g => {
      const finalDate = g.billTransfer ? g.billTransfer.date : g.dueDate;
      // Quando já existe uma transferência real pagando a fatura, o valor exibido/descontado
      // TEM que ser o valor real da transferência (não o total recalculado dos lançamentos do
      // cartão) — senão, se algum lançamento for adicionado/editado nesse invoice_month depois
      // do fechamento, a linha da fatura passa a mostrar um valor diferente do que de fato saiu
      // da conta, e o saldo da lista diverge do saldo calculado por conta.
      const displayAmount = g.reconciled && g.billTransfer ? g.billTransfer.amount : g.total;
      return {
        id: `invoice-${g.cardId}-${g.invoiceMonth}`,
        type: 'expense' as const,
        amount: displayAmount,
        date: finalDate,
        description: `Fatura ${g.cardName}`,
        status: g.isPaid ? ('paid' as const) : ('pending' as const),
        account_id: g.cardId,
        instanceDate: finalDate,
        originalInstanceDate: finalDate,
        isVirtual: true,
        isInvoiceSummary: true,
        auto_confirm: g.billTransfer?.auto_confirm || false,
        invoiceData: {
          cardId: g.cardId,
          cardName: g.cardName,
          linkedAccountName: g.linkedAccountName,
          invoicePaymentAccountId: g.invoicePaymentAccountId,
          total: g.total,
        },
      } as unknown as TransactionInstance;
    });
}
