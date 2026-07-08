// Artie — Tipos compartilhados entre frontend e executor de tools

// ─── Conversa ────────────────────────────────────────────────────────────────

export interface ArtieMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  toolCall?: ArtieToolCall;
  toolResult?: ArtieToolResult;
  /** Opções clicáveis (chips) exibidas quando o Artie pergunta algo via ask_user */
  options?: string[];
  createdAt: Date;
}

export type ArtieChatState =
  | 'idle'
  | 'recording'      // push-to-talk ativo
  | 'processing'     // áudio/texto sendo processado pelo backend
  | 'streaming'      // resposta chegando em streaming
  | 'awaiting_confirm'; // aguardando confirmação do usuário para executar tool

// ─── Tool Calling ─────────────────────────────────────────────────────────────

export interface ArtieToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface ArtieToolResult {
  success: boolean;
  requiresScope?: boolean;
  data?: any;
  error?: string;
}

// ─── Tools: Transações (Fase 1) ──────────────────────────────────────────────

export interface CreateTransactionArgs {
  description: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  date: string; // YYYY-MM-DD
  account_id?: string;
  /** Conta de destino — obrigatória (via guarda dura) quando type === 'transfer' */
  destination_account_id?: string;
  category_id?: string;
  modalidade?: 'unica' | 'parcelada' | 'recorrente';
  installment_total?: number;
  recurrence_period?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  recurrence_interval?: number;
  status?: 'pending' | 'paid';
}

export interface UpdateTransactionArgs {
  search_description?: string;
  search_date?: string;
  search_amount?: number;
  update_description?: string;
  update_amount?: number;
  update_date?: string;
  update_account_id?: string;
  update_category_id?: string;
  update_status?: 'pending' | 'paid';
}

export interface DeleteTransactionArgs {
  search_description: string;
  search_date?: string;
  search_amount?: number;
  scope?: 'this' | 'following' | 'all';
}

export interface ConfirmTransactionArgs {
  search_description: string;
  search_date?: string;
  search_amount?: number;
  confirm_date?: string; // Se não fornecida, usa hoje
}

export interface ListTransactionsArgs {
  limit?: number;
  date_from?: string;
  date_to?: string;
  type?: 'income' | 'expense' | 'transfer';
  category_name?: string;
  status?: 'pending' | 'paid';
  /** true = apenas pendentes com data anterior a hoje (contas em atraso), sem limite inferior de data */
  overdue_only?: boolean;
}

export interface GetInvoiceSummaryArgs {
  /** Nome do cartão (busca parcial). Com um único cartão cadastrado, pode omitir */
  card_name?: string;
  /** 'YYYY-MM'. Default: fatura corrente do cartão */
  invoice_month?: string;
}

export interface PayCreditCardInvoiceArgs {
  card_name?: string;
  invoice_month?: string;
  /** Valor efetivamente pago (pode diferir do total da fatura) */
  amount: number;
  /** 'YYYY-MM-DD' — hoje/passado = pago; futura = agendado com confirmação automática */
  payment_date: string;
  /** Nome da conta bancária pagadora (busca parcial) */
  payment_account_name?: string;
  /** Obrigatório quando amount < total: o que fazer com a diferença */
  difference_action?: 'discard' | 'next_month';
}

export interface AskUserArgs {
  /** Pergunta curta feita ao usuário para coletar um dado que falta */
  question: string;
  /** 2 a 6 opções clicáveis (nomes de entidades). Ausente = resposta livre */
  options?: string[];
}

export interface GetAccountBalanceArgs {
  /** Nome da conta (busca parcial). Omita para somar todas as contas bancárias/carteiras. */
  account_name?: string;
  /** Data de corte YYYY-MM-DD. Padrão: último dia do mês atual. */
  as_of_date?: string;
  /** true = só lançamentos pagos; false (padrão) = saldo projetado, incluindo pendentes. */
  only_confirmed?: boolean;
}

// ─── Risco de Ações ──────────────────────────────────────────────────────────

export type ActionRisk = 'low' | 'medium' | 'high';

export interface PendingAction {
  toolName: string;
  args: Record<string, unknown>;
  risk: ActionRisk;
  confirmationMessage: string;       // "Criar lançamento de R$87 em Mercado?"
  requiresDoubleConfirm: boolean;    // true para ações 🔴
  doubleConfirmPhrase?: string;      // Frase exata a digitar para ações 🔴
}

// ─── Memória do Usuário ───────────────────────────────────────────────────────

export interface ArtieUserMemory {
  conversation_tone: 'casual' | 'normal' | 'tecnico';
  budget_limits: Record<string, number>; // { category_id: limit_value }
  spending_averages: Record<string, number>;
  proactive_alerts: boolean;
  alert_threshold_pct: number;
}

// ─── Contexto de Entidades ────────────────────────────────────────────────────
// Enviado ao backend junto com a mensagem para que o Gemini conheça
// as entidades reais do usuário antes de emitir um tool_call.

export interface ArtieEntityContext {
  accounts: Array<{ id: string; name: string; type: string; is_default?: boolean }>;
  categories: Array<{ id: string; name: string; type?: string }>;
  /** Dicas aprendidas do histórico: descrição normalizada → categoria mais usada */
  category_hints?: Array<{ description: string; category: string }>;
  credit_cards: Array<{
    id: string;
    name: string;
    closing_day: number;
    due_day: number;
    limit: number;
    current_balance: number;
  }>;
}

// ─── Request/Response do Backend ─────────────────────────────────────────────

export interface ArtieChatRequest {
  messages: Array<{ role: 'user' | 'model'; content: string }>;
  entity_context: ArtieEntityContext;
  user_memory?: Partial<ArtieUserMemory>;
  session_id: string;
}

export interface ArtieChatResponse {
  success: boolean;
  reply?: string;           // Resposta textual do Artie
  tool_call?: ArtieToolCall; // Tool a ser executada (se houver)
  error?: string;
}
