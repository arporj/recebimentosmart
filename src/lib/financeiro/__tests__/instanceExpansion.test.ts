import { describe, it, expect } from 'vitest';
import { expandTransactionInstances, type RawFinancialTransaction } from '../instanceExpansion';

function tx(overrides: Partial<RawFinancialTransaction>): RawFinancialTransaction {
  return {
    id: 'tx-1',
    type: 'expense',
    amount: 100,
    date: '2026-07-10',
    status: 'pending',
    ...overrides,
  };
}

describe('expandTransactionInstances', () => {
  it('excludes cancelled transactions', () => {
    const instances = expandTransactionInstances(
      [tx({ id: 'a', status: 'cancelled' })],
      [],
      { horizonEnd: new Date('2026-07-31') },
    );
    expect(instances).toHaveLength(0);
  });

  it('projects one virtual instance per month from a recurring template, skipping months with a physical override', () => {
    const template = tx({
      id: 'parent-1',
      date: '2026-06-10',
      recurrence_enabled: true,
      recurrence_period: 'monthly',
      recurrence_interval: 1,
      status: 'pending',
    });
    // Julho já foi lançado fisicamente com um valor diferente (editado pelo usuário)
    const physicalJuly = tx({ id: 'child-july', parent_id: 'parent-1', date: '2026-07-10', amount: 150 });

    const instances = expandTransactionInstances(
      [physicalJuly],
      [template],
      { horizonEnd: new Date('2026-08-31') },
    );

    const julyInstances = instances.filter(i => i.instanceDate.startsWith('2026-07'));
    const augustInstances = instances.filter(i => i.instanceDate.startsWith('2026-08'));

    expect(julyInstances).toHaveLength(1);
    expect(julyInstances[0].amount).toBe(150);
    expect(julyInstances[0].isVirtual).toBe(false);

    expect(augustInstances).toHaveLength(1);
    expect(augustInstances[0].isVirtual).toBe(true);
  });

  it('rolls over unpaid past transactions to today only when rollOverUnpaidToToday is true', () => {
    const overdue = tx({ id: 'overdue', date: '2026-01-05', status: 'pending' });
    const today = new Date('2026-07-06');

    const withoutRollover = expandTransactionInstances([overdue], [], {
      horizonEnd: new Date('2026-07-31'),
      today,
    });
    expect(withoutRollover[0].instanceDate).toBe('2026-01-05');

    const withRollover = expandTransactionInstances([overdue], [], {
      horizonEnd: new Date('2026-07-31'),
      today,
      rollOverUnpaidToToday: true,
    });
    expect(withRollover[0].instanceDate).toBe('2026-07-06');
  });

  it('does not roll over credit card charges even when rollOverUnpaidToToday is true', () => {
    const overdueCardCharge = tx({ id: 'card-charge', date: '2026-01-05', status: 'pending', account_type: 'credit_card' });
    const instances = expandTransactionInstances([overdueCardCharge], [], {
      horizonEnd: new Date('2026-07-31'),
      today: new Date('2026-07-06'),
      rollOverUnpaidToToday: true,
    });
    expect(instances[0].instanceDate).toBe('2026-01-05');
  });

  it('forces credit card charges to paid only when treatCreditCardChargesAsPaid is true', () => {
    const cardCharge = tx({ id: 'card-charge', status: 'pending', account_type: 'credit_card' });

    const normal = expandTransactionInstances([cardCharge], [], { horizonEnd: new Date('2026-07-31') });
    expect(normal[0].status).toBe('pending');

    const forced = expandTransactionInstances([cardCharge], [], {
      horizonEnd: new Date('2026-07-31'),
      treatCreditCardChargesAsPaid: true,
    });
    expect(forced[0].status).toBe('paid');
  });
});
