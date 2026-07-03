// ArtieConfirmCard — Card inline de confirmação de ação
// Exibido quando o Artie identifica uma ação que requer aprovação do usuário.

import { AlertTriangle, Check, X } from 'lucide-react';
import type { PendingAction } from '../../../lib/artie/types';

interface ArtieConfirmCardProps {
  action: PendingAction;
  onConfirm: () => void;
  onCancel: () => void;
  isExecuting: boolean;
}

const RISK_STYLES: Record<PendingAction['risk'], { border: string; bg: string; icon: string; title: string; text: string }> = {
  low: {
    border: 'border-teal-300 dark:border-teal-800/80',
    bg: 'bg-teal-50 dark:bg-teal-950/80',
    icon: 'text-teal-700 dark:text-teal-400',
    title: 'text-teal-800 dark:text-teal-300 artie-confirm-title-low',
    text: 'text-slate-900 dark:text-teal-100 artie-confirm-msg',
  },
  medium: {
    border: 'border-amber-300 dark:border-amber-700/80',
    bg: 'bg-amber-50 dark:bg-amber-950/80',
    icon: 'text-amber-700 dark:text-amber-400',
    title: 'text-amber-800 dark:text-amber-300 artie-confirm-title-medium',
    text: 'text-slate-900 dark:text-amber-100 artie-confirm-msg',
  },
  high: {
    border: 'border-red-300 dark:border-red-800/80',
    bg: 'bg-red-50 dark:bg-red-950/90',
    icon: 'text-red-700 dark:text-red-400',
    title: 'text-red-800 dark:text-red-300 artie-confirm-title-high',
    text: 'text-slate-900 dark:text-red-100 artie-confirm-msg',
  },
};

const RISK_LABELS: Record<PendingAction['risk'], string> = {
  low: 'Ação segura',
  medium: 'Requer confirmação',
  high: '⚠️ Ação destrutiva',
};

export function ArtieConfirmCard({ action, onConfirm, onCancel, isExecuting }: ArtieConfirmCardProps) {
  const styles = RISK_STYLES[action.risk];

  return (
    <div className={`rounded-xl border ${styles.border} ${styles.bg} p-4 space-y-3.5 mx-1 shadow-md transition-all`}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <AlertTriangle size={16} className={styles.icon} />
        <span className={`text-xs font-extrabold tracking-wide uppercase ${styles.title}`}>
          {RISK_LABELS[action.risk]}
        </span>
      </div>

      {/* Ação */}
      <p className={`text-sm font-semibold leading-relaxed ${styles.text}`}>
        {action.confirmationMessage.replace(/\*\*/g, '')}
      </p>

      {/* Botões */}
      <div className="flex gap-2.5 pt-1">
        <button
          onClick={onConfirm}
          disabled={isExecuting}
          className={`
            flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-bold transition-all shadow-sm
            ${action.risk === 'high'
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-teal-600 hover:bg-teal-700 text-white'
            }
            disabled:opacity-60 disabled:cursor-not-allowed
          `}
        >
          {isExecuting
            ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <Check size={16} />
          }
          {isExecuting ? 'Executando...' : 'Confirmar'}
        </button>

        <button
          onClick={onCancel}
          disabled={isExecuting}
          className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-bold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all disabled:opacity-60 shadow-sm"
        >
          <X size={16} />
          Cancelar
        </button>
      </div>
    </div>
  );
}
