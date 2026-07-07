// ArtieDrawer — Interface principal do chat do Artie
// Drawer lateral que contém todo o histórico de conversa,
// o input de texto, o botão de voz (push-to-talk) e os cards de confirmação.

import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import { Bot, X, Trash2, Send, Loader2, Sparkles } from 'lucide-react';
import { useArtie } from './ArtieProvider';
import { ArtieMessageBubble } from './ArtieMessageBubble';
import { ArtieConfirmCard, ArtieScopeCard } from './ArtieConfirmCard';
import { ArtieVoiceInput } from './ArtieVoiceInput';

export function ArtieDrawer() {
  const {
    isOpen,
    closeArtie,
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
  } = useArtie();

  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isExecuting = chatState === 'processing';

  // Auto-scroll ao final das mensagens
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Focar input ao abrir
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || isExecuting) return;
    setInputText('');
    await sendTextMessage(text);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAudioReady = async (blob: Blob, mimeType: string) => {
    await sendAudio(blob, mimeType);
  };

  const isDisabled = isExecuting || chatState === 'awaiting_confirm';

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity"
          onClick={closeArtie}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <aside
        className={`
          fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm
          bg-slate-50 border-l border-slate-200 shadow-2xl
          flex flex-col
          transition-transform duration-300 ease-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
        aria-label="Assistente Artie"
      >
        {/* ─── Header ─────────────────────────────────────────────────────── */}
        <header className="flex items-center gap-3 px-4 py-3.5 bg-white border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="relative flex-shrink-0">
              <div className="w-9 h-9 rounded-full bg-teal-500 flex items-center justify-center shadow-sm">
                <Bot size={18} className="text-white" />
              </div>
              {/* Indicador de status */}
              <span className={`
                absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white
                ${chatState === 'idle' ? 'bg-teal-400' : 'bg-amber-400 animate-pulse'}
              `} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800">Artie</p>
              <p className="text-xs text-slate-400 truncate">
                {chatState === 'idle' && 'Pronto para ajudar'}
                {chatState === 'recording' && '🎙️ Ouvindo...'}
                {chatState === 'processing' && 'Pensando...'}
                {chatState === 'streaming' && 'Digitando...'}
                {chatState === 'awaiting_confirm' && 'Aguardando confirmação'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {messages.length > 0 && (
              <button
                onClick={clearHistory}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                title="Limpar conversa"
              >
                <Trash2 size={16} />
              </button>
            )}
            <button
              onClick={closeArtie}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              aria-label="Fechar Artie"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* ─── Messages Area ───────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">

          {/* Estado vazio */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 pb-12 gap-4">
              <div className="w-16 h-16 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center">
                <Sparkles size={28} className="text-teal-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-1">Olá! Eu sou o Artie</p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Posso registrar despesas, confirmar pagamentos, consultar seus gastos e muito mais. Fale ou digite o que precisar.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2 w-full mt-2">
                {[
                  'Registra um gasto de 45 reais no mercado hoje',
                  'Quanto gastei esse mês?',
                  'Confirma o aluguel de julho',
                ].map(suggestion => (
                  <button
                    key={suggestion}
                    onClick={() => sendTextMessage(suggestion)}
                    className="text-left text-xs text-teal-700 bg-teal-50 border border-teal-100 px-3 py-2 rounded-lg hover:bg-teal-100 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Mensagens */}
          {messages.map((msg, idx) => (
            <ArtieMessageBubble
              key={msg.id}
              message={msg}
              isLast={idx === messages.length - 1}
              disabled={isExecuting}
              onOptionSelect={opt => sendTextMessage(opt)}
            />
          ))}

          {/* Card de escolha de escopo (Recorrente/Parcelado) */}
          {pendingScopeAction && (
            <ArtieScopeCard
              scopeAction={pendingScopeAction}
              onSelectScope={confirmScopeAction}
              isExecuting={isExecuting}
            />
          )}

          {/* Card de confirmação */}
          {pendingAction && (
            <ArtieConfirmCard
              action={pendingAction}
              onConfirm={confirmPendingAction}
              onCancel={cancelPendingAction}
              isExecuting={isExecuting}
            />
          )}

          {/* Indicador de "digitando" */}
          {chatState === 'processing' && (
            <div className="flex gap-2.5 items-start">
              <div className="w-7 h-7 rounded-full bg-teal-500 flex items-center justify-center flex-shrink-0">
                <Bot size={14} className="text-white" />
              </div>
              <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-sm px-3.5 py-2.5 shadow-sm">
                <div className="flex gap-1 items-center h-5">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ─── Input Area ──────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 bg-white border-t border-slate-200 p-3">
          <div className="flex items-end gap-2">
            {/* Textarea */}
            <textarea
              ref={inputRef}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isDisabled ? 'Aguardando...' : 'Digite uma mensagem...'}
              disabled={isDisabled}
              rows={1}
              className={`
                flex-1 resize-none rounded-xl border text-sm px-3.5 py-2.5
                focus:outline-none focus:ring-2 focus:ring-teal-400/40 focus:border-teal-400
                transition-all max-h-32 overflow-y-auto
                ${isDisabled
                  ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300'
                }
              `}
              style={{ scrollbarWidth: 'none' }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = Math.min(el.scrollHeight, 128) + 'px';
              }}
            />

            {/* Botão enviar texto */}
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || isExecuting}
              className="
                flex-shrink-0 w-10 h-10 rounded-full bg-teal-500 flex items-center justify-center
                hover:bg-teal-600 active:scale-95 transition-all shadow-sm
                disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-teal-500
              "
              aria-label="Enviar mensagem"
            >
              {isExecuting
                ? <Loader2 size={16} className="text-white animate-spin" />
                : <Send size={16} className="text-white" />
              }
            </button>

            {/* Botão voz (push-to-talk) */}
            <ArtieVoiceInput
              onAudioReady={handleAudioReady}
              disabled={isDisabled}
            />
          </div>

          <p className="text-[10px] text-slate-400 text-center mt-2">
            Segure 🎙️ para falar · Enter para enviar
          </p>
        </div>
      </aside>
    </>
  );
}

// ─── Botão flutuante de abertura ──────────────────────────────────────────────
// Substitui o VoiceFloatingButton no MainLayout

export function ArtieFab() {
  const { toggleArtie, isOpen, chatState } = useArtie();

  return (
    <button
      onClick={toggleArtie}
      aria-label={isOpen ? 'Fechar Artie' : 'Abrir Artie'}
      className={`
        fixed bottom-6 right-6 z-40
        w-14 h-14 rounded-full shadow-xl
        flex items-center justify-center
        transition-all duration-200 active:scale-95
        ${isOpen
          ? 'bg-slate-700 hover:bg-slate-800 rotate-90'
          : 'bg-teal-500 hover:bg-teal-600'
        }
      `}
    >
      {isOpen
        ? <X size={22} className="text-white" />
        : <>
            <Bot size={24} className="text-white" />
            {chatState === 'processing' && (
              <span className="absolute top-1 right-1 w-3 h-3 rounded-full bg-amber-400 border-2 border-white animate-pulse" />
            )}
          </>
      }
    </button>
  );
}
