// balanceCalculator — saldo de conta "a partir de uma data" (confirmado/projetado) e saldo
// acumulado (running balance) sobre uma lista de lançamentos já ordenada. Fonte única desta
// lógica, hoje duplicada em FinancialTransactionsV2.tsx (accountsData + displayInstances) e
// DashboardV2.tsx (cumulativeCashFlowData + balanceSheetData).

import { format } from 'date-fns';
import type { TransactionInstance } from './instanceExpansion';
import type { InvoiceGroup } from './invoiceGrouping';

export interface ComputeBalanceOptions {
  /** Data de corte (inclusive). */
  asOf: Date;
  /** true = considera apenas lançamentos com status 'paid'; false = inclui pendentes (projetado). */
  onlyConfirmed: boolean;
}

/**
 * Saldo de UMA conta (bancária/carteira) considerando todos os lançamentos com
 * instanceDate <= asOf, mais a dedução de faturas de cartão vinculadas a esta conta que
 * ainda não têm uma transferência real de pagamento (só se aplica ao saldo projetado).
 */
export function computeAccountBalanceAsOf(
  accountId: string,
  instances: TransactionInstance[],
  invoiceGroups: InvoiceGroup[],
  initialBalance: number,
  options: ComputeBalanceOptions,
): number {
  const asOfStr = format(options.asOf, 'yyyy-MM-dd');

  const accInstances = instances.filter(
    t =>
      (t.account_id === accountId || t.destination_account_id === accountId) &&
      t.instanceDate <= asOfStr &&
      (!options.onlyConfirmed || t.status === 'paid'),
  );

  let balance = accInstances.reduce((sum, t) => {
    const val = Number(t.amount) || 0;
    if (t.type === 'income') return sum + val;
    if (t.type === 'expense') return sum - val;
    if (t.type === 'transfer') {
      if (t.destination_account_id === accountId) return sum + val;
      if (t.account_id === accountId) return sum - val;
    }
    return sum;
  }, initialBalance);

  if (!options.onlyConfirmed) {
    const pendingDeduction = invoiceGroups
      .filter(g => g.invoicePaymentAccountId === accountId && !g.reconciled && g.dueDate <= asOfStr)
      .reduce((sum, g) => sum + g.total, 0);
    balance -= pendingDeduction;
  }

  return balance;
}

export interface RunningBalanceItem {
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  account_id?: string | null;
  destination_account_id?: string | null;
  isInvoiceSummary?: boolean;
  /**
   * Linha sintética que "empurra" visualmente pra hoje um lançamento pendente de um mês já
   * fechado (ver overdueRolloverInstances em FinancialTransactionsV2.tsx). O valor original já
   * foi descontado do saldo previsto do mês em que ele realmente venceu — contar de novo aqui
   * duplicaria o desconto. Serve só pra exibição/alerta, nunca afeta o saldo acumulado.
   */
  isOverdueRollover?: boolean;
}

/**
 * Percorre uma lista JÁ ordenada cronologicamente (podendo incluir linhas sintéticas de
 * fatura marcadas com isInvoiceSummary) e retorna o saldo acumulado após cada item.
 */
export function computeRunningBalance<T extends RunningBalanceItem>(
  items: T[],
  openingBalance: number,
  selectedAccountIds: Set<string>,
): Array<T & { runningBalance: number }> {
  let runningBalance = openingBalance;

  return items.map(t => {
    if (t.isOverdueRollover) {
      return { ...t, runningBalance };
    }
    if (t.isInvoiceSummary) {
      runningBalance -= t.amount;
    } else if (t.type === 'income') {
      runningBalance += t.amount;
    } else if (t.type === 'expense') {
      runningBalance -= t.amount;
    } else if (t.type === 'transfer') {
      const isOut = !!t.account_id && selectedAccountIds.has(t.account_id);
      const isIn = !!t.destination_account_id && selectedAccountIds.has(t.destination_account_id);
      if (isIn && !isOut) runningBalance += t.amount;
      else if (isOut && !isIn) runningBalance -= t.amount;
    }
    return { ...t, runningBalance };
  });
}

interface TodayRolloverItem extends RunningBalanceItem {
  instanceDate: string;
  status: string;
  account_type?: string;
  runningBalance?: number;
}

/**
 * Calcula o saldo acumulado na ORDEM CRONOLÓGICA REAL (`chronologicalItems`, já ordenados
 * pela data real de vencimento) e só DEPOIS "empurra" visualmente pra hoje qualquer lançamento
 * pendente/atrasado (exceto cartão de crédito, que usa a linha-resumo de fatura) — sem tocar
 * no saldo já fixado por linha no passo 1.
 *
 * Existe pra evitar repetir o bug que corrompeu o Resumo Mensal/saldo previsto 3x no histórico
 * deste projeto (ver overdueRollover.test.ts): mudar a data de exibição de uma linha E
 * recalcular o saldo na nova posição ao mesmo tempo. Aqui as duas coisas são passos separados —
 * mover onde a linha aparece nunca desloca quando o valor é de fato descontado/somado.
 *
 * `reminderItems` (ex.: overdueRolloverInstances de meses já fechados) nunca passam pelo
 * cálculo de saldo: herdam o saldo da linha anterior na ordem final (`finalSort`).
 */
export function computeRunningBalanceWithTodayRollover<T extends TodayRolloverItem>(
  chronologicalItems: T[],
  reminderItems: T[],
  openingBalance: number,
  selectedAccountIds: Set<string>,
  todayStr: string,
  finalSort: (a: T, b: T) => number,
): Array<T & { runningBalance: number }> {
  const withBalance = computeRunningBalance(chronologicalItems, openingBalance, selectedAccountIds);

  const withTodayOverride = withBalance.map(t => {
    if (
      t.status !== 'paid' &&
      t.status !== 'cancelled' &&
      t.instanceDate < todayStr &&
      t.account_type !== 'credit_card'
    ) {
      return { ...t, instanceDate: todayStr };
    }
    return t;
  });

  const combined = [...withTodayOverride, ...reminderItems].sort(finalSort);

  let lastBalance = openingBalance;
  return combined.map(t => {
    if (t.runningBalance !== undefined) {
      lastBalance = t.runningBalance;
      return t;
    }
    return { ...t, runningBalance: lastBalance };
  });
}
