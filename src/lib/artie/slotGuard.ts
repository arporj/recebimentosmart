// Artie — Guarda dura do fluxo guiado de criação de lançamentos.
// Os modelos flash às vezes ignoram o `required` da tool declaration ou enviam
// nomes/valores inventados no lugar de IDs. Antes de executar create_transaction,
// este módulo valida e normaliza os args contra as entidades reais do usuário;
// quando algo falta, devolve a pergunta (com chips) a ser re-apresentada localmente,
// sem nova chamada ao modelo.

import type { ArtieEntityContext, CreateTransactionArgs } from './types';

export type SlotGuardResult =
  | { ok: true; args: CreateTransactionArgs }
  | { ok: false; question: string; options?: string[] };

const MAX_OPTIONS = 6;

const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

interface NamedEntity {
  id: string;
  name: string;
}

/**
 * Resolve um valor recebido do modelo contra uma lista de entidades:
 * aceita o ID exato ou um nome (parcial, sem acentos). Retorna o ID resolvido
 * apenas quando o match é unívoco.
 */
function resolveEntityId(value: string | undefined, entities: NamedEntity[]): string | null {
  if (!value || !value.trim()) return null;

  if (entities.some(e => e.id === value)) return value;

  const valueNorm = normalize(value.trim());
  const exact = entities.filter(e => normalize(e.name) === valueNorm);
  if (exact.length === 1) return exact[0].id;

  const partial = entities.filter(e =>
    normalize(e.name).includes(valueNorm) || valueNorm.includes(normalize(e.name)),
  );
  if (partial.length === 1) return partial[0].id;

  return null;
}

/** Contas ordenadas com a principal primeiro, limitadas ao nº máximo de chips */
function buildAccountOptions(ctx: ArtieEntityContext): string[] {
  const sorted = [...ctx.accounts].sort((a, b) => Number(!!b.is_default) - Number(!!a.is_default));
  return sorted.slice(0, MAX_OPTIONS).map(a => a.name);
}

/** Contas que não são cartão de crédito (opcionalmente excluindo uma), p/ transferências */
function buildNonCardAccountOptions(ctx: ArtieEntityContext, excludeId?: string): string[] {
  return [...ctx.accounts]
    .filter(a => a.type !== 'credit_card' && a.id !== excludeId)
    .sort((a, b) => Number(!!b.is_default) - Number(!!a.is_default))
    .slice(0, MAX_OPTIONS)
    .map(a => a.name);
}

function buildCategoryOptions(ctx: ArtieEntityContext): string[] {
  return ctx.categories.slice(0, MAX_OPTIONS).map(c => c.name);
}

/** Informação da conta usada, para a mensagem final de confirmação do Artie */
export function getAccountInfo(
  accountId: string | undefined,
  ctx: ArtieEntityContext,
): { name: string; isCreditCard: boolean } | undefined {
  if (!accountId) return undefined;
  const account = ctx.accounts.find(a => a.id === accountId);
  if (!account) return undefined;
  const isCreditCard = account.type === 'credit_card' || ctx.credit_cards.some(c => c.id === accountId);
  return { name: account.name, isCreditCard };
}

export function resolveCreateTransactionArgs(
  args: CreateTransactionArgs,
  ctx: ArtieEntityContext,
): SlotGuardResult {
  const resolved: CreateTransactionArgs = { ...args };

  // Conta obrigatória (aceita ID ou nome; cartões também estão em ctx.accounts)
  const accountId = resolveEntityId(resolved.account_id, ctx.accounts);
  if (!accountId) {
    return {
      ok: false,
      question: 'Em qual conta devo lançar?',
      options: buildAccountOptions(ctx),
    };
  }
  resolved.account_id = accountId;

  // Transferência: origem e destino obrigatórios, nenhum pode ser cartão de crédito
  // (transfer com destino cartão é pagamento de fatura, que tem fluxo próprio com
  // invoice_month — sem ele há dupla dedução no saldo e o lançamento some do extrato).
  if (resolved.type === 'transfer') {
    const sourceInfo = getAccountInfo(accountId, ctx);
    if (sourceInfo?.isCreditCard) {
      return {
        ok: false,
        question: 'Transferência não pode sair de um cartão de crédito. De qual conta devo transferir?',
        options: buildNonCardAccountOptions(ctx),
      };
    }

    const destinationId = resolveEntityId(resolved.destination_account_id, ctx.accounts);
    if (!destinationId) {
      return {
        ok: false,
        question: 'Para qual conta devo transferir?',
        options: buildNonCardAccountOptions(ctx, accountId),
      };
    }
    const destinationInfo = getAccountInfo(destinationId, ctx);
    if (destinationInfo?.isCreditCard) {
      return {
        ok: false,
        question: `Para pagar a fatura do cartão, é só me pedir: "paga a fatura do cartão ${destinationInfo.name}". Se for outra transferência, escolha a conta de destino:`,
        options: buildNonCardAccountOptions(ctx, accountId),
      };
    }
    if (destinationId === accountId) {
      return {
        ok: false,
        question: 'A conta de destino precisa ser diferente da de origem. Para qual conta devo transferir?',
        options: buildNonCardAccountOptions(ctx, accountId),
      };
    }
    resolved.destination_account_id = destinationId;
  }

  // Categoria obrigatória (aceita ID ou nome)
  const categoryId = resolveEntityId(resolved.category_id, ctx.categories);
  if (!categoryId) {
    return {
      ok: false,
      question: 'Em qual categoria devo classificar?',
      options: buildCategoryOptions(ctx),
    };
  }
  resolved.category_id = categoryId;

  if (resolved.modalidade === 'parcelada' && (!resolved.installment_total || resolved.installment_total < 2)) {
    return {
      ok: false,
      question: 'Em quantas parcelas?',
      options: ['2x', '3x', '6x', '10x', '12x'],
    };
  }

  if (resolved.modalidade === 'recorrente' && !resolved.recurrence_period) {
    return {
      ok: false,
      question: 'Com qual frequência esse lançamento se repete?',
      options: ['Mensal', 'Semanal', 'Anual', 'Diária'],
    };
  }

  // Compra em cartão nasce pendente (quitada no pagamento da fatura),
  // mesmo que o modelo tenha mandado status 'paid'.
  const accountInfo = getAccountInfo(accountId, ctx);
  if (accountInfo?.isCreditCard) {
    resolved.status = 'pending';
  }

  return { ok: true, args: resolved };
}
