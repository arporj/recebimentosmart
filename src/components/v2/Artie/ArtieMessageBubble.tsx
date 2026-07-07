// ArtieMessageBubble — Bolha de mensagem da conversa com o Artie

import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Bot, User } from 'lucide-react';
import type { ArtieMessage } from '../../../lib/artie/types';

interface ArtieMessageBubbleProps {
  message: ArtieMessage;
  /** Chips de opções só são clicáveis na última mensagem da conversa */
  isLast?: boolean;
  /** Desabilita os chips enquanto o Artie está processando */
  disabled?: boolean;
  /** Clicar num chip envia o rótulo como mensagem do usuário */
  onOptionSelect?: (option: string) => void;
}

// Renderiza markdown simples (negrito, quebras de linha)
function renderContent(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

export function ArtieMessageBubble({ message, isLast, disabled, onOptionSelect }: ArtieMessageBubbleProps) {
  const isUser = message.role === 'user';
  const hasOptions = !isUser && !!message.options && message.options.length > 0;
  const optionsEnabled = hasOptions && !!isLast && !disabled;

  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className={`
        flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5
        ${isUser ? 'bg-slate-200' : 'bg-teal-500'}
      `}>
        {isUser
          ? <User size={14} className="text-slate-600" />
          : <Bot size={14} className="text-white" />
        }
      </div>

      {/* Conteúdo */}
      <div className={`flex flex-col gap-0.5 max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`
          px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed
          ${isUser
            ? 'bg-slate-800 text-white rounded-tr-sm'
            : 'bg-white border border-slate-100 text-slate-800 rounded-tl-sm shadow-sm'
          }
        `}>
          {message.content === '🎙️ Mensagem de voz'
            ? <span className="flex items-center gap-1.5 text-slate-300 italic text-xs">🎙️ Mensagem de voz</span>
            : <p className="whitespace-pre-wrap">{renderContent(message.content)}</p>
          }
        </div>

        {/* Chips de opções (ask_user) — permanecem visíveis no histórico, mas só a última pergunta é clicável */}
        {hasOptions && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {message.options!.map(opt => (
              <button
                key={opt}
                type="button"
                disabled={!optionsEnabled}
                onClick={() => onOptionSelect?.(opt)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors
                  ${optionsEnabled
                    ? 'text-teal-700 bg-teal-50 border-teal-200 hover:bg-teal-100 active:scale-95'
                    : 'text-slate-400 bg-slate-50 border-slate-200 cursor-default opacity-60'}`}
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        <span className="text-[10px] text-slate-400 px-1">
          {format(message.createdAt, 'HH:mm', { locale: ptBR })}
        </span>
      </div>
    </div>
  );
}
