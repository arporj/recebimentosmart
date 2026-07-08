// Serviço canônico de fechamento/pagamento de fatura de cartão de crédito.
// Extraído do CloseBillModal para ser reutilizado pela tela de Cartões e pelo
// Artie — as regras de negócio (transferência com invoice_month, Acerto de
// Saldo, diferença para o mês seguinte, agendamento com auto_confirm) precisam
// ser idênticas nos dois caminhos.

import { supabase } from '../supabase';
import { format, addMonths, parseISO } from 'date-fns';

export const ACERTO_SALDO_CATEGORY_NAME = 'Acerto de Saldo';

/** Get-or-create da categoria raiz "Acerto de Saldo" */
export async function getAcertoSaldoCategoryId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('financial_categories')
    .select('id')
    .eq('user_id', userId)
    .eq('name', ACERTO_SALDO_CATEGORY_NAME)
    .is('parent_id', null)
    .maybeSingle();

  if (error) {
    console.error(error);
    return null;
  }
  if (data) return data.id;

  const { data: created, error: createError } = await supabase
    .from('financial_categories')
    .insert({ user_id: userId, name: ACERTO_SALDO_CATEGORY_NAME, icon: '⚖️' })
    .select('id')
    .single();

  if (createError) {
    console.error(createError);
    return null;
  }
  return created.id;
}

export interface PagarFaturaInput {
  cardId: string;
  invoiceMonth: string;   // 'YYYY-MM'
  invoiceTotal: number;   // total calculado da fatura
  amount: number;         // valor efetivamente pago
  paymentDate: string;    // 'YYYY-MM-DD'
  paymentAccountId: string;
}

export interface PagarFaturaResult {
  data: { isFutureDate: boolean } | null;
  /** Positivo = fatura reduzida (pagou menos que o total); negativo = aumentada */
  diff: number;
  error: Error | null;
}

/**
 * Escritas 1 e 2 do fechamento: a transferência de pagamento (agendada quando a
 * data é futura — o cron diário de auto_confirm a confirma na data) e, quando o
 * valor difere do total, o lançamento de "Acerto de Saldo" na própria fatura.
 * A decisão sobre a diferença (Escrita 3) fica com o caller — ver
 * lancarDiferencaProximoMes.
 */
export async function pagarFatura(input: PagarFaturaInput): Promise<PagarFaturaResult> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { data: null, diff: 0, error: new Error('Usuário não autenticado') };
  const userId = userData.user.id;

  // Positivo = fatura foi reduzida (sobra crédito); negativo = fatura foi aumentada
  const diff = Math.round((input.invoiceTotal - input.amount) * 100) / 100;
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const isFutureDate = input.paymentDate > todayStr;

  const { error: transferError } = await supabase.from('financial_transactions').insert({
    user_id: userId,
    type: 'transfer',
    amount: input.amount,
    date: input.paymentDate,
    description: `Pagamento Fatura - ${input.invoiceMonth}`,
    account_id: input.paymentAccountId,      // origem (conta bancária)
    destination_account_id: input.cardId,    // destino (cartão)
    status: isFutureDate ? 'pending' : 'paid',
    paid_date: isFutureDate ? null : input.paymentDate,
    auto_confirm: isFutureDate,
    invoice_month: input.invoiceMonth,
  });

  if (transferError) return { data: null, diff, error: transferError };

  if (Math.abs(diff) >= 0.01) {
    const categoryId = await getAcertoSaldoCategoryId(userId);
    const { error: adjustError } = await supabase.from('financial_transactions').insert({
      user_id: userId,
      type: diff > 0 ? 'income' : 'expense',
      amount: Math.abs(diff),
      date: input.paymentDate,
      description: ACERTO_SALDO_CATEGORY_NAME,
      account_id: input.cardId,
      category_id: categoryId,
      status: 'paid',
      paid_date: input.paymentDate,
      invoice_month: input.invoiceMonth,
    });

    if (adjustError) return { data: null, diff, error: adjustError };
  }

  return { data: { isFutureDate }, diff, error: null };
}

/**
 * Escrita 3: quando a fatura foi reduzida e o usuário optou por não descartar,
 * lança a diferença como despesa pendente na fatura do mês seguinte.
 */
export async function lancarDiferencaProximoMes(
  cardId: string,
  amount: number,
  closedInvoiceMonth: string,
): Promise<{ error: Error | null }> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: new Error('Usuário não autenticado') };

  const invoiceDate = parseISO(`${closedInvoiceMonth}-01`);
  const nextInvoiceMonth = format(addMonths(invoiceDate, 1), 'yyyy-MM');
  const monthLabel = format(invoiceDate, 'MM/yy');
  const categoryId = await getAcertoSaldoCategoryId(userData.user.id);

  const { error } = await supabase.from('financial_transactions').insert({
    user_id: userData.user.id,
    type: 'expense',
    amount,
    date: `${nextInvoiceMonth}-01`,
    description: `Acerto de conta do mês ${monthLabel}`,
    account_id: cardId,
    category_id: categoryId,
    status: 'pending',
    invoice_month: nextInvoiceMonth,
  });

  return { error };
}
