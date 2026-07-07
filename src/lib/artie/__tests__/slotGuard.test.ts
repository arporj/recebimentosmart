import { describe, it, expect } from 'vitest';
import { resolveCreateTransactionArgs, getAccountInfo } from '../slotGuard';
import type { ArtieEntityContext, CreateTransactionArgs } from '../types';

const ctx: ArtieEntityContext = {
  accounts: [
    { id: 'acc-principal', name: 'Conta Principal', type: 'checking', is_default: true },
    { id: 'acc-nubank', name: 'Nubank', type: 'credit_card' },
    { id: 'acc-inter', name: 'Cartão Inter', type: 'credit_card' },
  ],
  categories: [
    { id: 'cat-alimentacao', name: 'Alimentação' },
    { id: 'cat-transporte', name: 'Transporte' },
  ],
  credit_cards: [
    { id: 'acc-nubank', name: 'Nubank', closing_day: 5, due_day: 10, limit: 5000, current_balance: 0 },
    { id: 'acc-inter', name: 'Cartão Inter', closing_day: 3, due_day: 8, limit: 3000, current_balance: 0 },
  ],
};

const baseArgs: CreateTransactionArgs = {
  description: 'Mercado',
  amount: 50,
  type: 'expense',
  date: '2026-07-07',
  account_id: 'acc-principal',
  category_id: 'cat-alimentacao',
};

describe('resolveCreateTransactionArgs', () => {
  it('aceita args completos com IDs válidos', () => {
    const result = resolveCreateTransactionArgs(baseArgs, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.args.account_id).toBe('acc-principal');
      expect(result.args.category_id).toBe('cat-alimentacao');
    }
  });

  it('resolve conta enviada como nome (sem acento, parcial) para o ID', () => {
    const result = resolveCreateTransactionArgs({ ...baseArgs, account_id: 'nubank' }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.args.account_id).toBe('acc-nubank');
  });

  it('resolve categoria enviada como nome sem acentos', () => {
    const result = resolveCreateTransactionArgs({ ...baseArgs, category_id: 'alimentacao' }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.args.category_id).toBe('cat-alimentacao');
  });

  it('re-pergunta a conta quando ausente, com a principal primeiro nos chips', () => {
    const result = resolveCreateTransactionArgs({ ...baseArgs, account_id: undefined }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.question).toContain('conta');
      expect(result.options?.[0]).toBe('Conta Principal');
    }
  });

  it('re-pergunta a conta quando o nome é ambíguo (dois cartões contêm "cart")', () => {
    const result = resolveCreateTransactionArgs({ ...baseArgs, account_id: 'inexistente-xyz' }, ctx);
    expect(result.ok).toBe(false);
  });

  it('re-pergunta a categoria quando o modelo inventa um ID', () => {
    const result = resolveCreateTransactionArgs({ ...baseArgs, category_id: 'cat-fake' }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.question).toContain('categoria');
  });

  it('re-pergunta o nº de parcelas em parcelada sem installment_total', () => {
    const result = resolveCreateTransactionArgs({ ...baseArgs, modalidade: 'parcelada' }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.options).toContain('12x');
  });

  it('re-pergunta a periodicidade em recorrente sem recurrence_period', () => {
    const result = resolveCreateTransactionArgs({ ...baseArgs, modalidade: 'recorrente' }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.options).toContain('Mensal');
  });

  it('força status pending em cartão de crédito mesmo se o modelo mandar paid', () => {
    const result = resolveCreateTransactionArgs(
      { ...baseArgs, account_id: 'acc-nubank', status: 'paid' },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.args.status).toBe('pending');
  });

  it('mantém status paid em conta comum', () => {
    const result = resolveCreateTransactionArgs({ ...baseArgs, status: 'paid' }, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.args.status).toBe('paid');
  });
});

describe('getAccountInfo', () => {
  it('identifica cartão de crédito pelo tipo da conta', () => {
    expect(getAccountInfo('acc-nubank', ctx)).toEqual({ name: 'Nubank', isCreditCard: true });
  });

  it('identifica conta comum', () => {
    expect(getAccountInfo('acc-principal', ctx)).toEqual({ name: 'Conta Principal', isCreditCard: false });
  });

  it('retorna undefined para conta desconhecida', () => {
    expect(getAccountInfo('acc-x', ctx)).toBeUndefined();
  });
});
