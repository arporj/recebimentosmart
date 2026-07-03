// ArtieProvider — Context que gerencia o estado da conversa com o Artie
// Responsável por: histórico de mensagens, estado do chat, entidades do usuário,
// comunicação com o backend e dispatch das execuções de tools.

import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { executeArtieToolCall } from '../../../lib/artie/executor';
import type {
  ArtieMessage,
  ArtieChatState,
  ArtieEntityContext,
  ArtieUserMemory,
  PendingAction,
  ArtieToolCall,
} from '../../../lib/artie/types';
import type { PendingScopeAction } from './ArtieConfirmCard';
import { toast } from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';

// ─── Mapeamento de nível de risco por tool ────────────────────────────────────

const TOOL_RISK: Record<string, PendingAction['risk']> = {
  create_transaction: 'low',
  confirm_transaction: 'low',
  update_transaction: 'medium',
  delete_transaction: 'high',
  list_transactions: 'low',
};

const TOOL_LABELS: Record<string, string> = {
  create_transaction: 'Criar lançamento',
  confirm_transaction: 'Confirmar lançamento',
  update_transaction: 'Alterar lançamento',
  delete_transaction: 'Excluir lançamento',
  list_transactions: 'Consultar lançamentos',
};

// ─── Context Types ────────────────────────────────────────────────────────────

interface ArtieContextValue {
  isOpen: boolean;
  openArtie: () => void;
  closeArtie: () => void;
  toggleArtie: () => void;

  messages: ArtieMessage[];
  chatState: ArtieChatState;
  pendingAction: PendingAction | null;
  pendingScopeAction: PendingScopeAction | null;

  sendTextMessage: (text: string) => Promise<void>;
  sendAudio: (audioBlob: Blob, mimeType: string) => Promise<void>;
  confirmPendingAction: () => Promise<void>;
  confirmScopeAction: (scope: 'this' | 'following') => Promise<void>;
  cancelPendingAction: () => void;
  clearHistory: () => void;

  entityContext: ArtieEntityContext;
  userMemory: Partial<ArtieUserMemory> | null;
}

const ArtieContext = createContext<ArtieContextValue | null>(null);

export function useArtie(): ArtieContextValue {
  const ctx = useContext(ArtieContext);
  if (!ctx) throw new Error('useArtie deve ser usado dentro de <ArtieProvider>');
  return ctx;
}

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
        supabase.from('financial_accounts').select('id, name, type').eq('user_id', user.id).eq('is_active', true),
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

  useEffect(() => {
    if (user) {
      loadEntityContext();
      loadUserMemory();
    }
  }, [user, loadEntityContext, loadUserMemory]);

  // Recarregar entidades quando uma transação é criada/alterada
  useEffect(() => {
    const handler = () => loadEntityContext();
    window.addEventListener('transaction_created', handler);
    return () => window.removeEventListener('transaction_created', handler);
  }, [loadEntityContext]);

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const addMessage = useCallback((msg: Omit<ArtieMessage, 'id' | 'createdAt'>): ArtieMessage => {
    const full: ArtieMessage = { ...msg, id: uuidv4(), createdAt: new Date() };
    setMessages(prev => [...prev, full]);
    return full;
  }, []);

  const buildApiMessages = useCallback(() =>
    messagesRef.current
      .filter(m => m.role === 'user' || m.role === 'model')
      .map(m => ({
        role: m.role,
        content: m.content,
        tool_call: m.toolCall,
        tool_result: m.toolResult,
      }))
      .slice(-15),
  []);

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
        messages: buildApiMessages(),
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
        await handleToolCall(result.tool_call, userText);
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

  const handleToolCall = useCallback(async (toolCall: ArtieToolCall, originalUserText?: string) => {
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
    if (toolCall.name === 'list_transactions') {
      const followUp = buildApiMessages();
      followUp.push({
        role: 'user',
        content: `[RESULTADO DA TOOL list_transactions]: ${JSON.stringify(result.data)}. Formule uma resposta clara para o usuário com base nesses dados.`,
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
      addMessage({ role: 'model', content: finalResult.reply || 'Aqui estão os dados solicitados.', toolCall, toolResult: result });
    } else {
      // Criar/confirmar/editar/deletar avulso: mensagem de sucesso direta
      addMessage({ role: 'model', content: buildSuccessMessage(toolCall, result.data), toolCall, toolResult: result });
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
    setMessages([]);
    setPendingAction(null);
    setChatState('idle');
  }, []);

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

function buildConfirmationMessage(toolCall: ArtieToolCall): string {
  const { name, args } = toolCall;
  switch (name) {
    case 'update_transaction':
      return `Quero alterar o lançamento **"${args.search_description}"**. Confirma?`;
    case 'delete_transaction':
      return `⚠️ Vou **excluir** o lançamento **"${args.search_description}"**. Essa ação não poderá ser desfeita. Confirma?`;
    default:
      return `Posso prosseguir com a ação **${TOOL_LABELS[name] || name}**?`;
  }
}

function buildSuccessMessage(toolCall: ArtieToolCall, data: any): string {
  const { name, args } = toolCall;
  switch (name) {
    case 'create_transaction': {
      const modalidade = args.modalidade || 'unica';
      const amountStr = Number(args.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      if (modalidade === 'parcelada' && args.installment_total) {
        return `✅ Lançamento **"${args.description}"** de R$ ${amountStr} (${args.installment_total}x parceladas) registrado com sucesso!`;
      }
      if (modalidade === 'recorrente') {
        const periodMap: Record<string, string> = { daily: 'diário', weekly: 'semanal', monthly: 'mensal', yearly: 'anual' };
        const periodLabel = periodMap[String(args.recurrence_period || 'monthly')] || 'recorrente';
        return `✅ Lançamento recorrente **"${args.description}"** de R$ ${amountStr} (${periodLabel}) registrado com sucesso!`;
      }
      return `✅ Lançamento **"${args.description}"** de R$ ${amountStr} registrado com sucesso!`;
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
