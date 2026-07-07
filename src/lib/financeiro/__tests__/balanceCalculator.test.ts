import { describe, it, expect } from 'vitest';
import { computeAccountBalanceAsOf, computeRunningBalance } from '../balanceCalculator';
import { groupCreditCardInvoices, buildInvoiceSummaryInstances } from '../invoiceGrouping';
import type { TransactionInstance } from '../instanceExpansion';

const card = { id: 'card-1', name: 'Cartão Teste', due_day: 20, invoice_payment_account_id: 'acc-1', linkedAccountName: null };

function instance(overrides: Partial<TransactionInstance>): TransactionInstance {
  return {
    id: 'i',
    type: 'expense',
    amount: 0,
    date: '2026-07-01',
    status: 'pending',
    instanceDate: '2026-07-01',
    originalInstanceDate: '2026-07-01',
    isVirtual: false,
    ...overrides,
  } as TransactionInstance;
}

describe('computeAccountBalanceAsOf + computeRunningBalance invariant', () => {
  // Fixture: saldo inicial 1000, uma receita paga, uma despesa pendente, e uma fatura de
  // cartão vinculada ainda não paga (sem transferência real) — este é exatamente o cenário
  // que hoje diverge em produção entre o card de resumo e o saldo acumulado da lista.
  const income = instance({ id: 'income', type: 'income', amount: 500, date: '2026-07-05', instanceDate: '2026-07-05', status: 'paid', account_id: 'acc-1' });
  const expense = instance({ id: 'expense', type: 'expense', amount: 200, date: '2026-07-10', instanceDate: '2026-07-10', status: 'pending', account_id: 'acc-1' });
  const cardCharge = instance({
    id: 'card-charge', type: 'expense', amount: 300, date: '2026-07-08', instanceDate: '2026-07-08',
    account_id: 'card-1', invoice_month: '2026-07', status: 'pending',
  });

  const allInstances = [income, expense, cardCharge];
  const invoiceGroups = groupCreditCardInvoices(allInstances, [card]);

  it('the projected end-of-month balance deducts the unreconciled invoice exactly once', () => {
    const projected = computeAccountBalanceAsOf('acc-1', allInstances, invoiceGroups, 1000, {
      asOf: new Date('2026-07-31'),
      onlyConfirmed: false,
    });
    // 1000 + 500 (receita) - 200 (despesa) - 300 (fatura ainda nao paga) = 1000
    expect(projected).toBe(1000);
  });

  it('the confirmed balance ignores pending items and the unpaid invoice', () => {
    const confirmed = computeAccountBalanceAsOf('acc-1', allInstances, invoiceGroups, 1000, {
      asOf: new Date('2026-07-31'),
      onlyConfirmed: true,
    });
    // Só a receita paga entra: 1000 + 500 = 1500
    expect(confirmed).toBe(1500);
  });

  it('INVARIANT: the last point of computeRunningBalance matches computeAccountBalanceAsOf for the same asOf', () => {
    const invoiceLines = buildInvoiceSummaryInstances(invoiceGroups, '2026-07');
    const combined = [...allInstances.filter(i => i.account_id === 'acc-1' || i.destination_account_id === 'acc-1'), ...invoiceLines]
      .sort((a, b) => a.instanceDate.localeCompare(b.instanceDate));

    const openingBalance = computeAccountBalanceAsOf('acc-1', allInstances, invoiceGroups, 1000, {
      asOf: new Date('2026-06-30'),
      onlyConfirmed: false,
    });

    const withRunningBalance = computeRunningBalance(combined, openingBalance, new Set(['acc-1']));
    const lastBalance = withRunningBalance[withRunningBalance.length - 1].runningBalance;

    const projected = computeAccountBalanceAsOf('acc-1', allInstances, invoiceGroups, 1000, {
      asOf: new Date('2026-07-31'),
      onlyConfirmed: false,
    });

    expect(lastBalance).toBe(projected);
  });

  it('a synthetic isOverdueRollover row (lançamento atrasado empurrado pra hoje) never moves the running balance', () => {
    // Simula FinancialTransactionsV2.tsx: uma despesa de junho, ainda pendente, "empurrada"
    // visualmente pra hoje (mês corrente) só como alerta — seu valor já foi descontado do
    // saldo previsto de junho (openingBalance de julho), então contar de novo aqui duplicaria
    // o desconto. Ver overdueRolloverInstances / computeRunningBalance.
    const rolledOverdue = instance({
      id: 'june-overdue', type: 'expense', amount: 250, date: '2026-06-07',
      instanceDate: '2026-07-07', originalInstanceDate: '2026-06-07',
      isVirtual: true, isOverdueRollover: true, account_id: 'acc-1', status: 'pending',
    });

    const combinedWithRollover = [
      ...allInstances.filter(i => i.account_id === 'acc-1'),
      rolledOverdue,
    ].sort((a, b) => a.instanceDate.localeCompare(b.instanceDate));

    const combinedWithoutRollover = allInstances.filter(i => i.account_id === 'acc-1');

    const openingBalance = 1000;
    const withRollover = computeRunningBalance(combinedWithRollover, openingBalance, new Set(['acc-1']));
    const withoutRollover = computeRunningBalance(combinedWithoutRollover, openingBalance, new Set(['acc-1']));

    expect(withRollover[withRollover.length - 1].runningBalance).toBe(withoutRollover[withoutRollover.length - 1].runningBalance);

    const rolloverRow = withRollover.find(r => r.id === 'june-overdue')!;
    const precedingRow = withRollover[withRollover.indexOf(rolloverRow) - 1];
    expect(rolloverRow.runningBalance).toBe(precedingRow ? precedingRow.runningBalance : openingBalance);
  });
});
