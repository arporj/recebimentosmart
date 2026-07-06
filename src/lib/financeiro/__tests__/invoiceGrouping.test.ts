import { describe, it, expect } from 'vitest';
import { groupCreditCardInvoices, buildInvoiceSummaryInstances } from '../invoiceGrouping';
import type { TransactionInstance } from '../instanceExpansion';

const card = { id: 'card-1', name: 'Cartão Teste', due_day: 10, invoice_payment_account_id: 'acc-1', linkedAccountName: 'Conta Corrente' };

function instance(overrides: Partial<TransactionInstance>): TransactionInstance {
  return {
    id: 'i-1',
    type: 'expense',
    amount: 100,
    date: '2026-07-05',
    status: 'pending',
    instanceDate: '2026-07-05',
    originalInstanceDate: '2026-07-05',
    isVirtual: false,
    account_id: 'card-1',
    invoice_month: '2026-07',
    ...overrides,
  } as TransactionInstance;
}

describe('groupCreditCardInvoices', () => {
  it('sums card expenses for the same invoice_month and marks it unreconciled when there is no real transfer', () => {
    const groups = groupCreditCardInvoices(
      [instance({ id: 'e1', amount: 300 }), instance({ id: 'e2', amount: 200 })],
      [card],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].total).toBe(500);
    expect(groups[0].reconciled).toBe(false);
  });

  it('does not double count once a real transfer already pays the invoice', () => {
    const transfer = instance({
      id: 'transfer-1',
      type: 'transfer',
      account_id: 'acc-1',
      destination_account_id: 'card-1',
      amount: 500,
      status: 'paid',
      isVirtual: false,
    });
    const groups = groupCreditCardInvoices([instance({ amount: 500 }), transfer], [card]);
    expect(groups).toHaveLength(1);
    expect(groups[0].reconciled).toBe(true);
    expect(groups[0].isPaid).toBe(true);
  });

  it('folds an Acerto de Saldo income row into the same invoice group automatically', () => {
    const expense = instance({ id: 'e1', type: 'expense', amount: 500 });
    const acertoSaldo = instance({ id: 'acerto', type: 'income', amount: 50, description: 'Acerto de Saldo' });
    const groups = groupCreditCardInvoices([expense, acertoSaldo], [card]);
    expect(groups).toHaveLength(1);
    expect(groups[0].total).toBe(450); // 500 de despesa - 50 de credito do acerto
  });

  it('respects onlyConfirmed by excluding pending rows from the total', () => {
    const paid = instance({ id: 'paid', amount: 200, status: 'paid' });
    const pending = instance({ id: 'pending', amount: 300, status: 'pending' });
    const groups = groupCreditCardInvoices([paid, pending], [card], { onlyConfirmed: true });
    expect(groups[0].total).toBe(200);
  });
});

describe('buildInvoiceSummaryInstances', () => {
  it('builds one synthetic line per group for the requested month', () => {
    const groups = groupCreditCardInvoices([instance({ amount: 500 })], [card]);
    const lines = buildInvoiceSummaryInstances(groups, '2026-07');
    expect(lines).toHaveLength(1);
    expect(lines[0].isInvoiceSummary).toBe(true);
    expect(lines[0].amount).toBe(500);
  });
});
