import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../supabase', () => ({ supabase: { from: vi.fn() } }));

import { supabase } from '../../supabase';
import { editarTransacao } from '../editarTransacao';
import { expandTransactionInstances } from '../instanceExpansion';
import { createFakeSupabase, type Row } from './fakeSupabase';

const USER = 'user-1';

function mother(overrides: Row = {}): Row {
  return {
    id: 'A',
    series_id: 'A',
    parent_id: null,
    user_id: USER,
    type: 'expense',
    description: 'Seguro Cartão (Inter)',
    amount: 1.9,
    date: '2026-06-28',
    status: 'pending',
    modalidade: 'recorrente',
    recurrence_enabled: true,
    recurrence_period: 'monthly',
    recurrence_interval: 1,
    recurrence_end_date: null,
    is_template: true,
    installment_current: 1,
    installment_total: 1,
    category_id: 'cat-1',
    account_id: 'acc-1',
    destination_account_id: null,
    client_id: null,
    invoice_month: null,
    card_holder_name: null,
    ...overrides,
  };
}

function child(id: string, date: string, overrides: Row = {}): Row {
  const base = mother();
  return {
    ...base,
    id,
    series_id: null,
    parent_id: 'A',
    date,
    recurrence_enabled: false,
    is_template: false,
    installment_current: Number(date.slice(5, 7)) - 5,
    ...overrides,
  };
}

/** Ocorrências que a tela de lançamentos mostraria em cada mês (mesma expansão da UI). */
function visibleByMonth(rows: Row[]) {
  const instances = expandTransactionInstances(
    rows.filter(r => !r.is_template) as any,
    rows.filter(r => r.is_template) as any,
    { horizonEnd: new Date(2027, 2, 31), today: new Date(2026, 8, 30) }
  );
  const byMonth: Record<string, Array<{ date: string; amount: number }>> = {};
  for (const i of instances) {
    const month = i.instanceDate.slice(0, 7);
    (byMonth[month] ||= []).push({ date: i.instanceDate, amount: Number(i.amount) });
  }
  return byMonth;
}

function useFakeDb(rows: Row[]) {
  const db = createFakeSupabase(rows);
  (supabase.from as any).mockImplementation(db.from);
  return db;
}

describe('editarTransacao — "este e os futuros" em recorrência', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 30, 12, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('duas edições seguidas da mesma ocorrência não deixam duas séries ativas (bug do Seguro Cartão, 2026-09-30)', async () => {
    const db = useFakeDb([
      mother({ status: 'paid' }),
      child('jun', '2026-06-28', { status: 'paid' }),
      child('jul', '2026-07-28', { status: 'paid' }),
      child('ago', '2026-08-28', { status: 'paid' }),
      child('set', '2026-09-28', { status: 'paid', amount: 3.9, is_customized: true }),
      child('out', '2026-10-28'),
      child('nov', '2026-11-28'),
      child('dez', '2026-12-28'),
    ]);

    // 1ª edição: setembro (pago), data 30/09, valor 3,90 → nova série no dia 30
    const r1 = await editarTransacao('set', { amount: 3.9, date: '2026-09-30', status: 'paid' }, 'following', { originalDate: '2026-09-28' });
    expect(r1.error).toBeNull();

    // 2ª edição: a mesma ocorrência de setembro (ainda da série antiga), de volta ao dia 28
    const r2 = await editarTransacao('set', { amount: 3.9, date: '2026-09-28', status: 'paid' }, 'following', { originalDate: '2026-09-28' });
    expect(r2.error).toBeNull();

    const byMonth = visibleByMonth(db.rows);
    for (const month of ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03']) {
      expect(byMonth[month], month).toEqual([{ date: `${month}-28`, amount: 3.9 }]);
    }
    expect(byMonth['2026-09']).toEqual([{ date: '2026-09-28', amount: 3.9 }]);

    // Só uma mãe da série segue aberta, e ela herdou o series_id original
    const openMothers = db.rows.filter(r => r.is_template && !r.recurrence_end_date);
    expect(openMothers).toHaveLength(1);
    expect(openMothers[0].series_id).toBe('A');
  });

  it('mover uma ocorrência não paga para frente (28 → 30) não deixa a do dia 28 no mesmo mês', async () => {
    const db = useFakeDb([
      mother(),
      child('set', '2026-09-28', { status: 'paid' }),
      child('out', '2026-10-28'),
      child('nov', '2026-11-28'),
    ]);

    const r = await editarTransacao('out', { amount: 5, date: '2026-10-30' }, 'following', { originalDate: '2026-10-28' });
    expect(r.error).toBeNull();

    const byMonth = visibleByMonth(db.rows);
    expect(byMonth['2026-09']).toEqual([{ date: '2026-09-28', amount: 1.9 }]);
    expect(byMonth['2026-10']).toEqual([{ date: '2026-10-30', amount: 5 }]);
    expect(byMonth['2026-11']).toEqual([{ date: '2026-11-30', amount: 5 }]);
  });

  it('mover uma ocorrência virtual para frente usa a data original para encerrar a série antiga', async () => {
    // Só a mãe e setembro físicos: outubro em diante são virtuais (id = id da mãe)
    const db = useFakeDb([
      mother(),
      child('set', '2026-09-28', { status: 'paid' }),
    ]);

    const r = await editarTransacao('A', { amount: 5, date: '2026-10-30' }, 'following', { originalDate: '2026-10-28' });
    expect(r.error).toBeNull();

    const byMonth = visibleByMonth(db.rows);
    expect(byMonth['2026-10']).toEqual([{ date: '2026-10-30', amount: 5 }]);
    expect(byMonth['2026-11']).toEqual([{ date: '2026-11-30', amount: 5 }]);
    expect(db.rows.find(r => r.id === 'A')?.recurrence_end_date).toBe('2026-10-27');
  });

  it('editar um mês anterior a uma divisão já feita encerra também a série criada por ela', async () => {
    const db = useFakeDb([
      mother(),
      child('set', '2026-09-28', { status: 'paid' }),
      child('out', '2026-10-28'),
      child('nov', '2026-11-28'),
      child('dez', '2026-12-28'),
    ]);

    // Divisão a partir de novembro (valor 5), depois nova edição a partir de outubro (valor 7)
    await editarTransacao('nov', { amount: 5, date: '2026-11-28' }, 'following', { originalDate: '2026-11-28' });
    await editarTransacao('out', { amount: 7, date: '2026-10-28' }, 'following', { originalDate: '2026-10-28' });

    const byMonth = visibleByMonth(db.rows);
    for (const month of ['2026-10', '2026-11', '2026-12', '2027-01']) {
      expect(byMonth[month], month).toEqual([{ date: `${month}-28`, amount: 7 }]);
    }
  });

  it('sem data original (chamadores antigos), ocorrência virtual futura corta a série na véspera da data editada', async () => {
    const db = useFakeDb([
      mother({ date: '2024-03-05', description: 'Simples Nacional', amount: 1500 }),
    ]);

    const r = await editarTransacao('A', { amount: 1200, date: '2026-11-05' }, 'following');
    expect(r.error).toBeNull();

    const old = db.rows.find(r => r.id === 'A');
    expect(old?.recurrence_end_date).toBe('2026-11-04');

    const newMother = db.rows.find(r => r.is_template && r.id !== 'A');
    expect(newMother?.date).toBe('2026-11-05');
    expect(newMother?.amount).toBe(1200);
    expect(newMother?.series_id).toBe('A');
  });

  it('mãe com status cru "paid" (virtual futura) ancora a nova série no ciclo seguinte à ocorrência, não à data-âncora', async () => {
    const db = useFakeDb([
      mother({ date: '2024-03-05', status: 'paid', amount: 1500 }),
    ]);

    await editarTransacao('A', { amount: 1200, date: '2026-11-05' }, 'following');

    expect(db.rows.find(r => r.id === 'A')?.recurrence_end_date).toBe('2026-11-05');
    const newMother = db.rows.find(r => r.is_template && r.id !== 'A');
    expect(newMother?.date).toBe('2026-12-05');
  });
});
