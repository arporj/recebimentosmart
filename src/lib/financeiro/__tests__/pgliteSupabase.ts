/**
 * Postgres real em memória (PGlite) para testes de lib/financeiro.
 *
 * A divisão/encerramento de séries recorrentes roda em funções plpgsql
 * (supabase/migrations/20261013180000_atomic_recurring_series_split.sql), então os
 * testes precisam de um Postgres de verdade — nunca o banco de produção. O esquema de
 * financial_transactions espelha o de produção, e as funções/triggers relevantes são
 * carregados das próprias migrations do repositório (não de cópias), para que o teste
 * quebre se a migration mudar.
 *
 * Expõe um `supabase` mínimo: só o subconjunto do query builder que editarTransacao/
 * deletarTransacao usam nos fluxos "este e os futuros" (select/update por id e rpc).
 * Qualquer outro uso lança erro em vez de responder errado em silêncio.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type Row = Record<string, any>;

const MIGRATIONS = resolve(__dirname, '../../../../supabase/migrations');

function fromMigration(file: string, pattern: RegExp): string {
  const sql = readFileSync(resolve(MIGRATIONS, file), 'utf8');
  const match = sql.match(pattern);
  if (!match) throw new Error(`pgliteSupabase: trecho não encontrado em ${file}`);
  return match[0];
}

const SCHEMA = `
  CREATE ROLE anon;
  CREATE ROLE authenticated;
  CREATE TABLE client_shares (client_id uuid, status text);
  CREATE TABLE financial_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    type text NOT NULL,
    amount numeric NOT NULL,
    date date NOT NULL,
    description text,
    client_id uuid,
    recurrence_enabled boolean DEFAULT false,
    recurrence_period text CHECK (recurrence_period IN ('daily', 'weekly', 'monthly', 'yearly') OR recurrence_period IS NULL),
    status text DEFAULT 'pending' CHECK (status = ANY (ARRAY['pending', 'paid', 'partial', 'cancelled'])),
    created_at timestamptz DEFAULT now(),
    recurrence_interval integer DEFAULT 1,
    account_id uuid,
    category_id uuid,
    paid_amount numeric,
    paid_date timestamptz,
    invoice_month text,
    card_holder_name text,
    installment_current integer DEFAULT 1,
    installment_total integer DEFAULT 1,
    destination_account_id uuid,
    auto_confirm boolean DEFAULT false,
    modalidade text DEFAULT 'unica',
    parent_id uuid REFERENCES financial_transactions(id) ON DELETE SET NULL,
    due_day integer,
    recurrence_end_date date,
    is_customized boolean DEFAULT false,
    shared_by_user_id uuid,
    shared_original_transaction_id uuid REFERENCES financial_transactions(id) ON DELETE SET NULL,
    shared_status text,
    is_template boolean DEFAULT false,
    series_id uuid
  );
  CREATE TABLE transaction_tags (
    transaction_id uuid NOT NULL REFERENCES financial_transactions(id) ON DELETE CASCADE,
    tag_id uuid NOT NULL,
    PRIMARY KEY (transaction_id, tag_id)
  );
`;

/** UUID determinístico para um rótulo legível de teste ('A', 'set', 'user-1'...). */
export function uid(label: string): string {
  const hex = Array.from(label).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('').padEnd(32, '0');
  if (hex.length > 32) throw new Error(`uid: rótulo longo demais: ${label}`);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export async function createPgliteDb() {
  const pg = new PGlite();
  await pg.exec(SCHEMA);
  await pg.exec(fromMigration(
    '20260710120000_replenish_recurring_occurrences_cron.sql',
    /CREATE OR REPLACE FUNCTION public\.fn_add_recurrence_period[\s\S]*?\n\$\$;/,
  ));
  await pg.exec(fromMigration(
    '20260930120000_add_series_id_recurring_segments.sql',
    /CREATE OR REPLACE FUNCTION public\.set_default_series_id[\s\S]*?EXECUTE FUNCTION public\.set_default_series_id\(\);/,
  ));
  await pg.exec(readFileSync(resolve(MIGRATIONS, '20260522210000_fix_shared_transaction_deletes.sql'), 'utf8'));
  await pg.exec(readFileSync(resolve(MIGRATIONS, '20261013180000_atomic_recurring_series_split.sql'), 'utf8'));

  async function reset(rows: Row[]) {
    await pg.exec('TRUNCATE transaction_tags, financial_transactions, client_shares');
    // Mães antes das filhas, por causa da FK parent_id
    const ordered = [...rows].sort((a, b) => Number(!!a.parent_id) - Number(!!b.parent_id));
    for (const row of ordered) {
      // Só as colunas informadas: as omitidas recebem o DEFAULT da coluna, como no banco real
      const columns = Object.keys(row).map(c => `"${c}"`).join(', ');
      await pg.query(
        `INSERT INTO financial_transactions (${columns})
         SELECT ${columns} FROM jsonb_populate_record(NULL::financial_transactions, $1)`,
        [row],
      );
    }
  }

  async function rows(): Promise<Row[]> {
    const { rows: result } = await pg.query<{ r: Row }>(
      'SELECT to_jsonb(t) AS r FROM financial_transactions t ORDER BY date, created_at',
    );
    return result.map(({ r }) => ({ ...r, amount: Number(r.amount) }));
  }

  async function tags(): Promise<Array<{ transaction_id: string; tag_id: string }>> {
    return (await pg.query<{ transaction_id: string; tag_id: string }>('SELECT * FROM transaction_tags')).rows;
  }

  function from(table: string) {
    if (table !== 'financial_transactions') throw new Error(`pgliteSupabase: tabela não suportada: ${table}`);
    let op: 'select' | 'update' = 'select';
    let columns = '*';
    let payload: Row = {};
    let id: string | null = null;
    let single = false;

    const exec = async () => {
      if (id === null) throw new Error('pgliteSupabase: só consultas filtradas por id são suportadas');
      try {
        if (op === 'update') {
          await pg.query(
            `UPDATE financial_transactions t SET ${Object.keys(payload).map(k => `"${k}" = r."${k}"`).join(', ')}
             FROM jsonb_populate_record(NULL::financial_transactions, $1) r WHERE t.id = $2`,
            [payload, id],
          );
          return { data: null, error: null };
        }
        const { rows: found } = await pg.query<{ r: Row }>(
          'SELECT to_jsonb(t) AS r FROM financial_transactions t WHERE id = $1', [id],
        );
        const data = found.map(({ r }) => {
          const row: Row = { ...r, amount: Number(r.amount) };
          return columns === '*' ? row : Object.fromEntries(columns.split(',').map(c => [c.trim(), row[c.trim()]]));
        });
        if (single) return data[0] ? { data: data[0], error: null } : { data: null, error: { message: 'not found' } };
        return { data, error: null };
      } catch (error) {
        return { data: null, error };
      }
    };

    const builder: any = {
      select(cols = '*') { columns = cols; return builder; },
      update(p: Row) { op = 'update'; payload = p; return builder; },
      eq(column: string, value: string) {
        if (column !== 'id') throw new Error(`pgliteSupabase: filtro não suportado: ${column}`);
        id = value;
        return builder;
      },
      single() { single = true; return builder; },
      then(onFulfilled: any, onRejected: any) { return exec().then(onFulfilled, onRejected); },
    };
    return builder;
  }

  async function rpc(name: string, params: Row) {
    if (!/^[a-z_]+$/.test(name)) throw new Error(`pgliteSupabase: rpc inválida: ${name}`);
    const keys = Object.keys(params);
    if (!keys.every(k => /^[a-z_]+$/.test(k))) throw new Error('pgliteSupabase: parâmetro inválido');
    try {
      const { rows: result } = await pg.query<{ r: unknown }>(
        `SELECT public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) AS r`,
        keys.map(k => params[k]),
      );
      return { data: result[0]?.r ?? null, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }

  return { pg, reset, rows, tags, supabase: { from, rpc } };
}
