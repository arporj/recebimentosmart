// Artie — Executor de Tools (frontend)
// A execução permanece no frontend para que as credenciais do usuário (anon + RLS)
// sejam usadas. O backend APENAS processa linguagem natural e emite tool_calls.

import { supabase } from '../supabase';
import { criarTransacao } from '../financeiro/criarTransacao';
import { editarTransacao } from '../financeiro/editarTransacao';
import { deletarTransacao } from '../financeiro/deletarTransacao';
import { format, subDays, addDays, parseISO, startOfMonth, endOfMonth, addMonths } from 'date-fns';
import { expandTransactionInstances } from '../financeiro/instanceExpansion';
import { groupCreditCardInvoices } from '../financeiro/invoiceGrouping';
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
} from './types';

// ─── Utilitários de busca ─────────────────────────────────────────────────────

const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

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
      modalidade: args.modalidade || 'unica',
      installment_total: args.installment_total,
      recurrence_period: args.recurrence_period as any,
      recurrence_interval: args.recurrence_interval,
      status: args.status || 'paid',
    });

    if (error) throw error;
    window.dispatchEvent(new CustomEvent('transaction_created'));
    return { success: true, data: { id: data?.id, description: args.description, amount: args.amount } };
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro ao criar lançamento.' };
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
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro ao confirmar lançamento.' };
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
    const updatePayload: Record<string, unknown> = {};
    if (args.update_description) updatePayload.description = args.update_description;
    if (args.update_amount) updatePayload.amount = args.update_amount;
    if (args.update_date) updatePayload.date = args.update_date;
    if (args.update_account_id) updatePayload.account_id = args.update_account_id;
    if (args.update_category_id) updatePayload.category_id = args.update_category_id;
    if (args.update_status) updatePayload.status = args.update_status;

    if (Object.keys(updatePayload).length === 0) {
      return { success: false, error: 'Nenhum campo para atualizar foi informado.' };
    }

    const { error } = await editarTransacao(tx.id, updatePayload as any, 'this');
    if (error) throw error;

    window.dispatchEvent(new CustomEvent('transaction_created'));
    return { success: true, data: { id: tx.id, description: tx.description, updated: updatePayload } };
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro ao atualizar lançamento.' };
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
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro ao excluir lançamento.' };
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
        id, description, amount, date, type, status,
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

    // Filtro por categoria (client-side para busca parcial)
    if (args.category_name) {
      const catNorm = normalize(args.category_name);
      results = results.filter((tx: any) =>
        tx.financial_categories?.name && normalize(tx.financial_categories.name).includes(catNorm),
      );
    }

    const total = results.reduce((sum: number, tx: any) => sum + Math.abs(tx.amount), 0);
    const summary = results.map((tx: any) => ({
      description: tx.description,
      amount: tx.amount,
      date: tx.date,
      type: tx.type,
      status: tx.status,
      account: (tx as any).financial_accounts?.name,
      category: (tx as any).financial_categories?.name,
    }));

    return { success: true, data: { transactions: summary, total, count: results.length, period: `${dateFrom} a ${dateTo}` } };
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro ao buscar lançamentos.' };
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
      (supabase as any).from('v_financial_transactions').select('*').eq('user_id', userId).eq('is_template', false),
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

    const accounts: any[] = accountsRes.data || [];
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

    const mappedTemplates = ((templatesRes.data as any[]) || []).map((t: any) => ({
      ...t,
      account_type: t.account?.type || 'checking',
    }));

    const instances = expandTransactionInstances((txRes.data as any) || [], mappedTemplates, {
      horizonEnd: endOfMonth(asOfDate),
    });
    const invoiceGroups = groupCreditCardInvoices(instances, (cardsRes.data as any) || [], { onlyConfirmed });

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
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro ao calcular saldo.' };
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
    default:
      return { success: false, error: `Tool desconhecida: ${name}` };
  }
}
