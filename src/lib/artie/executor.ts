// Artie — Executor de Tools (frontend)
// A execução permanece no frontend para que as credenciais do usuário (anon + RLS)
// sejam usadas. O backend APENAS processa linguagem natural e emite tool_calls.

import { supabase } from '../supabase';
import { criarTransacao } from '../financeiro/criarTransacao';
import { editarTransacao } from '../financeiro/editarTransacao';
import { deletarTransacao } from '../financeiro/deletarTransacao';
import { format, subDays, addDays, parseISO, startOfMonth, endOfMonth, addMonths } from 'date-fns';
import type {
  ArtieToolCall,
  ArtieToolResult,
  CreateTransactionArgs,
  UpdateTransactionArgs,
  DeleteTransactionArgs,
  ConfirmTransactionArgs,
  ListTransactionsArgs,
} from './types';

// ─── Utilitários de busca ─────────────────────────────────────────────────────

const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

async function findTransactions(
  userId: string,
  searchDescription: string,
  searchDate?: string,
  searchAmount?: number,
  statusFilter?: string,
) {
  const baseDate = searchDate ? parseISO(searchDate) : new Date();
  const from = format(subDays(baseDate, 3), 'yyyy-MM-dd');
  const to = format(addDays(baseDate, 3), 'yyyy-MM-dd');

  let query = supabase
    .from('financial_transactions')
    .select('id, description, amount, date, type, status, account_id, category_id, financial_accounts!account_id(name)')
    .eq('user_id', userId)
    .gte('date', searchDate ? from : '2000-01-01')
    .lte('date', searchDate ? to : '2099-12-31');

  if (statusFilter) {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query.order('date', { ascending: false }).limit(50);
  if (error || !data) return [];

  const searchNorm = normalize(searchDescription);
  return data.filter((tx) => {
    const descMatch = normalize(tx.description).includes(searchNorm) || searchNorm.includes(normalize(tx.description));
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
      return { success: false, error: `Nenhum lançamento pendente encontrado com "${args.search_description}".` };
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
      return { success: false, error: `Nenhum lançamento encontrado com "${args.search_description}".` };
    }
    if (matches.length > 1) {
      return {
        success: false,
        error: `Encontrei ${matches.length} lançamentos. Pode ser mais específico? Encontrei: ${matches.map(m => `"${m.description}" em ${m.date}`).join(', ')}.`,
      };
    }

    const tx = matches[0];
    const updatePayload: Record<string, unknown> = {};
    if (args.update_description) updatePayload.description = args.update_description;
    if (args.update_amount) updatePayload.amount = args.update_amount;
    if (args.update_date) updatePayload.date = args.update_date;
    if (args.update_account_id) updatePayload.account_id = args.update_account_id;
    if (args.update_category_id) updatePayload.category_id = args.update_category_id;

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
        error: `Encontrei ${matches.length} lançamentos. Qual devo excluir? ${matches.map(m => `"${m.description}" (R$${Math.abs(m.amount).toFixed(2)} em ${m.date})`).join(', ')}.`,
      };
    }

    const tx = matches[0];
    const { error } = await deletarTransacao(tx.id);
    if (error) throw error;

    window.dispatchEvent(new CustomEvent('transaction_created'));
    return { success: true, data: { id: tx.id, description: tx.description } };
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
    const dateFrom = args.date_from || format(startOfMonth(today), 'yyyy-MM-dd');
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
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .order('date', { ascending: false })
      .limit(args.limit || 20);

    if (args.type) query = query.eq('type', args.type);
    if (args.status) query = query.eq('status', args.status);

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
    default:
      return { success: false, error: `Tool desconhecida: ${name}` };
  }
}
