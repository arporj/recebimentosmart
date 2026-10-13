import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

vi.mock('../../supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

import { supabase } from '../../supabase';
import { editarTransacao } from '../editarTransacao';
import { expandTransactionInstances } from '../instanceExpansion';
import { createPgliteDb, uid, type Row } from './pgliteSupabase';

const USER = uid('user-1');
const A = uid('A');

function mother(overrides: Row = {}): Row {
  return {
    id: A,
    series_id: A,
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
    category_id: uid('cat-1'),
    account_id: uid('acc-1'),
    destination_account_id: null,
    client_id: null,
    invoice_month: null,
    card_holder_name: null,
    ...overrides,
  };
}

function child(label: string, date: string, overrides: Row = {}): Row {
  const base = mother();
  return {
    ...base,
    id: uid(label),
    series_id: null,
    parent_id: A,
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

describe('editarTransacao — "este e os futuros" em recorrência', () => {
  let db: Awaited<ReturnType<typeof createPgliteDb>>;

  beforeAll(async () => {
    db = await createPgliteDb();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    (supabase.from as any).mockImplementation(db.supabase.from);
    (supabase.rpc as any).mockImplementation(db.supabase.rpc);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 30, 12, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('duas edições seguidas da mesma ocorrência não deixam duas séries ativas (bug do Seguro Cartão, 2026-09-30)', async () => {
    await db.reset([
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
    const r1 = await editarTransacao(uid('set'), { amount: 3.9, date: '2026-09-30', status: 'paid' }, 'following', { originalDate: '2026-09-28' });
    expect(r1.error).toBeNull();

    // 2ª edição: a mesma ocorrência de setembro (ainda da série antiga, agora em 30/09), de volta ao dia 28
    const r2 = await editarTransacao(uid('set'), { amount: 3.9, date: '2026-09-28', status: 'paid' }, 'following', { originalDate: '2026-09-30' });
    expect(r2.error).toBeNull();

    const rows = await db.rows();
    const byMonth = visibleByMonth(rows);
    for (const month of ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03']) {
      expect(byMonth[month], month).toEqual([{ date: `${month}-28`, amount: 3.9 }]);
    }
    expect(byMonth['2026-09']).toEqual([{ date: '2026-09-28', amount: 3.9 }]);

    // Só uma mãe da série segue aberta, e ela herdou o series_id original
    const openMothers = rows.filter(r => r.is_template && !r.recurrence_end_date);
    expect(openMothers).toHaveLength(1);
    expect(openMothers[0].series_id).toBe(A);
  });

  it('mover uma ocorrência não paga para frente (28 → 30) não deixa a do dia 28 no mesmo mês', async () => {
    await db.reset([
      mother(),
      child('set', '2026-09-28', { status: 'paid' }),
      child('out', '2026-10-28'),
      child('nov', '2026-11-28'),
    ]);

    const r = await editarTransacao(uid('out'), { amount: 5, date: '2026-10-30' }, 'following', { originalDate: '2026-10-28' });
    expect(r.error).toBeNull();

    const byMonth = visibleByMonth(await db.rows());
    expect(byMonth['2026-09']).toEqual([{ date: '2026-09-28', amount: 1.9 }]);
    expect(byMonth['2026-10']).toEqual([{ date: '2026-10-30', amount: 5 }]);
    expect(byMonth['2026-11']).toEqual([{ date: '2026-11-30', amount: 5 }]);
  });

  it('mover uma ocorrência virtual para frente usa a data original para encerrar a série antiga', async () => {
    // Só a mãe e setembro físicos: outubro em diante são virtuais (id = id da mãe)
    await db.reset([
      mother(),
      child('set', '2026-09-28', { status: 'paid' }),
    ]);

    const r = await editarTransacao(A, { amount: 5, date: '2026-10-30' }, 'following', { originalDate: '2026-10-28' });
    expect(r.error).toBeNull();

    const rows = await db.rows();
    const byMonth = visibleByMonth(rows);
    expect(byMonth['2026-10']).toEqual([{ date: '2026-10-30', amount: 5 }]);
    expect(byMonth['2026-11']).toEqual([{ date: '2026-11-30', amount: 5 }]);
    expect(rows.find(r => r.id === A)?.recurrence_end_date).toBe('2026-10-27');
  });

  it('editar um mês anterior a uma divisão já feita encerra também a série criada por ela', async () => {
    await db.reset([
      mother(),
      child('set', '2026-09-28', { status: 'paid' }),
      child('out', '2026-10-28'),
      child('nov', '2026-11-28'),
      child('dez', '2026-12-28'),
    ]);

    // Divisão a partir de novembro (valor 5), depois nova edição a partir de outubro (valor 7)
    await editarTransacao(uid('nov'), { amount: 5, date: '2026-11-28' }, 'following', { originalDate: '2026-11-28' });
    await editarTransacao(uid('out'), { amount: 7, date: '2026-10-28' }, 'following', { originalDate: '2026-10-28' });

    const byMonth = visibleByMonth(await db.rows());
    for (const month of ['2026-10', '2026-11', '2026-12', '2027-01']) {
      expect(byMonth[month], month).toEqual([{ date: `${month}-28`, amount: 7 }]);
    }
  });

  it('sem data original (chamadores antigos), ocorrência virtual futura corta a série na véspera da data editada', async () => {
    await db.reset([
      mother({ date: '2024-03-05', description: 'Simples Nacional', amount: 1500 }),
    ]);

    const r = await editarTransacao(A, { amount: 1200, date: '2026-11-05' }, 'following');
    expect(r.error).toBeNull();

    const rows = await db.rows();
    const old = rows.find(r => r.id === A);
    expect(old?.recurrence_end_date).toBe('2026-11-04');

    const newMother = rows.find(r => r.is_template && r.id !== A);
    expect(newMother?.date).toBe('2026-11-05');
    expect(newMother?.amount).toBe(1200);
    expect(newMother?.series_id).toBe(A);
  });

  it('ocorrência virtual nunca é tratada como paga, mesmo com a mãe com status cru "paid": o mês editado recebe o novo valor', async () => {
    await db.reset([
      mother({ date: '2024-03-05', status: 'paid', amount: 1500 }),
    ]);

    await editarTransacao(A, { amount: 1200, date: '2026-11-05' }, 'following', { originalDate: '2026-11-05' });

    const rows = await db.rows();
    expect(rows.find(r => r.id === A)?.recurrence_end_date).toBe('2026-11-04');
    const newMother = rows.find(r => r.is_template && r.id !== A);
    expect(newMother?.date).toBe('2026-11-05');
    expect(visibleByMonth(rows)['2026-11']).toEqual([{ date: '2026-11-05', amount: 1200 }]);
  });

  it('ocorrência já paga também é editada ("ESTE" e os futuros) e continua uma só no mês', async () => {
    await db.reset([
      mother(),
      child('ago', '2026-08-28', { status: 'paid' }),
      child('set', '2026-09-28', { status: 'paid' }),
      child('out', '2026-10-28'),
    ]);

    const r = await editarTransacao(uid('set'), { amount: 3.9, date: '2026-09-28', status: 'paid' }, 'following', { originalDate: '2026-09-28' });
    expect(r.error).toBeNull();

    const rows = await db.rows();
    const byMonth = visibleByMonth(rows);
    expect(byMonth['2026-08']).toEqual([{ date: '2026-08-28', amount: 1.9 }]);
    expect(byMonth['2026-09']).toEqual([{ date: '2026-09-28', amount: 3.9 }]);
    expect(byMonth['2026-10']).toEqual([{ date: '2026-10-28', amount: 3.9 }]);
    expect(rows.find(r => r.id === uid('set'))?.status).toBe('paid');
  });

  it('ocorrência paga lançada no mês seguinte (set pago em 02/10) não faz a série pular outubro', async () => {
    await db.reset([
      mother(),
      child('set', '2026-09-28', { status: 'paid' }),
      child('out', '2026-10-28'),
    ]);

    await editarTransacao(uid('set'), { amount: 3.9, date: '2026-10-02', status: 'paid' }, 'following', { originalDate: '2026-09-28' });

    const byMonth = visibleByMonth(await db.rows());
    // Setembro (pago em 02/10) + a própria ocorrência de outubro da nova série
    expect(byMonth['2026-10']).toEqual([
      { date: '2026-10-02', amount: 3.9 },
      { date: '2026-10-02', amount: 3.9 },
    ]);
    expect(byMonth['2026-11']).toEqual([{ date: '2026-11-02', amount: 3.9 }]);
  });

  it('falha no meio da divisão não apaga nada: a série antiga fica exatamente como estava', async () => {
    await db.reset([
      mother(),
      child('set', '2026-09-28', { status: 'paid' }),
      child('out', '2026-10-28'),
      child('nov', '2026-11-28'),
    ]);
    const before = await db.rows();

    // Status inválido só é rejeitado no INSERT da nova mãe — depois de a série antiga já
    // ter sido encerrada e as ocorrências futuras apagadas dentro da mesma transação.
    const r = await editarTransacao(uid('out'), { amount: 5, date: '2026-10-30', status: 'invalido' }, 'following', { originalDate: '2026-10-28' });
    expect(r.error).not.toBeNull();

    expect(await db.rows()).toEqual(before);
  });

  it('tags novas vão para a nova mãe e todas as ocorrências criadas', async () => {
    await db.reset([
      mother(),
      child('out', '2026-10-28'),
    ]);
    const tag = uid('tag-1');

    await editarTransacao(uid('out'), { amount: 5, date: '2026-10-30', tags: [tag] }, 'following', { originalDate: '2026-10-28' });

    const rows = await db.rows();
    const newMother = rows.find(r => r.is_template && r.id !== A)!;
    const newSeries = rows.filter(r => r.id === newMother.id || r.parent_id === newMother.id).map(r => r.id).sort();
    const tagged = (await db.tags()).filter(t => t.tag_id === tag).map(t => t.transaction_id).sort();
    expect(tagged).toEqual(newSeries);
  });

  it('dia 31 respeita o fim de cada mês nas ocorrências físicas geradas', async () => {
    // O PGlite usa o relógio do processo, então CURRENT_DATE no SQL segue o
    // vi.setSystemTime: horizonte de geração = 13/10/2026 + 3 meses = 13/01/2027.
    vi.setSystemTime(new Date(2026, 9, 13, 12, 0, 0));
    await db.reset([
      mother(),
      child('out', '2026-10-28'),
    ]);

    await editarTransacao(uid('out'), { amount: 5, date: '2026-10-31' }, 'following', { originalDate: '2026-10-28' });

    const rows = await db.rows();
    const newMother = rows.find(r => r.is_template && r.id !== A)!;
    const generated = rows.filter(r => r.parent_id === newMother.id).map(r => r.date);
    // Cada data é calculada a partir do início da série, não da ocorrência anterior
    // (31/10 → 30/11 → 31/12, nunca 30/12).
    expect(generated).toEqual(['2026-10-31', '2026-11-30', '2026-12-31']);
  });
});
