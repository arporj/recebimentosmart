import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

vi.mock('../../supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

import { supabase } from '../../supabase';
import { editarTransacao, numerarDescricaoParcela } from '../editarTransacao';
import { createPgliteDb, uid, type Row } from './pgliteSupabase';

const USER = uid('user-1');
const P = uid('P');
const A = uid('A');

// Parcelamento como o "Parcelamento Simples Nacional (ARRC)" de produção: a raiz é a
// parcela 33 (física, sem template) e as demais apontam para ela.
function parcela(n: number, date: string, overrides: Row = {}): Row {
  return {
    id: n === 33 ? P : uid(`p${n}`),
    parent_id: n === 33 ? null : P,
    user_id: USER,
    type: 'expense',
    description: `Simples Nacional (${n}/60)`,
    amount: 460,
    date,
    status: 'pending',
    paid_date: null,
    modalidade: 'parcelada',
    is_template: false,
    installment_current: n,
    installment_total: 60,
    account_id: uid('acc-1'),
    ...overrides,
  };
}

const PAGO = { status: 'paid', paid_date: '2026-09-14T00:00:00+00:00' };

function parcelamento(): Row[] {
  return [
    parcela(33, '2026-09-14', PAGO),
    parcela(34, '2026-10-14', PAGO),
    parcela(35, '2026-11-14'),
    parcela(36, '2026-12-14'),
  ];
}

function mother(overrides: Row = {}): Row {
  return {
    id: A,
    series_id: A,
    parent_id: null,
    user_id: USER,
    type: 'expense',
    description: 'Celular',
    amount: 50,
    date: '2026-07-28',
    status: 'pending',
    modalidade: 'recorrente',
    recurrence_enabled: true,
    recurrence_period: 'monthly',
    recurrence_interval: 1,
    is_template: true,
    installment_current: 1,
    installment_total: 1,
    account_id: uid('acc-1'),
    ...overrides,
  };
}

function child(label: string, date: string, overrides: Row = {}): Row {
  return {
    ...mother(),
    id: uid(label),
    series_id: null,
    parent_id: A,
    date,
    recurrence_enabled: false,
    is_template: false,
    installment_current: Number(date.slice(5, 7)) - 6,
    ...overrides,
  };
}

describe('pagar uma ocorrência não paga as outras da série', () => {
  let db: Awaited<ReturnType<typeof createPgliteDb>>;

  beforeAll(async () => {
    db = await createPgliteDb();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    (supabase.from as any).mockImplementation(db.supabase.from);
    (supabase.rpc as any).mockImplementation(db.supabase.rpc);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 18, 12, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const byId = async () => Object.fromEntries((await db.rows()).map(r => [r.id, r]));

  it('editar a parcela paga com "este e os futuros" e nova data não paga as futuras e mantém a numeração (bug de 2026-10-14)', async () => {
    await db.reset(parcelamento());

    const r = await editarTransacao(uid('p34'), {
      description: 'Simples Nacional (34/60)',
      amount: 468.08,
      date: '2026-10-15',
      status: 'paid',
      paid_date: '2026-10-15',
      installment_total: 60,
    }, 'following');
    expect(r.error).toBeNull();

    const rows = await byId();
    expect(rows[uid('p34')]).toMatchObject({ status: 'paid', description: 'Simples Nacional (34/60)' });
    for (const n of [35, 36]) {
      expect(rows[uid(`p${n}`)]).toMatchObject({
        status: 'pending',
        paid_date: null,
        amount: 468.08,
        description: `Simples Nacional (${n}/60)`,
      });
    }
    // Parcela anterior à editada não é tocada
    expect(rows[P]).toMatchObject({ amount: 460, description: 'Simples Nacional (33/60)' });
  });

  it('"este e os futuros" sem data (caminho de update em massa) também não paga as futuras', async () => {
    await db.reset(parcelamento());

    const r = await editarTransacao(uid('p35'), {
      description: 'Simples Nacional (35/60)',
      amount: 470,
      status: 'paid',
      paid_date: '2026-10-18',
    }, 'following');
    expect(r.error).toBeNull();

    const rows = await byId();
    expect(rows[uid('p35')]).toMatchObject({ status: 'paid', amount: 470 });
    expect(rows[uid('p36')]).toMatchObject({ status: 'pending', paid_date: null, amount: 470, description: 'Simples Nacional (36/60)' });
  });

  it('"todos" numa parcelada paga só a parcela editada e mantém o status das demais', async () => {
    await db.reset(parcelamento());

    const r = await editarTransacao(uid('p35'), {
      description: 'Simples Nacional (35/60)',
      amount: 460,
      status: 'paid',
      paid_date: '2026-10-18',
    }, 'all');
    expect(r.error).toBeNull();

    const rows = await byId();
    expect(rows[P]).toMatchObject({ status: 'paid', description: 'Simples Nacional (33/60)' });
    expect(rows[uid('p34')]).toMatchObject({ status: 'paid', description: 'Simples Nacional (34/60)' });
    expect(rows[uid('p35')]).toMatchObject({ status: 'paid', description: 'Simples Nacional (35/60)' });
    expect(rows[uid('p36')]).toMatchObject({ status: 'pending', paid_date: null, description: 'Simples Nacional (36/60)' });
  });

  it('"todos" numa recorrência paga só a ocorrência editada; mãe e futuras continuam pendentes', async () => {
    await db.reset([
      mother(),
      child('jul', '2026-07-28', PAGO),
      child('ago', '2026-08-28'),
      child('set', '2026-09-28'),
    ]);

    const r = await editarTransacao(uid('ago'), { description: 'Celular', amount: 55, status: 'paid', paid_date: '2026-10-18' }, 'all');
    expect(r.error).toBeNull();

    const rows = await byId();
    expect(rows[uid('ago')]).toMatchObject({ status: 'paid', amount: 55 });
    expect(rows[uid('set')]).toMatchObject({ status: 'pending', paid_date: null, amount: 55 });
    expect(rows[A]).toMatchObject({ status: 'pending', paid_date: null });
    expect(rows[uid('jul')]).toMatchObject({ status: 'paid' });
  });

  it('"este e os futuros" marcando como paga uma recorrência pendente: a ocorrência fica paga, a mãe nova e as futuras não', async () => {
    await db.reset([
      mother(),
      child('jul', '2026-07-28', PAGO),
      child('ago', '2026-08-28'),
    ]);

    const r = await editarTransacao(uid('ago'), { description: 'Celular', amount: 55, date: '2026-08-28', status: 'paid', paid_date: '2026-10-18' }, 'following', { originalDate: '2026-08-28' });
    expect(r.error).toBeNull();

    const rows = await db.rows();
    const novaMae = rows.find(x => x.is_template && x.id !== A)!;
    expect(novaMae).toMatchObject({ status: 'pending', paid_date: null });

    const daNovaSerie = rows.filter(x => x.parent_id === novaMae.id);
    expect(daNovaSerie.find(x => x.date === '2026-08-28')).toMatchObject({ status: 'paid', amount: 55 });
    const futuras = daNovaSerie.filter(x => x.date > '2026-08-28');
    expect(futuras.length).toBeGreaterThan(0);
    expect(futuras.every(x => x.status === 'pending')).toBe(true);
  });

  it('o banco nunca grava uma mãe (template) como paga', async () => {
    await db.reset([mother({ status: 'paid', paid_date: '2026-10-18T00:00:00+00:00' })]);
    expect((await byId())[A]).toMatchObject({ status: 'pending', paid_date: null });

    await db.pg.query(`UPDATE financial_transactions SET status = 'paid' WHERE id = $1`, [A]);
    expect((await byId())[A]).toMatchObject({ status: 'pending' });

    await db.pg.query(`UPDATE financial_transactions SET status = 'cancelled' WHERE id = $1`, [A]);
    expect((await byId())[A]).toMatchObject({ status: 'cancelled' });
  });
});

describe('numerarDescricaoParcela', () => {
  it('troca a numeração pela da parcela', () => {
    expect(numerarDescricaoParcela('Simples Nacional (ARRC) (32/60)', 47, 60)).toBe('Simples Nacional (ARRC) (47/60)');
  });

  it('troca só a última numeração, mesmo no meio do texto', () => {
    expect(numerarDescricaoParcela('Simples (30/60) - Teste', 36, 60)).toBe('Simples (36/60) - Teste');
    expect(numerarDescricaoParcela('Lote (1/2) (5/10)', 6, 10)).toBe('Lote (1/2) (6/10)');
  });

  it('sem numeração, mantém a descrição', () => {
    expect(numerarDescricaoParcela('Simples Nacional', 36, 60)).toBe('Simples Nacional');
  });
});
