// ArtieProvider — Context que gerencia o estado da conversa com o Artie
// Responsável por: histórico de mensagens, estado do chat, entidades do usuário,
// comunicação com o backend e dispatch das execuções de tools.

import { useState, useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { executeArtieToolCall } from '../../../lib/artie/executor';
import { resolveCreateTransactionArgs, getAccountInfo } from '../../../lib/artie/slotGuard';
import type {
  ArtieMessage,
  ArtieChatState,
  ArtieEntityContext,
  ArtieUserMemory,
  PendingAction,
  ArtieToolCall,
  AskUserArgs,
  CreateTransactionArgs,
} from '../../../lib/artie/types';
import type { PendingScopeAction } from './ArtieConfirmCard';
import { ArtieContext, type ArtieContextValue } from './ArtieContext';
import { v4 as uuidv4 } from 'uuid';

// ─── Provider ────────────────────────────────────────────────────────────────

export function ArtieProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ArtieMessage[]>([]);
  const [chatState, setChatState] = useState<ArtieChatState>('idle');
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [pendingScopeAction, setPendingScopeAction] = useState<PendingScopeAction | null>(null);
  const [entityContext, setEntityContext] = useState<ArtieEntityContext>({ accounts: [], categories: [], credit_cards: [] });
  const [userMemory, setUserMemory] = useState<Partial<ArtieUserMemory> | null>(null);
  const [sessionId] = useState(() => uuidv4());

  const messagesRef = useRef<ArtieMessage[]>([]);
  messagesRef.current = messages;

  // ─── Carregar entidades do usuário ──────────────────────────────────────────

  const loadEntityContext = useCallback(async () => {
    if (!user) return;
    try {
      const [accountsRes, categoriesRes, cardsRes] = await Promise.all([
        supabase.from('financial_accounts').select('id, name, type, is_default').eq('user_id', user.id).eq('is_active', true),
        supabase.from('financial_categories').select('id, name').eq('user_id', user.id),
        supabase.from('financial_accounts').select('id, name, credit_limit, due_day, closing_days_before')
          .eq('user_id', user.id).eq('type', 'credit_card').eq('is_active', true),
      ]);

      setEntityContext({
        accounts: accountsRes.data || [],
        categories: categoriesRes.data || [],
        credit_cards: (cardsRes.data || []).map(c => ({
          id: c.id,
          name: c.name,
          closing_day: c.closing_days_before || 5,
          due_day: c.due_day || 10,
          limit: c.credit_limit || 0,
          current_balance: 0, // Calculado separadamente se necessário
        })),
      });
    } catch (err) {
      console.error('[Artie] Erro ao carregar entidades:', err);
    }
  }, [user]);

  // ─── Carregar memória do usuário ────────────────────────────────────────────

  const loadUserMemory = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('artie_user_memory')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle(); // maybeSingle retorna null sem erro quando não há linha ainda
      if (data) setUserMemory(data);
    } catch {
      // Tabela pode não existir ainda — silencioso
    }
  }, [user]);

  // ─── Histórico persistente (artie_messages) ─────────────────────────────────

  const HISTORY_LOAD_LIMIT = 30;

  const loadHistory = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('artie_messages')
        .select('id, role, content, tool_call, tool_result, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(HISTORY_LOAD_LIMIT);

      // Só aplica se a conversa ainda estiver vazia (evita clobber se o usuário já digitou)
      if (data && data.length > 0 && messagesRef.current.length === 0) {
        const restored: ArtieMessage[] = data.reverse().map((r: any) => ({
          id: r.id,
          role: r.role,
          content: r.content,
          toolCall: r.tool_call || undefined,
          toolResult: r.tool_result || undefined,
          // Chips de ask_user são restaurados a partir dos args do tool_call
          options: r.tool_call?.name === 'ask_user' && Array.isArray(r.tool_call?.args?.options)
            ? r.tool_call.args.options
            : undefined,
          createdAt: new Date(r.created_at),
        }));
        messagesRef.current = restored;
        setMessages(restored);
      }
    } catch {
      // Histórico é conveniência — falha silenciosa não bloqueia o chat
    }
  }, [user]);

  const persistMessage = useCallback((msg: ArtieMessage) => {
    if (!user) return;
    // Resultados de consultas podem ser grandes (até 200 lançamentos) e só servem
    // ao contexto da sessão corrente — não vale persistir.
    const isQueryResult = msg.toolCall?.name === 'list_transactions' || msg.toolCall?.name === 'get_account_balance';
    supabase
      .from('artie_messages')
      .insert({
        id: msg.id,
        user_id: user.id,
        session_id: sessionId,
        role: msg.role,
        content: msg.content,
        tool_call: msg.toolCall ?? null,
        tool_result: isQueryResult ? null : (msg.toolResult ?? null),
      })
      .then(({ error }) => {
        if (error) console.warn('[Artie] Falha ao persistir mensagem:', error.message);
      });
  }, [user, sessionId]);

  useEffect(() => {
    if (user) {
      loadEntityContext();
      loadUserMemory();
      loadHistory();
    }
  }, [user, loadEntityContext, loadUserMemory, loadHistory]);

  // Recarregar entidades quando uma transação é criada/alterada
  useEffect(() => {
    const handler = () => loadEntityContext();
    window.addEventListener('transaction_created', handler);
    return () => window.removeEventListener('transaction_created', handler);
  }, [loadEntityContext]);

  // Recarregar memória quando o usuário mudar preferências do Artie (ex: tom de conversa)
  useEffect(() => {
    const handler = () => loadUserMemory();
    window.addEventListener('artie_memory_updated', handler);
    return () => window.removeEventListener('artie_memory_updated', handler);
  }, [loadUserMemory]);

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const addMessage = useCallback((msg: Omit<ArtieMessage, 'id' | 'createdAt'>): ArtieMessage => {
    const full: ArtieMessage = { ...msg, id: uuidv4(), createdAt: new Date() };
    const next = [...messagesRef.current, full];
    messagesRef.current = next;
    setMessages(next);
    persistMessage(full);
    return full;
  }, [persistMessage]);

  const buildApiMessages = useCallback((currentUserText?: string) => {
    const list = messagesRef.current
      .filter(m => m.role === 'user' || m.role === 'model')
      .map(m => ({
        role: m.role,
        content: m.content,
        tool_call: m.toolCall,
        tool_result: m.toolResult,
      }));

    if (currentUserText && (list.length === 0 || list[list.length - 1].content !== currentUserText)) {
      list.push({ role: 'user', content: currentUserText });
    }

    return list.slice(-15);
  }, []);

  // ─── Chamada ao backend ──────────────────────────────────────────────────────

  const callBackend = useCallback(async (
    userText?: string,
    audioBlob?: Blob,
    audioMimeType?: string,
  ) => {
    if (!user) return;

    setChatState('processing');

    try {
      const body: Record<string, unknown> = {
        messages: buildApiMessages(userText),
        entity_context: entityContext,
        user_memory: userMemory,
        session_id: sessionId,
      };

      if (audioBlob) {
        const base64 = await blobToBase64(audioBlob);
        body.audio_base64 = base64;
        body.audio_mime_type = audioMimeType || 'audio/webm';
      }

      const resp = await fetch('/api/artie/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const result = await resp.json();

      if (!result.success) {
        addMessage({ role: 'model', content: result.error || 'Ocorreu um erro. Tente novamente.' });
        setChatState('idle');
        return;
      }

      // Tool call recebida
      if (result.tool_call) {
        await handleToolCall(result.tool_call);
        return;
      }

      // Resposta textual
      addMessage({ role: 'model', content: result.reply });
      setChatState('idle');
    } catch (err: any) {
      console.error('[Artie] Erro na chamada ao backend:', err);
      addMessage({ role: 'model', content: 'Não consegui me conectar. Verifique sua conexão.' });
      setChatState('idle');
    }
  }, [user, buildApiMessages, entityContext, userMemory, sessionId, addMessage]);

  // ─── Gerenciamento de Tool Calls ─────────────────────────────────────────────

  const handleToolCall = useCallback(async (toolCall: ArtieToolCall, depth = 0) => {
    // ask_user (slot filling): renderiza a pergunta com chips clicáveis — nada é executado no banco.
    // A resposta do usuário (chip, texto ou voz) volta como mensagem comum e a conversa continua.
    if (toolCall.name === 'ask_user') {
      const args = toolCall.args as unknown as AskUserArgs;
      const question = typeof args.question === 'string' && args.question.trim()
        ? args.question.trim()
        : 'Pode me dar mais detalhes?';
      const options = Array.isArray(args.options)
        ? args.options.filter((o): o is string => typeof o === 'string' && !!o.trim()).slice(0, 6)
        : [];
      addMessage({ role: 'model', content: question, options: options.length ? options : undefined, toolCall });
      setChatState('idle');
      return;
    }

    // Guarda dura: conta/categoria obrigatórias mesmo que o modelo ignore o `required`
    // da declaração; converte nome→id e re-pergunta localmente com chips quando falta algo.
    if (toolCall.name === 'create_transaction') {
      const check = resolveCreateTransactionArgs(toolCall.args as unknown as CreateTransactionArgs, entityContext);
      if (!check.ok) {
        addMessage({ role: 'model', content: check.question, options: check.options });
        setChatState('idle');
        return;
      }
      toolCall = { ...toolCall, args: check.args as unknown as Record<string, unknown> };
    }

    setChatState('processing');
    const result = await executeArtieToolCall(user!.id, toolCall);

    if (!result.success) {
      addMessage({ role: 'model', content: result.error || 'Não foi possível executar.', toolCall, toolResult: result });
      setChatState('idle');
      return;
    }

    // Se for deleção de lançamento recorrente/parcelado que exige escolha de escopo
    if (result.requiresScope && result.data) {
      setPendingScopeAction(result.data);
      setChatState('awaiting_confirm');
      return;
    }

    // Para consultas, devolver o resultado ao Gemini para formular resposta
    if (toolCall.name === 'list_transactions' || toolCall.name === 'get_account_balance') {
      const isBalance = toolCall.name === 'get_account_balance';
      const followUp = buildApiMessages();
      followUp.push({
        role: 'user',
        content: `[RESULTADO DA TOOL ${toolCall.name}]: ${JSON.stringify(result.data)}. ${
          isBalance
            ? 'Use este saldo exatamente como retornado (não recalcule) para responder de forma direta e curta.'
            : 'Se o objetivo do usuário for alterar, deletar ou mudar o status de um lançamento (ex: "marcar como não pago", "alterar para pendente", "mudar valor"), chame a tool correspondente (ex: update_transaction). Se for apenas uma dúvida ou consulta, formule uma resposta clara em português.'
        }`,
      });

      const resp = await fetch('/api/artie/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: followUp,
          entity_context: entityContext,
          user_memory: userMemory,
          session_id: sessionId,
        }),
      });
      const finalResult = await resp.json();

      // O modelo pode encadear outra ação após ver o resultado da consulta
      // (ex: listar as contas em atraso e então confirmar a única encontrada).
      // Sem isso, o tool_call do follow-up era descartado e caía no fallback.
      if (finalResult.success && finalResult.tool_call && depth < 3) {
        // Passo intermediário: mostrar apenas o que foi encontrado, sem a pergunta
        // de fechamento — a próxima ação já vem em seguida, nada está sendo perguntado.
        const foundItems = !isBalance ? formatTransactionItems(result.data) : '';
        if (foundItems) {
          addMessage({ role: 'model', content: `🔎 Encontrei:\n\n${foundItems}`, toolCall, toolResult: result });
        }
        await handleToolCall(finalResult.tool_call, depth + 1);
        return;
      }

      const finalReply = isBalance
        ? (finalResult.reply || formatBalanceFallback(result.data))
        : formatTransactionsFallback(result.data, finalResult.reply);
      addMessage({ role: 'model', content: finalReply, toolCall, toolResult: result });
    } else {
      // Criar/confirmar/editar/deletar avulso: mensagem de sucesso direta
      const accountInfo = toolCall.name === 'create_transaction'
        ? getAccountInfo((toolCall.args as { account_id?: string }).account_id, entityContext)
        : undefined;
      addMessage({ role: 'model', content: buildSuccessMessage(toolCall, result.data, accountInfo), toolCall, toolResult: result });
    }

    setChatState('idle');
  }, [user, buildApiMessages, entityContext, userMemory, sessionId, addMessage]);

  // ─── Confirmar / Escolher Escopo em Recorrentes ────────────────────────────────

  const confirmScopeAction = useCallback(async (scope: 'this' | 'following') => {
    if (!pendingScopeAction || !user) return;

    setChatState('processing');
    const toolCall: ArtieToolCall = {
      name: 'delete_transaction',
      args: {
        search_description: pendingScopeAction.search_description,
        search_date: pendingScopeAction.search_date,
        search_amount: pendingScopeAction.search_amount,
        scope,
      },
    };

    const result = await executeArtieToolCall(user.id, toolCall);
    if (!result.success) {
      addMessage({ role: 'model', content: `❌ ${result.error}`, toolCall, toolResult: result });
    } else {
      addMessage({
        role: 'model',
        content: buildSuccessMessage(toolCall, result.data),
        toolCall,
        toolResult: result,
      });
    }

    setPendingScopeAction(null);
    setChatState('idle');
  }, [pendingScopeAction, user, addMessage]);

  // ─── Confirmar ação pendente ──────────────────────────────────────────────────

  const confirmPendingAction = useCallback(async () => {
    if (!pendingAction || !user) return;

    setChatState('processing');
    const result = await executeArtieToolCall(user.id, {
      name: pendingAction.toolName,
      args: pendingAction.args,
    });

    if (!result.success) {
      addMessage({ role: 'model', content: `❌ ${result.error}`, toolCall: { name: pendingAction.toolName, args: pendingAction.args }, toolResult: result });
    } else {
      addMessage({ role: 'model', content: buildSuccessMessage({ name: pendingAction.toolName, args: pendingAction.args }, result.data), toolCall: { name: pendingAction.toolName, args: pendingAction.args }, toolResult: result });
    }

    setPendingAction(null);
    setChatState('idle');
  }, [pendingAction, user, addMessage]);

  const cancelPendingAction = useCallback(() => {
    addMessage({ role: 'model', content: 'Tudo bem, exclusão cancelada.' });
    setPendingAction(null);
    setPendingScopeAction(null);
    setChatState('idle');
  }, [addMessage]);

  // ─── API Pública ─────────────────────────────────────────────────────────────

  const sendTextMessage = useCallback(async (text: string) => {
    if (!text.trim() || chatState === 'processing') return;

    addMessage({ role: 'user', content: text });

    // Se houver ação pendente aguardando resposta do usuário
    if (pendingAction) {
      const norm = text.toLowerCase().trim();
      const isAff = ['sim', 'pode', 'confirma', 'confirmar', 'excluir', 'apagar', 'ok', 'pode sim', 'sim, confirma', 'exclui'].some(k => norm.includes(k));
      const isNeg = ['não', 'nao', 'cancela', 'cancelar', 'deixa pra lá', 'deixa pra la', 'não quero', 'nao quero'].some(k => norm.includes(k));

      if (isAff) {
        await confirmPendingAction();
        return;
      }
      if (isNeg) {
        cancelPendingAction();
        return;
      }
    }

    await callBackend(text);
  }, [addMessage, callBackend, chatState, pendingAction, confirmPendingAction, cancelPendingAction]);

  const sendAudio = useCallback(async (audioBlob: Blob, mimeType: string) => {
    if (chatState === 'processing') return;
    addMessage({ role: 'user', content: '🎙️ Mensagem de voz' });
    await callBackend(undefined, audioBlob, mimeType);
  }, [addMessage, callBackend, chatState]);

  const clearHistory = useCallback(() => {
    messagesRef.current = [];
    setMessages([]);
    setPendingAction(null);
    setChatState('idle');
    // Limpa também o histórico persistido — senão ele voltaria no próximo reload
    if (user) {
      supabase
        .from('artie_messages')
        .delete()
        .eq('user_id', user.id)
        .then(({ error }) => {
          if (error) console.warn('[Artie] Falha ao limpar histórico persistido:', error.message);
        });
    }
  }, [user]);

  const value: ArtieContextValue = {
    isOpen,
    openArtie: () => setIsOpen(true),
    closeArtie: () => setIsOpen(false),
    toggleArtie: () => setIsOpen(v => !v),
    messages,
    chatState,
    pendingAction,
    pendingScopeAction,
    sendTextMessage,
    sendAudio,
    confirmPendingAction,
    confirmScopeAction,
    cancelPendingAction,
    clearHistory,
    entityContext,
    userMemory,
  };

  return <ArtieContext.Provider value={value}>{children}</ArtieContext.Provider>;
}

// ─── Utilitários ─────────────────────────────────────────────────────────────

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function buildSuccessMessage(
  toolCall: ArtieToolCall,
  data: any,
  accountInfo?: { name: string; isCreditCard: boolean },
): string {
  const { name, args } = toolCall;
  switch (name) {
    case 'create_transaction': {
      const modalidade = args.modalidade || 'unica';
      const amountStr = Number(args.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const where = accountInfo
        ? (accountInfo.isCreditCard ? ` no cartão **${accountInfo.name}**` : ` na conta **${accountInfo.name}**`)
        : '';
      if (modalidade === 'parcelada' && args.installment_total) {
        return `✅ Lançamento **"${args.description}"** de R$ ${amountStr} (${args.installment_total}x parceladas) registrado${where} com sucesso!`;
      }
      if (modalidade === 'recorrente') {
        const periodMap: Record<string, string> = { daily: 'diário', weekly: 'semanal', monthly: 'mensal', yearly: 'anual' };
        const periodLabel = periodMap[String(args.recurrence_period || 'monthly')] || 'recorrente';
        return `✅ Lançamento recorrente **"${args.description}"** de R$ ${amountStr} (${periodLabel}) registrado${where} com sucesso!`;
      }
      return `✅ Lançamento **"${args.description}"** de R$ ${amountStr} registrado${where} com sucesso!`;
    }
    case 'confirm_transaction':
      return `✅ Lançamento **"${data?.description || args.search_description}"** marcado como pago com sucesso!`;
    case 'update_transaction':
      return `✅ Lançamento **"${data?.description || args.search_description}"** atualizado com sucesso!`;
    case 'delete_transaction': {
      if (data?.scope === 'following') {
        return `🗑️ Lançamento **"${data?.description || args.search_description}"** e as próximas ocorrências foram excluídos com sucesso.`;
      }
      return `🗑️ Lançamento **"${data?.description || args.search_description}"** excluído com sucesso.`;
    }
    default:
      return '✅ Ação executada com sucesso!';
  }
}

function formatBalanceFallback(data: any): string {
  const total = Number(data?.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `Seu saldo${data?.only_confirmed ? ' confirmado' : ' projetado'} é de R$ ${total}.`;
}

/** Lista formatada (até 5 itens) do resultado de list_transactions; '' se vazio */
function formatTransactionItems(data: any): string {
  // O executor de list_transactions retorna { transactions, total, count, period }
  const transactions: Array<{ description?: string; amount?: number; date?: string; status?: string }> =
    Array.isArray(data) ? data : (data?.transactions || []);
  return transactions.slice(0, 5).map(tx => {
    const val = Number(Math.abs(tx.amount || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const st = tx.status === 'paid' ? 'Pago' : 'Pendente';
    const dateStr = tx.date ? tx.date.split('-').reverse().join('/') : '';
    return `• **${tx.description}**: R$ ${val} (${dateStr}) — *${st}*`;
  }).join('\n');
}

function formatTransactionsFallback(data: any, originalReply?: string): string {
  if (originalReply && originalReply.trim() && !originalReply.includes('Aqui estão os dados solicitados')) {
    return originalReply;
  }
  const items = formatTransactionItems(data);
  if (!items) {
    // Nunca atribuir o período ao usuário: informar qual intervalo foi buscado e oferecer ampliar
    const period = !Array.isArray(data) && typeof data?.period === 'string'
      ? ` entre ${formatPeriodBR(data.period)}`
      : '';
    return `Não encontrei nenhum lançamento${period}. Quer que eu amplie a busca ou procure entre as contas em atraso?`;
  }
  return `Aqui estão os lançamentos encontrados:\n\n${items}\n\nDeseja realizar alguma alteração nesses lançamentos? (ex: marcar como pendente/pago, alterar valor ou excluir)`;
}

/** 'YYYY-MM-DD a YYYY-MM-DD' → 'DD/MM/YYYY e DD/MM/YYYY' */
function formatPeriodBR(period: string): string {
  const [from, to] = period.split(' a ');
  const br = (d?: string) => (d ? d.split('-').reverse().join('/') : '');
  return to ? `${br(from)} e ${br(to)}` : br(from);
}
