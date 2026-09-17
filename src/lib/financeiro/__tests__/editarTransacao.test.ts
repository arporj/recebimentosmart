import { describe, it, expect, vi, beforeEach } from 'vitest';

// gerarInstanciasRecorrentes dispara sua própria sequência de chamadas ao Supabase
// (materialização das ocorrências futuras). Não é o alvo deste teste — mockamos só
// essa função, mantendo addPeriod/defaultRecurrenceHorizon reais.
vi.mock('../recorrenciaUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../recorrenciaUtils')>();
  return { ...actual, gerarInstanciasRecorrentes: vi.fn().mockResolvedValue(undefined) };
});

vi.mock('../../supabase', () => ({ supabase: { from: vi.fn() } }));

import { supabase } from '../../supabase';
import { editarTransacao } from '../editarTransacao';

interface RecordedCall {
  table: string;
  op?: 'update' | 'delete' | 'insert';
  payload?: any;
  filters: Array<[string, ...any[]]>;
}

/**
 * Fake mínimo do query builder do Supabase: registra tabela, operação, payload e
 * filtros de cada chamada, e resolve cada `await supabase.from(...)` com a próxima
 * resposta do script, na ordem em que o código realmente as dispara (sequencial,
 * sem Promise.all neste trecho).
 */
function mockSupabaseSequence(script: Array<{ data?: any; error?: any }>) {
  const calls: RecordedCall[] = [];
  let i = 0;

  (supabase.from as any).mockImplementation((table: string) => {
    const call: RecordedCall = { table, filters: [] };
    calls.push(call);
    const builder: any = {
      select() { return builder; },
      update(payload: any) { call.op = 'update'; call.payload = payload; return builder; },
      delete() { call.op = 'delete'; return builder; },
      insert(payload: any) { call.op = 'insert'; call.payload = payload; return builder; },
      eq(col: string, val: any) { call.filters.push(['eq', col, val]); return builder; },
      gt(col: string, val: any) { call.filters.push(['gt', col, val]); return builder; },
      gte(col: string, val: any) { call.filters.push(['gte', col, val]); return builder; },
      neq(col: string, val: any) { call.filters.push(['neq', col, val]); return builder; },
      or(expr: string) { call.filters.push(['or', expr]); return builder; },
      single() { return builder; },
      then(resolve: any, reject: any) {
        const res = script[i++] ?? { data: null, error: null };
        Promise.resolve(res).then(resolve, reject);
      },
    };
    return builder;
  });

  return calls;
}

// Template de uma recorrência mensal "Simples Nacional" criada em 2024, sem tags,
// sem cartão. `date` aqui é a data-âncora original da série — nunca a da ocorrência
// que está sendo editada quando o id passado é o do próprio template (caso de
// edição de uma ocorrência virtual futura, ver instanceExpansion.ts).
function baseTemplate(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 'template-1',
    parent_id: null,
    user_id: 'user-1',
    type: 'expense',
    description: 'Simples Nacional',
    amount: 1500,
    date: '2024-03-05',
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
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  };
}

describe('editarTransacao — scope "following" em recorrência (edição de ocorrência virtual futura)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fecha a série antiga na data da ocorrência editada, não na data-âncora do template (ocorrência não paga)', async () => {
    const current = baseTemplate({ status: 'pending' });

    const calls = mockSupabaseSequence([
      { data: current, error: null }, // 1. busca a transação (pelo id do template, por ser instância virtual)
      { error: null }, // 2. update recurrence_end_date na mãe antiga
      { error: null }, // 3. delete das filhas físicas futuras da mãe antiga
      { data: { ...current, id: 'nova-mae-1' }, error: null }, // 4. insert da nova mãe
      { data: { id: 'novo-filho-1' }, error: null }, // 5. insert do primeiro filho físico
    ]);

    // Usuário edita a ocorrência de novembro/2026 (virtual, id = id do template) de 1500 para 1200.
    const result = await editarTransacao(
      'template-1',
      { amount: 1200, date: '2026-11-05' },
      'following'
    );

    expect(result.error).toBeNull();

    const updateEndDateCall = calls.find(c => c.op === 'update');
    const deleteChildrenCall = calls.find(c => c.op === 'delete');
    const insertNewMotherCall = calls.find(c => c.op === 'insert');

    // A mãe antiga deve ser encerrada em 2026-11-04 (véspera da ocorrência editada),
    // nunca em 2024-03-04 (véspera da data-âncora original do template) — esse era o bug.
    expect(updateEndDateCall?.payload).toEqual({ recurrence_end_date: '2026-11-04' });

    // O corte das filhas físicas futuras da mãe antiga deve usar a data da ocorrência
    // editada (2026-11-05), não a data-âncora do template (2024-03-05).
    expect(deleteChildrenCall?.filters).toContainEqual(['gte', 'date', '2026-11-05']);

    // A nova mãe deve começar na própria ocorrência editada.
    expect(insertNewMotherCall?.payload.date).toBe('2026-11-05');
    expect(insertNewMotherCall?.payload.amount).toBe(1200);
  });

  it('não apaga a mãe antiga inteira quando ela ainda tem histórico válido antes da ocorrência editada', async () => {
    const current = baseTemplate({ status: 'pending' });

    const calls = mockSupabaseSequence([
      { data: current, error: null },
      { error: null },
      { error: null },
      { data: { ...current, id: 'nova-mae-1' }, error: null },
      { data: { id: 'novo-filho-1' }, error: null },
    ]);

    await editarTransacao('template-1', { amount: 1200, date: '2026-11-05' }, 'following');

    // A mãe antiga (2024-03-05) segue válida até 2026-11-04: não deve haver um delete
    // pelo id do template em si (só o delete das filhas futuras).
    const deleteOldMotherCall = calls.find(c => c.op === 'delete' && c.filters.some(f => f[1] === 'id'));
    expect(deleteOldMotherCall).toBeUndefined();
  });

  it('ancora a próxima mãe no ciclo seguinte à ocorrência editada, não ao ciclo seguinte à data-âncora do template (ocorrência já paga)', async () => {
    // Cenário real do bug: o template guarda seu próprio status "cru" (aqui, 'paid',
    // herdado da criação) mesmo representando uma ocorrência virtual futura que nunca
    // foi de fato paga — ver mudarModalidade.ts, mesmo aviso.
    const current = baseTemplate({ status: 'paid' });

    const calls = mockSupabaseSequence([
      { data: current, error: null },
      { error: null },
      { error: null },
      { data: { ...current, id: 'nova-mae-1' }, error: null },
      { data: { id: 'novo-filho-1' }, error: null },
    ]);

    await editarTransacao('template-1', { amount: 1200, date: '2026-11-05' }, 'following');

    const updateEndDateCall = calls.find(c => c.op === 'update');
    const insertNewMotherCall = calls.find(c => c.op === 'insert');

    // Mãe antiga encerra na própria ocorrência editada (2026-11-05), não em 2024-03-05.
    expect(updateEndDateCall?.payload).toEqual({ recurrence_end_date: '2026-11-05' });

    // Nova mãe começa no ciclo seguinte a NOVEMBRO (2026-12-05) — não no ciclo seguinte
    // à data-âncora original do template (o que daria 2024-04-05, uma data absurda que
    // faz a nova série de R$1200 se sobrepor a anos de lançamentos antigos de R$1500).
    expect(insertNewMotherCall?.payload.date).toBe('2026-12-05');
  });
});
