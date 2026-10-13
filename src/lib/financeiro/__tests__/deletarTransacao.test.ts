import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

vi.mock('../../supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

import { supabase } from '../../supabase';
import { editarTransacao } from '../editarTransacao';
import { deletarTransacao } from '../deletarTransacao';
import { createPgliteDb, uid, type Row } from './pgliteSupabase';

const A = uid('A');

function mother(): Row {
  return {
    id: A, series_id: A, parent_id: null, user_id: uid('user-1'), type: 'expense',
    description: 'Academia', amount: 100, date: '2026-06-10', status: 'pending',
    modalidade: 'recorrente', recurrence_enabled: true, recurrence_period: 'monthly',
    recurrence_interval: 1, recurrence_end_date: null, is_template: true,
    installment_current: 1, installment_total: 1, account_id: uid('acc-1'), category_id: uid('cat-1'),
  };
}

function child(label: string, date: string, status = 'pending', overrides: Row = {}): Row {
  return {
    ...mother(), id: uid(label), series_id: null, parent_id: A, date, status,
    recurrence_enabled: false, is_template: false, ...overrides,
  };
}

describe('deletarTransacao — séries já divididas por edições anteriores', () => {
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

  it('"excluir este e os futuros" num mês anterior à divisão remove também a série criada por ela', async () => {
    await db.reset([
      mother(),
      child('ago', '2026-08-10', 'paid'),
      child('set', '2026-09-10'),
      child('out', '2026-10-10'),
      child('nov', '2026-11-10'),
    ]);

    // Divisão a partir de outubro (novo valor), depois exclusão a partir de setembro
    await editarTransacao(uid('out'), { amount: 120, date: '2026-10-10' }, 'following', { originalDate: '2026-10-10' });
    const { error } = await deletarTransacao({ transactionId: uid('set'), scope: 'following', instanceDate: '2026-09-10' });
    expect(error).toBeNull();

    const rows = await db.rows();
    // Nenhuma ocorrência física de setembro em diante e nenhuma mãe capaz de gerar virtuais depois do corte
    expect(rows.filter(r => !r.is_template && r.date >= '2026-09-10')).toEqual([]);
    const openMothers = rows.filter(r => r.is_template && (!r.recurrence_end_date || r.recurrence_end_date >= '2026-09-10'));
    expect(openMothers).toEqual([]);
    // Histórico anterior intacto
    expect(rows.find(r => r.id === uid('ago'))?.status).toBe('paid');
  });

  it('recorrência compartilhada: "excluir este e os futuros" cancela as ocorrências em vez de apagá-las', async () => {
    await db.reset([
      mother(),
      child('ago', '2026-08-10', 'paid', { shared_status: 'accepted' }),
      child('set', '2026-09-10', 'pending', { shared_status: 'accepted' }),
      child('out', '2026-10-10', 'pending', { shared_status: 'accepted' }),
    ]);

    const { error } = await deletarTransacao({ transactionId: uid('set'), scope: 'following', instanceDate: '2026-09-10' });
    expect(error).toBeNull();

    const rows = await db.rows();
    expect(rows.filter(r => !r.is_template).map(r => [r.date, r.status, r.shared_status])).toEqual([
      ['2026-08-10', 'paid', 'accepted'],
      ['2026-09-10', 'cancelled', 'modified'],
      ['2026-10-10', 'cancelled', 'modified'],
    ]);
    expect(rows.find(r => r.id === A)?.recurrence_end_date).toBe('2026-09-09');
  });
});
