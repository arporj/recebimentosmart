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

/** Descrição fixa do acerto lançado na fatura do mês seguinte (ver lancarDiferencaProximoMes). */
function descricaoAcertoProximoMes(closedInvoiceMonth: string): string {
  return `Acerto de conta do mês ${format(parseISO(`${closedInvoiceMonth}-01`), 'MM/yy')}`;
}

export interface AcertoRow {
  id: string;
  type: string;
  amount: number;
  status: string;
}

/**
 * Total ORIGINAL da fatura: o total exibido menos o efeito dos Acertos de Saldo já lançados
 * (despesa soma ao total, receita subtrai). É a base de cálculo da edição — usar o total
 * exibido direto faria a diferença ser calculada sobre um valor que já embute o acerto
 * anterior, empilhando acertos a cada edição.
 */
export function calcularTotalOriginalFatura(invoiceTotal: number, acertos: AcertoRow[]): number {
  const efeito = acertos.reduce(
    (sum, r) => sum + (r.type === 'expense' ? Number(r.amount) : -Number(r.amount)),
    0,
  );
  return Math.round((invoiceTotal - efeito) * 100) / 100;
}

/**
 * Lançamentos de "Acerto de Saldo" já existentes dentro de uma fatura. São identificados
 * pela descrição fixa gravada por pagarFatura — pode haver mais de um quando a fatura foi
 * reaberta e fechada de novo por versões antigas do fluxo.
 */
async function buscarAcertosDaFatura(
  userId: string,
  cardId: string,
  invoiceMonth: string,
): Promise<{ rows: AcertoRow[]; error: Error | null }> {
  const { data, error } = await supabase
    .from('financial_transactions')
    .select('id, type, amount, status')
    .eq('user_id', userId)
    .eq('account_id', cardId)
    .eq('invoice_month', invoiceMonth)
    .eq('description', ACERTO_SALDO_CATEGORY_NAME)
    .order('created_at', { ascending: true });

  // Falhar aqui é obrigatório: tratar o erro como "nenhum acerto" faria a edição calcular a
  // diferença sobre um total contaminado e criar um segundo Acerto de Saldo na fatura.
  if (error) return { rows: [], error };
  return { rows: (data || []) as AcertoRow[], error: null };
}

export interface EditarFaturaInput {
  transferId: string;      // transferência de pagamento já existente
  cardId: string;
  invoiceMonth: string;    // 'YYYY-MM'
  /** Total da fatura como exibido hoje — INCLUI os Acertos de Saldo já lançados. */
  invoiceTotal: number;
  amount: number;          // novo valor do pagamento
  paymentDate: string;     // nova data
  paymentAccountId: string;
}

export interface EditarFaturaResult {
  data: { isFutureDate: boolean } | null;
  /** Positivo = fatura reduzida (pagou menos que o total); negativo = aumentada */
  diff: number;
  /** true quando já existia um acerto no mês seguinte e ele foi atualizado/removido aqui. */
  nextMonthHandled: boolean;
  /** true quando o acerto do mês seguinte já estava pago e por isso não foi tocado. */
  nextMonthLocked: boolean;
  error: Error | null;
}

/**
 * Edita uma fatura já fechada (valor, data e conta de pagamento) sem exigir reabertura.
 *
 * Diferente de pagarFatura, esta operação é IDEMPOTENTE: ela recalcula a diferença sobre o
 * total ORIGINAL da fatura (descontando os Acertos de Saldo criados no fechamento anterior) e
 * então atualiza/cria/remove um único Acerto de Saldo. Sem isso, editar duas vezes empilharia
 * acertos e contaminaria a base de cálculo — exatamente o que acontecia no ciclo
 * reabrir → fechar de novo.
 */
export async function editarFatura(input: EditarFaturaInput): Promise<EditarFaturaResult> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { data: null, diff: 0, nextMonthHandled: false, nextMonthLocked: false, error: new Error('Usuário não autenticado') };
  }
  const userId = userData.user.id;
  const fail = (error: Error): EditarFaturaResult =>
    ({ data: null, diff: 0, nextMonthHandled: false, nextMonthLocked: false, error });

  // Base de cálculo: o total exibido menos o efeito dos acertos já lançados nesta fatura.
  const { rows: acertos, error: acertosError } = await buscarAcertosDaFatura(userId, input.cardId, input.invoiceMonth);
  if (acertosError) return fail(acertosError);
  const baseTotal = calcularTotalOriginalFatura(input.invoiceTotal, acertos);
  const diff = Math.round((baseTotal - input.amount) * 100) / 100;

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const isFutureDate = input.paymentDate > todayStr;

  // 1) A transferência de pagamento. Mesma regra do fechamento: data futura vira agendamento
  // com auto_confirm; data de hoje ou passada já entra confirmada.
  const { error: transferError } = await supabase
    .from('financial_transactions')
    .update({
      amount: input.amount,
      date: input.paymentDate,
      account_id: input.paymentAccountId,
      status: isFutureDate ? 'pending' : 'paid',
      paid_date: isFutureDate ? null : input.paymentDate,
      auto_confirm: isFutureDate,
      invoice_month: input.invoiceMonth,
    })
    .eq('id', input.transferId)
    .eq('user_id', userId);

  if (transferError) return fail(transferError);

  // 2) O Acerto de Saldo da própria fatura: um só, ou nenhum quando o valor voltou ao total.
  const [manter, ...excedentes] = acertos;
  if (excedentes.length > 0) {
    const { error } = await supabase
      .from('financial_transactions')
      .delete()
      .in('id', excedentes.map(r => r.id));
    if (error) return fail(error);
  }

  if (Math.abs(diff) >= 0.01) {
    const categoryId = await getAcertoSaldoCategoryId(userId);
    const payload = {
      type: diff > 0 ? 'income' : 'expense',
      amount: Math.abs(diff),
      status: 'paid',
      category_id: categoryId,
    };

    // A data do acerto existente NÃO é alterada de propósito: a trigger
    // fn_trigger_calculate_invoice_month recalcula o invoice_month em qualquer UPDATE que mude
    // a date de um lançamento de cartão, o que moveria o acerto para outra fatura. Ele pertence
    // à fatura editada, não à data do pagamento.
    const { error } = manter
      ? await supabase.from('financial_transactions').update(payload).eq('id', manter.id).eq('user_id', userId)
      : await supabase.from('financial_transactions').insert({
          ...payload,
          user_id: userId,
          description: ACERTO_SALDO_CATEGORY_NAME,
          account_id: input.cardId,
          date: input.paymentDate,
          paid_date: input.paymentDate,
          invoice_month: input.invoiceMonth,
        });

    if (error) return fail(error);
  } else if (manter) {
    const { error } = await supabase.from('financial_transactions').delete().eq('id', manter.id).eq('user_id', userId);
    if (error) return fail(error);
  }

  // 3) O acerto lançado na fatura do mês seguinte, quando existir. Já pago = não se mexe.
  const nextInvoiceMonth = format(addMonths(parseISO(`${input.invoiceMonth}-01`), 1), 'yyyy-MM');
  const { data: proximoRows, error: proximoError } = await supabase
    .from('financial_transactions')
    .select('id, status')
    .eq('user_id', userId)
    .eq('account_id', input.cardId)
    .eq('invoice_month', nextInvoiceMonth)
    .eq('description', descricaoAcertoProximoMes(input.invoiceMonth));

  if (proximoError) return fail(proximoError);

  let nextMonthHandled = false;
  let nextMonthLocked = false;
  const proximo = (proximoRows || [])[0] as { id: string; status: string } | undefined;

  if (proximo) {
    nextMonthHandled = true;
    if (proximo.status === 'paid') {
      nextMonthLocked = true;
    } else if (diff >= 0.01) {
      const { error } = await supabase
        .from('financial_transactions')
        .update({ amount: diff })
        .eq('id', proximo.id)
        .eq('user_id', userId);
      if (error) return fail(error);
    } else {
      const { error } = await supabase
        .from('financial_transactions')
        .delete()
        .eq('id', proximo.id)
        .eq('user_id', userId);
      if (error) return fail(error);
    }
  }

  return { data: { isFutureDate }, diff, nextMonthHandled, nextMonthLocked, error: null };
}

export interface ReabrirFaturaResult {
  /** Quantos lançamentos de acerto foram removidos junto com a transferência. */
  removedAdjustments: number;
  /** true quando o acerto do mês seguinte já estava pago e por isso foi preservado. */
  nextMonthLocked: boolean;
  error: Error | null;
}

/**
 * Desfaz o fechamento: remove a transferência de pagamento E os acertos que o fechamento
 * criou (na própria fatura e, se ainda não pago, na fatura seguinte). Limpar os acertos é o
 * que garante que um novo fechamento parta do total real da fatura em vez de um total já
 * contaminado pelo acerto anterior.
 */
export async function reabrirFatura(
  transferId: string,
  cardId: string,
  invoiceMonth: string,
): Promise<ReabrirFaturaResult> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { removedAdjustments: 0, nextMonthLocked: false, error: new Error('Usuário não autenticado') };
  }
  const userId = userData.user.id;

  const { error: transferError } = await supabase
    .from('financial_transactions')
    .delete()
    .eq('id', transferId)
    .eq('user_id', userId);

  if (transferError) return { removedAdjustments: 0, nextMonthLocked: false, error: transferError };

  let removedAdjustments = 0;

  const { rows: acertos, error: acertosError } = await buscarAcertosDaFatura(userId, cardId, invoiceMonth);
  if (acertosError) return { removedAdjustments, nextMonthLocked: false, error: acertosError };
  if (acertos.length > 0) {
    const { error } = await supabase
      .from('financial_transactions')
      .delete()
      .in('id', acertos.map(r => r.id));
    if (error) return { removedAdjustments, nextMonthLocked: false, error };
    removedAdjustments += acertos.length;
  }

  const nextInvoiceMonth = format(addMonths(parseISO(`${invoiceMonth}-01`), 1), 'yyyy-MM');
  const { data: proximoRows, error: proximoError } = await supabase
    .from('financial_transactions')
    .select('id, status')
    .eq('user_id', userId)
    .eq('account_id', cardId)
    .eq('invoice_month', nextInvoiceMonth)
    .eq('description', descricaoAcertoProximoMes(invoiceMonth));

  if (proximoError) return { removedAdjustments, nextMonthLocked: false, error: proximoError };

  let nextMonthLocked = false;
  const naoPagos = (proximoRows || []).filter((r: { status: string }) => r.status !== 'paid');
  nextMonthLocked = (proximoRows || []).length > naoPagos.length;

  if (naoPagos.length > 0) {
    const { error } = await supabase
      .from('financial_transactions')
      .delete()
      .in('id', naoPagos.map((r: { id: string }) => r.id));
    if (error) return { removedAdjustments, nextMonthLocked, error };
    removedAdjustments += naoPagos.length;
  }

  return { removedAdjustments, nextMonthLocked, error: null };
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
  const categoryId = await getAcertoSaldoCategoryId(userData.user.id);

  const { error } = await supabase.from('financial_transactions').insert({
    user_id: userData.user.id,
    type: 'expense',
    amount,
    date: `${nextInvoiceMonth}-01`,
    description: descricaoAcertoProximoMes(closedInvoiceMonth),
    account_id: cardId,
    category_id: categoryId,
    status: 'pending',
    invoice_month: nextInvoiceMonth,
  });

  return { error };
}
