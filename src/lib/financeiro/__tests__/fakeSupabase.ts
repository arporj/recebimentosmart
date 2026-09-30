/**
 * Banco em memória mínimo para testes de lib/financeiro: implementa só o subconjunto
 * do query builder do Supabase usado por editarTransacao/deletarTransacao/
 * serieRecorrente/gerarInstanciasRecorrentes, aplicando os filtros de verdade — assim
 * os testes verificam o estado final das séries (o que o usuário vê), não a ordem das
 * chamadas.
 *
 * Emula também o comportamento relevante do banco real:
 * - trigger set_default_series_id (mãe nova sem series_id inicia a própria série);
 * - FK parent_id ON DELETE SET NULL.
 */
export type Row = Record<string, any>;

export function createFakeSupabase(initialRows: Row[]) {
  const rows: Row[] = initialRows.map(r => ({ ...r }));
  let seq = 0;

  function from(table: string) {
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: any = null;
    let single = false;
    let head = false;
    const filters: Array<(r: Row) => boolean> = [];

    const exec = () => {
      // Tabelas auxiliares (ex.: transaction_tags) não importam para estes cenários
      if (table !== 'financial_transactions') return { data: null, error: null };

      if (op === 'insert') {
        const list = Array.isArray(payload) ? payload : [payload];
        const inserted = list.map((p: Row) => {
          const row: Row = { id: `new-${++seq}`, parent_id: null, series_id: null, recurrence_end_date: null, ...p };
          if (row.series_id == null && row.parent_id == null && row.is_template === true) row.series_id = row.id;
          rows.push(row);
          return { ...row };
        });
        return { data: single ? inserted[0] : inserted, error: null };
      }

      const matched = rows.filter(r => filters.every(f => f(r)));

      if (op === 'update') {
        matched.forEach(r => Object.assign(r, payload));
        return { data: single ? matched[0] ?? null : matched.map(r => ({ ...r })), error: null };
      }

      if (op === 'delete') {
        const ids = new Set(matched.map(r => r.id));
        for (let i = rows.length - 1; i >= 0; i--) if (ids.has(rows[i].id)) rows.splice(i, 1);
        rows.forEach(r => { if (ids.has(r.parent_id)) r.parent_id = null; });
        return { data: matched, error: null };
      }

      if (head) return { data: null, count: matched.length, error: null };
      if (single) {
        return matched[0]
          ? { data: { ...matched[0] }, error: null }
          : { data: null, error: { message: 'not found' } };
      }
      return { data: matched.map(r => ({ ...r })), error: null };
    };

    const builder: any = {
      select(_cols?: string, opts?: { count?: string; head?: boolean }) {
        if (opts?.head) head = true;
        return builder;
      },
      insert(p: any) { op = 'insert'; payload = p; return builder; },
      update(p: any) { op = 'update'; payload = p; return builder; },
      delete() { op = 'delete'; return builder; },
      eq(c: string, v: any) { filters.push(r => r[c] === v); return builder; },
      neq(c: string, v: any) { filters.push(r => r[c] != null && r[c] !== v); return builder; },
      gt(c: string, v: any) { filters.push(r => r[c] > v); return builder; },
      gte(c: string, v: any) { filters.push(r => r[c] >= v); return builder; },
      lt(c: string, v: any) { filters.push(r => r[c] < v); return builder; },
      lte(c: string, v: any) { filters.push(r => r[c] <= v); return builder; },
      is(c: string, v: any) { filters.push(r => (r[c] ?? null) === v); return builder; },
      in(c: string, vs: any[]) { filters.push(r => vs.includes(r[c])); return builder; },
      or(expr: string) {
        // Suporta só o formato usado no código: "col.eq.valor,col2.eq.valor2"
        const conds = expr.split(',').map(part => {
          const [col, operator, ...rest] = part.split('.');
          if (operator !== 'eq') throw new Error(`fakeSupabase: operador não suportado em or(): ${operator}`);
          return { col, value: rest.join('.') };
        });
        filters.push(r => conds.some(c => String(r[c.col]) === c.value));
        return builder;
      },
      single() { single = true; return builder; },
      then(resolve: any, reject: any) {
        try { resolve(exec()); } catch (e) { reject(e); }
      },
    };
    return builder;
  }

  return { from, rows };
}
