// Artie — Executor de Tools (frontend)
// A execução permanece no frontend para que as credenciais do usuário (anon + RLS)
// sejam usadas. O backend APENAS processa linguagem natural e emite tool_calls.

import { supabase } from '../supabase';
import { criarTransacao } from '../financeiro/criarTransacao';
import { editarTransacao, type TransactionUpdate } from '../financeiro/editarTransacao';
import { deletarTransacao } from '../financeiro/deletarTransacao';
import { pagarFatura, lancarDiferencaProximoMes } from '../financeiro/pagarFatura';
import { calcularMesFatura } from '../financeiro/faturaUtils';
import { format, subDays, addDays, parseISO, startOfMonth, endOfMonth, addMonths } from 'date-fns';
import { expandTransactionInstances, type RawFinancialTransaction } from '../financeiro/instanceExpansion';
import { groupCreditCardInvoices, type CreditCardAccountLike } from '../financeiro/invoiceGrouping';
import { computeAccountBalanceAsOf } from '../financeiro/balanceCalculator';
import type {
  ArtieToolCall,
  ArtieToolResult,
  CreateTransactionArgs,
  UpdateTransactionArgs,
  DeleteTransactionArgs,
  ConfirmTransactionArgs,
  ListTransactionsArgs,
  GetAccountBalanceArgs,
  GetInvoiceSummaryArgs,
  PayCreditCardInvoiceArgs,
} from './types';

interface BalanceAccountRow {
  id: string;
  name: string;
  type: string;
  initial_balance?: number | null;
  is_default?: boolean | null;
}

interface CardRow {
  id: string;
  name: string;
  due_day?: number | null;
  closing_days_before?: number | null;
  invoice_payment_account_id?: string | null;
}

interface BankAccountRow {
  id: string;
  name: string;
}

// ─── Utilitários de busca ─────────────────────────────────────────────────────

const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Extrai o nome de uma rela\u00e7\u00e3o joined do Supabase, que pode vir como objeto \u00fanico ou array. */
function getJoinedName(joined: unknown): string | undefined {
  const value = joined as { name?: string } | { name?: string }[] | null | undefined;
  const first = Array.isArray(value) ? value[0] : value;
  return first?.name;
}

async function findTransactions(
  userId: string,
  searchDescription?: string,
  searchDate?: string,
  searchAmount?: number,
  statusFilter?: string,
) {
  const baseDate = searchDate ? parseISO(searchDate) : new Date();
  const from = format(subDays(baseDate, 3), 'yyyy-MM-dd');
  const to = format(addDays(baseDate, 3), 'yyyy-MM-dd');

  let query = supabase
    .from('financial_transactions')
    .select('id, description, amount, date, type, status, account_id, category_id, modalidade, parent_id, recurrence_enabled, installment_total, financial_accounts!account_id(name)')
    .eq('user_id', userId)
    // Templates de recorrência são linhas-modelo, não lançamentos reais:
    // confirmar/editar/excluir deve atingir apenas instâncias físicas.
    .eq('is_template', false)
    .gte('date', searchDate ? from : '2000-01-01')
    .lte('date', searchDate ? to : '2099-12-31');

  if (statusFilter) {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query.order('date', { ascending: false }).limit(50);
  if (error || !data) return [];

  const searchNorm = searchDescription ? normalize(searchDescription) : '';
  const isGeneric = !searchDescription || ['lançamento', 'lancamento', 'conta', 'valor', 'despesa', 'receita'].includes(searchDescription.toLowerCase().trim());

  return data.filter((tx) => {
    const descMatch = isGeneric || normalize(tx.description).includes(searchNorm) || searchNorm.includes(normalize(tx.description));
    const valMatch = !searchAmount || searchAmount === 0 || Math.abs(Math.abs(tx.amount) - Math.abs(searchAmount)) < 0.10;
    return descMatch && valMatch;
  });
}

// ─── Executores por tool ──────────────────────────────────────────────────────

async function executeCreateTransaction(
  userId: string,
  args: CreateTransactionArgs,
): Promise<ArtieToolResult> {
  try {
    const { data, error } = await criarTransacao({
      description: args.description,
      amount: args.amount,
      type: args.type,
      date: args.date,
      category_id: args.category_id,
      account_id: args.account_id,
      destination_account_id: args.destination_account_id,
      modalidade: args.modalidade || 'unica',
      installment_total: args.installment_total,
      recurrence_period: args.recurrence_period as 'daily' | 'weekly' | 'monthly' | 'yearly' | undefined,
      recurrence_interval: args.recurrence_interval,
      status: args.status || 'paid',
    });

    if (error) throw error;
    window.dispatchEvent(new CustomEvent('transaction_created'));
    return { success: true, data: { id: data?.id, description: args.description, amount: args.amount } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Erro ao criar lançamento.' };
  }
}

async function executeConfirmTransaction(
  userId: string,
  args: ConfirmTransactionArgs,
): Promise<ArtieToolResult> {
  try {
    const matches = await findTransactions(userId, args.search_description, args.search_date, args.search_amount, 'pending');

    if (matches.length === 0) {
      return { success: false, error: `Nenhum lançamento pendente encontrado com "${args.search_description || 'valor informado'}".` };
    }
    if (matches.length > 1) {
      return {
        success: false,
        error: `Encontrei ${matches.length} lançamentos pendentes que correspondem. Pode ser mais específico? Encontrei: ${matches.map(m => `"${m.description}" (R$${Math.abs(m.amount).toFixed(2)} em ${m.date})`).join(', ')}.`,
      };
    }

    const tx = matches[0];
    const confirmDate = args.confirm_date || format(new Date(), 'yyyy-MM-dd');
    const { error } = await editarTransacao(tx.id, { status: 'paid', date: confirmDate }, 'this');
    if (error) throw error;

    window.dispatchEvent(new CustomEvent('transaction_created'));
    return { success: true, data: { id: tx.id, description: tx.description, amount: tx.amount } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Erro ao confirmar lançamento.' };
  }
}

async function executeUpdateTransaction(
  userId: string,
  args: UpdateTransactionArgs,
): Promise<ArtieToolResult> {
  try {
    const matches = await findTransactions(userId, args.search_description, args.search_date, args.search_amount);

    if (matches.length === 0) {
      const descLabel = args.search_description ? `"${args.search_description}"` : (args.search_amount ? `de R$ ${args.search_amount}` : '');
      return { success: false, error: `Nenhum lançamento encontrado ${descLabel}.` };
    }
    if (matches.length > 1) {
      return {
        success: false,
        error: `Encontrei ${matches.length} lançamentos. Pode ser mais específico? Encontrei: ${matches.map(m => `"${m.description}" (R$${Math.abs(m.amount).toFixed(2)} em ${m.date})`).join(', ')}.`,
      };
    }

    const tx = matches[0];
    const updatePayload: TransactionUpdate = {};
    if (args.update_description) updatePayload.description = args.update_description;
    if (args.update_amount) updatePayload.amount = args.update_amount;
    if (args.update_date) updatePayload.date = args.update_date;
    if (args.update_account_id) updatePayload.account_id = args.update_account_id;
    if (args.update_category_id) updatePayload.category_id = args.update_category_id;
    if (args.update_status) updatePayload.status = args.update_status;

    if (Object.keys(updatePayload).length === 0) {
      return { success: false, error: 'Nenhum campo para atualizar foi informado.' };
    }

    const { error } = await editarTransacao(tx.id, updatePayload, 'this');
    if (error) throw error;

    window.dispatchEvent(new CustomEvent('transaction_created'));
    return { success: true, data: { id: tx.id, description: tx.description, updated: updatePayload } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Erro ao atualizar lançamento.' };
  }
}

async function executeDeleteTransaction(
  userId: string,
  args: DeleteTransactionArgs,
): Promise<ArtieToolResult> {
  try {
    const matches = await findTransactions(userId, args.search_description, args.search_date, args.search_amount);

    if (matches.length === 0) {
      return { success: false, error: `Nenhum lançamento encontrado com "${args.search_description}".` };
    }
    if (matches.length > 1) {
      return {
        success: false,
        error: `Encontrei ${matches.length} lançamentos que correspondem. Seja mais específico (data ou valor). Encontrei: ${matches.map(m => `"${m.description}" (R$${Math.abs(m.amount).toFixed(2)} em ${m.date})`).join(', ')}.`,
      };
    }

    const tx = matches[0];
    const isRecurringOrInstallment =
      (tx.modalidade && tx.modalidade !== 'unica') ||
      !!tx.parent_id ||
      (tx.installment_total && tx.installment_total > 1) ||
      !!tx.recurrence_enabled;

    // Se o lançamento for recorrente/parcelado e o usuário ainda não indicou se quer apagar um ou todos os próximos
    if (isRecurringOrInstallment && !args.scope) {
      return {
        success: true,
        requiresScope: true,
        data: {
          transactionId: tx.id,
          description: tx.description,
          amount: tx.amount,
          date: tx.date,
          search_description: args.search_description,
          search_date: args.search_date,
          search_amount: args.search_amount,
          message: `O lançamento "${tx.description}" (R$ ${Math.abs(tx.amount).toFixed(2)}) faz parte de uma sequência (recorrente/parcelado).`
        }
      };
    }

    const scopeToUse = args.scope || 'this';
    const { error } = await deletarTransacao({ transactionId: tx.id, scope: scopeToUse });
    if (error) throw error;

    window.dispatchEvent(new CustomEvent('transaction_created'));
    return {
      success: true,
      data: {
        id: tx.id,
        description: tx.description,
        amount: tx.amount,
        scope: scopeToUse
      }
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Erro ao excluir lançamento.' };
  }
}

async function executeListTransactions(
  userId: string,
  args: ListTransactionsArgs,
): Promise<ArtieToolResult> {
  try {
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');

    // Contas em atraso: pendentes com data anterior a hoje, sem limite inferior —
    // o período padrão (mês atual) esconderia atrasos de meses anteriores.
    const isOverdue = !!args.overdue_only;
    const dateFrom = args.date_from || (isOverdue ? '2000-01-01' : format(startOfMonth(today), 'yyyy-MM-dd'));
    // Padrão: busca até o fim do MÊS QUE VEM por padrão para responder perguntas sobre o próximo mês
    const dateTo = args.date_to || format(endOfMonth(addMonths(today, 1)), 'yyyy-MM-dd');

    let query = supabase
      .from('financial_transactions')
      .select(`
        id, description, amount, date, type, status, category_id,
        financial_accounts!account_id(name),
        financial_categories!category_id(name)
      `)
      .eq('user_id', userId)
      // Templates de recorrência são linhas-modelo, não lançamentos do extrato
      .eq('is_template', false)
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .order('date', { ascending: false })
      .limit(args.limit || 200);

    if (isOverdue) query = query.eq('status', 'pending').lt('date', todayStr);
    if (args.type) query = query.eq('type', args.type);
    if (args.status && !isOverdue) query = query.eq('status', args.status);

    const { data, error } = await query;
    if (error) throw error;

    let results = data || [];

    // Filtro por categoria (client-side para busca parcial).
    // Categoria "pai" agrega as subcategorias: "quanto gastei em Alimentação"
    // deve incluir lançamentos classificados em "Restaurante" (filha).
    if (args.category_name) {
      const catNorm = normalize(args.category_name);
      const { data: cats } = await supabase
        .from('financial_categories')
        .select('id, name, parent_id')
        .eq('user_id', userId);

      if (cats && cats.length > 0) {
        const matchedIds = new Set(
          cats.filter((c) => normalize(c.name).includes(catNorm)).map((c) => c.id),
        );
        cats.forEach((c) => {
          if (c.parent_id && matchedIds.has(c.parent_id)) matchedIds.add(c.id);
        });
        results = results.filter((tx) => tx.category_id && matchedIds.has(tx.category_id));
      } else {
        results = results.filter((tx) =>
          getJoinedName(tx.financial_categories) && normalize(getJoinedName(tx.financial_categories)!).includes(catNorm),
        );
      }
    }

    const total = results.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const summary = results.map((tx) => ({
      description: tx.description,
      amount: tx.amount,
      date: tx.date,
      type: tx.type,
      status: tx.status,
      account: getJoinedName(tx.financial_accounts),
      category: getJoinedName(tx.financial_categories),
    }));

    return { success: true, data: { transactions: summary, total, count: results.length, period: `${dateFrom} a ${dateTo}` } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Erro ao buscar lançamentos.' };
  }
}

async function executeGetAccountBalance(
  userId: string,
  args: GetAccountBalanceArgs,
): Promise<ArtieToolResult> {
  try {
    const onlyConfirmed = args.only_confirmed ?? false;
    const asOfDate = args.as_of_date ? parseISO(args.as_of_date) : endOfMonth(new Date());

    const [accountsRes, txRes, templatesRes, cardsRes] = await Promise.all([
      supabase.from('financial_accounts').select('id, name, type, initial_balance, is_default').eq('user_id', userId).eq('is_active', true).neq('type', 'credit_card'),
      supabase.from('v_financial_transactions' as never).select('*').eq('user_id', userId).eq('is_template', false),
      // Precisa do join com account_id para obter account_type — sem ele, o recalculo do mes
      // da fatura de recorrencias em cartao de credito (dentro de expandTransactionInstances)
      // nao consegue reconhecer o cartao e usa o invoice_month original do template, gerando
      // um saldo diferente do calculado pela tela (que ja faz esse mesmo join hoje).
      supabase.from('financial_transactions').select('*, account:account_id(type)').eq('user_id', userId).eq('is_template', true).eq('recurrence_enabled', true),
      supabase.from('financial_accounts').select('id, name, due_day, invoice_payment_account_id').eq('user_id', userId).eq('type', 'credit_card').eq('is_active', true),
    ]);

    if (accountsRes.error) throw accountsRes.error;
    if (txRes.error) throw txRes.error;
    if (templatesRes.error) throw templatesRes.error;
    if (cardsRes.error) throw cardsRes.error;

    const accounts = (accountsRes.data as unknown as BalanceAccountRow[]) || [];
    if (accounts.length === 0) {
      return { success: false, error: 'Nenhuma conta bancária encontrada.' };
    }

    let matchedAccounts = accounts;
    if (args.account_name) {
      const nameNorm = normalize(args.account_name);
      matchedAccounts = accounts.filter(a => normalize(a.name).includes(nameNorm));
      if (matchedAccounts.length === 0) {
        return { success: false, error: `Não encontrei nenhuma conta chamada "${args.account_name}".` };
      }
    }

    const mappedTemplates = ((templatesRes.data as unknown as (RawFinancialTransaction & { account?: { type?: string } })[]) || []).map((t) => ({
      ...t,
      account_type: t.account?.type || 'checking',
    }));

    const instances = expandTransactionInstances((txRes.data as unknown as RawFinancialTransaction[]) || [], mappedTemplates, {
      horizonEnd: endOfMonth(asOfDate),
    });
    const invoiceGroups = groupCreditCardInvoices(instances, (cardsRes.data as unknown as CreditCardAccountLike[]) || [], { onlyConfirmed });

    const perAccount = matchedAccounts.map(acc => ({
      account: acc.name,
      balance: computeAccountBalanceAsOf(acc.id, instances, invoiceGroups, Number(acc.initial_balance) || 0, { asOf: asOfDate, onlyConfirmed }),
    }));

    const total = perAccount.reduce((sum, a) => sum + a.balance, 0);

    let defaultAccount: { name: string; balance: number } | null = null;
    if (!args.account_name) {
      const defaultAcc = matchedAccounts.find(a => a.is_default);
      if (defaultAcc) {
        const match = perAccount.find(a => a.account === defaultAcc.name);
        if (match) defaultAccount = { name: match.account, balance: match.balance };
      }
    }

    return {
      success: true,
      data: {
        accounts: perAccount,
        total,
        as_of: format(asOfDate, 'yyyy-MM-dd'),
        only_confirmed: onlyConfirmed,
        default_account: defaultAccount,
        has_multiple_accounts: matchedAccounts.length > 1,
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Erro ao calcular saldo.' };
  }
}

// ─── Fatura de cartão de crédito ──────────────────────────────────────────────

/** Carrega instâncias expandidas + grupos de fatura (mesmo pipeline das telas/saldo) */
async function loadInvoiceGroups(userId: string) {
  const [txRes, templatesRes, cardsRes] = await Promise.all([
    supabase.from('v_financial_transactions' as never).select('*').eq('user_id', userId).eq('is_template', false),
    supabase.from('financial_transactions').select('*, account:account_id(type)').eq('user_id', userId).eq('is_template', true).eq('recurrence_enabled', true),
    supabase.from('financial_accounts').select('id, name, due_day, closing_days_before, invoice_payment_account_id').eq('user_id', userId).eq('type', 'credit_card').eq('is_active', true),
  ]);

  if (txRes.error) throw txRes.error;
  if (templatesRes.error) throw templatesRes.error;
  if (cardsRes.error) throw cardsRes.error;

  const mappedTemplates = ((templatesRes.data as unknown as (RawFinancialTransaction & { account?: { type?: string } })[]) || []).map((t) => ({
    ...t,
    account_type: t.account?.type || 'checking',
  }));

  const instances = expandTransactionInstances((txRes.data as unknown as RawFinancialTransaction[]) || [], mappedTemplates, {
    horizonEnd: endOfMonth(addMonths(new Date(), 2)),
  });
  const cards = (cardsRes.data as unknown as CardRow[]) || [];
  const invoiceGroups = groupCreditCardInvoices(instances, cards, {});

  return { cards, invoiceGroups };
}

/** Resolve o cartão pelo nome (parcial); com um único cartão cadastrado, assume-o */
function resolveCard(cardName: string | undefined, cards: CardRow[]): { card: CardRow | null; error?: string } {
  if (cards.length === 0) return { card: null, error: 'Nenhum cartão de crédito cadastrado.' };
  if (!cardName || !cardName.trim()) {
    if (cards.length === 1) return { card: cards[0] };
    return { card: null, error: `Existem ${cards.length} cartões: ${cards.map(c => c.name).join(', ')}. Pergunte ao usuário qual deles (ask_user).` };
  }
  const nameNorm = normalize(cardName.trim());
  const matches = cards.filter(c => normalize(c.name).includes(nameNorm) || nameNorm.includes(normalize(c.name)));
  if (matches.length === 1) return { card: matches[0] };
  if (matches.length === 0) {
    return { card: null, error: `Não encontrei um cartão chamado "${cardName}". Cartões disponíveis: ${cards.map(c => c.name).join(', ')}.` };
  }
  return { card: null, error: `Mais de um cartão corresponde a "${cardName}": ${matches.map(c => c.name).join(', ')}. Pergunte ao usuário qual deles (ask_user).` };
}

/** Fatura corrente do cartão (mesma regra de janela do lançamento de compras) */
function defaultInvoiceMonthForCard(card: CardRow): string {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  return (
    calcularMesFatura(todayStr, {
      type: 'credit_card',
      due_day: card.due_day,
      closing_days_before: card.closing_days_before,
    }) || todayStr.slice(0, 7)
  );
}

async function executeGetInvoiceSummary(
  userId: string,
  args: GetInvoiceSummaryArgs,
): Promise<ArtieToolResult> {
  try {
    const { cards, invoiceGroups } = await loadInvoiceGroups(userId);
    const { card, error } = resolveCard(args.card_name, cards);
    if (!card) return { success: false, error };

    const invoiceMonth = args.invoice_month || defaultInvoiceMonthForCard(card);
    const group = invoiceGroups.find(g => g.cardId === card.id && g.invoiceMonth === invoiceMonth);
    if (!group) {
      const openMonths = invoiceGroups
        .filter(g => g.cardId === card.id && !g.reconciled)
        .map(g => g.invoiceMonth)
        .sort();
      return {
        success: false,
        error: `Não encontrei lançamentos na fatura ${invoiceMonth} do cartão ${card.name}.${openMonths.length ? ` Faturas em aberto: ${openMonths.join(', ')}.` : ''}`,
      };
    }

    return {
      success: true,
      data: {
        card_name: card.name,
        invoice_month: invoiceMonth,
        total: Math.round(group.total * 100) / 100,
        due_date: group.dueDate,
        reconciled: group.reconciled,
        is_paid: group.isPaid,
        payment_status: group.billTransfer?.status ?? null,
        payment_amount: group.billTransfer?.amount ?? null,
        payment_date: group.billTransfer?.date ?? null,
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Erro ao consultar a fatura.' };
  }
}

async function executePayCreditCardInvoice(
  userId: string,
  args: PayCreditCardInvoiceArgs,
): Promise<ArtieToolResult> {
  try {
    if (!args.amount || args.amount <= 0) {
      return { success: false, error: 'Informe um valor de pagamento válido (maior que zero).' };
    }
    if (!args.payment_date) {
      return { success: false, error: 'Informe a data do pagamento (YYYY-MM-DD).' };
    }

    const { cards, invoiceGroups } = await loadInvoiceGroups(userId);
    const { card, error } = resolveCard(args.card_name, cards);
    if (!card) return { success: false, error };

    const invoiceMonth = args.invoice_month || defaultInvoiceMonthForCard(card);
    const group = invoiceGroups.find(g => g.cardId === card.id && g.invoiceMonth === invoiceMonth);
    if (!group) {
      return { success: false, error: `Não encontrei lançamentos na fatura ${invoiceMonth} do cartão ${card.name}.` };
    }
    if (group.reconciled) {
      const statusLabel = group.billTransfer?.status === 'paid' ? 'paga' : 'com pagamento agendado';
      return {
        success: false,
        error: `A fatura ${invoiceMonth} do cartão ${card.name} já está fechada (${statusLabel}). Para alterar, reabra a fatura na tela de Cartões.`,
      };
    }

    // Total sempre recalculado aqui — nunca confiar no valor vindo do modelo
    const total = Math.round(group.total * 100) / 100;

    // Conta pagadora: mesma regra do CloseBillModal (corrente/poupança ativas)
    const { data: bankAccounts, error: accError } = await supabase
      .from('financial_accounts')
      .select('id, name')
      .eq('user_id', userId)
      .in('type', ['checking', 'savings'])
      .eq('is_active', true)
      .order('name');
    if (accError) throw accError;

    const banks: BankAccountRow[] = bankAccounts || [];
    if (banks.length === 0) {
      return { success: false, error: 'Nenhuma conta bancária (corrente/poupança) ativa para pagar a fatura.' };
    }

    let paymentAccount: BankAccountRow | null = null;
    if (args.payment_account_name && args.payment_account_name.trim()) {
      const n = normalize(args.payment_account_name.trim());
      const matches = banks.filter(b => normalize(b.name).includes(n) || n.includes(normalize(b.name)));
      if (matches.length === 1) {
        paymentAccount = matches[0];
      } else {
        return {
          success: false,
          error: `Não identifiquei a conta "${args.payment_account_name}". Contas disponíveis: ${banks.map(b => b.name).join(', ')}. Pergunte ao usuário qual usar (ask_user).`,
        };
      }
    } else if (banks.length === 1) {
      paymentAccount = banks[0];
    } else {
      return {
        success: false,
        error: `De qual conta sai o pagamento? Contas disponíveis: ${banks.map(b => b.name).join(', ')}. Pergunte ao usuário (ask_user).`,
      };
    }

    const expectedDiff = Math.round((total - args.amount) * 100) / 100;
    if (expectedDiff >= 0.01 && !args.difference_action) {
      return {
        success: false,
        error: `O valor informado (R$ ${args.amount.toFixed(2)}) é menor que o total da fatura (R$ ${total.toFixed(2)}). Pergunte ao usuário (ask_user) se quer descartar a diferença de R$ ${expectedDiff.toFixed(2)} ou lançá-la na fatura do mês seguinte, e chame novamente com difference_action.`,
      };
    }

    const { data: payResult, diff, error: payError } = await pagarFatura({
      cardId: card.id,
      invoiceMonth,
      invoiceTotal: total,
      amount: args.amount,
      paymentDate: args.payment_date,
      paymentAccountId: paymentAccount.id,
    });
    if (payError || !payResult) throw payError || new Error('Falha ao pagar a fatura.');

    let differenceApplied: 'discard' | 'next_month' | null = null;
    if (diff >= 0.01) {
      differenceApplied = args.difference_action || 'discard';
      if (differenceApplied === 'next_month') {
        const { error: diffError } = await lancarDiferencaProximoMes(card.id, diff, invoiceMonth);
        if (diffError) {
          return {
            success: false,
            error: `A fatura foi fechada, mas não consegui lançar a diferença de R$ ${diff.toFixed(2)} na fatura do mês seguinte: ${diffError.message}. Oriente o usuário a lançá-la manualmente.`,
          };
        }
      }
    }

    window.dispatchEvent(new CustomEvent('transaction_created'));
    return {
      success: true,
      data: {
        card_name: card.name,
        invoice_month: invoiceMonth,
        amount: args.amount,
        payment_date: args.payment_date,
        account_name: paymentAccount.name,
        scheduled: payResult.isFutureDate,
        diff,
        difference_action: differenceApplied,
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Erro ao pagar a fatura.' };
  }
}

// ─── Entry point: executa qualquer tool pelo nome ─────────────────────────────

export async function executeArtieToolCall(
  userId: string,
  toolCall: ArtieToolCall,
): Promise<ArtieToolResult> {
  const { name, args } = toolCall;

  switch (name) {
    case 'create_transaction':
      return executeCreateTransaction(userId, args as CreateTransactionArgs);
    case 'confirm_transaction':
      return executeConfirmTransaction(userId, args as ConfirmTransactionArgs);
    case 'update_transaction':
      return executeUpdateTransaction(userId, args as UpdateTransactionArgs);
    case 'delete_transaction':
      return executeDeleteTransaction(userId, args as DeleteTransactionArgs);
    case 'list_transactions':
      return executeListTransactions(userId, args as ListTransactionsArgs);
    case 'get_account_balance':
      return executeGetAccountBalance(userId, args as GetAccountBalanceArgs);
    case 'get_invoice_summary':
      return executeGetInvoiceSummary(userId, args as GetInvoiceSummaryArgs);
    case 'pay_credit_card_invoice':
      return executePayCreditCardInvoice(userId, args as unknown as PayCreditCardInvoiceArgs);
    default:
      return { success: false, error: `Tool desconhecida: ${name}` };
  }
}
