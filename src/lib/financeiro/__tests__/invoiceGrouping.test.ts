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

  it('REGRESSION: uses the real transfer amount (not the recalculated card total) once the invoice is reconciled', () => {
    // Fatura fechada com Acerto de Saldo: a transferencia real paga R$450, mas depois um novo
    // lancamento de R$50 foi adicionado a esse invoice_month sem reabrir a fatura, fazendo o
    // total recalculado (500) divergir do que de fato saiu da conta (450). A linha exibida na
    // lista PRECISA usar o valor real da transferencia, senao o saldo da lista diverge do
    // saldo calculado por computeAccountBalanceAsOf (que sempre usa a transferencia real).
    const transfer = instance({
      id: 'transfer-1', type: 'transfer', account_id: 'acc-1', destination_account_id: 'card-1',
      amount: 450, status: 'paid', isVirtual: false,
    });
    const groups = groupCreditCardInvoices([instance({ amount: 500 }), transfer], [card]);
    const lines = buildInvoiceSummaryInstances(groups, '2026-07');
    expect(lines[0].amount).toBe(450);
  });

  it('REGRESSION: shows a reconciled invoice in the month of the real payment, not the nominal invoice_month', () => {
    // Fatura de JUNHO paga em JULHO (comum quando o usuario atrasa ou agenda o pagamento para
    // o mes seguinte). A transferencia real (datada em julho) e sempre escondida da lista para
    // nao duplicar visualmente — a linha substituta de fatura PRECISA aparecer em julho (mes da
    // data real), senao a deducao desaparece da visualizacao de julho e o saldo acumulado fica
    // inflado por exatamente o valor da fatura.
    const juneExpense = instance({ id: 'e1', amount: 500, date: '2026-06-05', instanceDate: '2026-06-05', invoice_month: '2026-06' });
    const julyTransfer = instance({
      id: 'transfer-1', type: 'transfer', account_id: 'acc-1', destination_account_id: 'card-1',
      amount: 500, status: 'paid', isVirtual: false,
      date: '2026-07-15', instanceDate: '2026-07-15', invoice_month: '2026-06',
    });
    const groups = groupCreditCardInvoices([juneExpense, julyTransfer], [card]);

    const juneLines = buildInvoiceSummaryInstances(groups, '2026-06');
    expect(juneLines).toHaveLength(0);

    const julyLines = buildInvoiceSummaryInstances(groups, '2026-07');
    expect(julyLines).toHaveLength(1);
    expect(julyLines[0].amount).toBe(500);
    expect(julyLines[0].instanceDate).toBe('2026-07-15');
  });
});
