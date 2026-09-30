import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../supabase', () => ({ supabase: { from: vi.fn() } }));

import { supabase } from '../../supabase';
import { editarTransacao } from '../editarTransacao';
import { deletarTransacao } from '../deletarTransacao';
import { createFakeSupabase, type Row } from './fakeSupabase';

function mother(): Row {
  return {
    id: 'A', series_id: 'A', parent_id: null, user_id: 'user-1', type: 'expense',
    description: 'Academia', amount: 100, date: '2026-06-10', status: 'pending',
    modalidade: 'recorrente', recurrence_enabled: true, recurrence_period: 'monthly',
    recurrence_interval: 1, recurrence_end_date: null, is_template: true,
    installment_current: 1, installment_total: 1, account_id: 'acc-1', category_id: 'cat-1',
  };
}

function child(id: string, date: string, status = 'pending'): Row {
  return { ...mother(), id, series_id: null, parent_id: 'A', date, status, recurrence_enabled: false, is_template: false };
}

describe('deletarTransacao — séries já divididas por edições anteriores', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 30, 12, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('"excluir este e os futuros" num mês anterior à divisão remove também a série criada por ela', async () => {
    const db = createFakeSupabase([
      mother(),
      child('ago', '2026-08-10', 'paid'),
      child('set', '2026-09-10'),
      child('out', '2026-10-10'),
      child('nov', '2026-11-10'),
    ]);
    (supabase.from as any).mockImplementation(db.from);

    // Divisão a partir de outubro (novo valor), depois exclusão a partir de setembro
    await editarTransacao('out', { amount: 120, date: '2026-10-10' }, 'following', { originalDate: '2026-10-10' });
    const { error } = await deletarTransacao({ transactionId: 'set', scope: 'following', instanceDate: '2026-09-10' });
    expect(error).toBeNull();

    // Nenhuma ocorrência física de setembro em diante e nenhuma mãe capaz de gerar virtuais depois do corte
    expect(db.rows.filter(r => !r.is_template && r.date >= '2026-09-10')).toEqual([]);
    const openMothers = db.rows.filter(r => r.is_template && (!r.recurrence_end_date || r.recurrence_end_date >= '2026-09-10'));
    expect(openMothers).toEqual([]);
    // Histórico anterior intacto
    expect(db.rows.find(r => r.id === 'ago')?.status).toBe('paid');
  });
});
