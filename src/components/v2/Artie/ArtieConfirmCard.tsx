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

const RISK_STYLES: Record<PendingAction['risk'], { border: string; bg: string; icon: string }> = {
  low:    { border: 'border-teal-200',  bg: 'bg-teal-50',   icon: 'text-teal-600' },
  medium: { border: 'border-amber-200', bg: 'bg-amber-50',  icon: 'text-amber-600' },
  high:   { border: 'border-red-200',   bg: 'bg-red-50',    icon: 'text-red-600' },
};

const RISK_LABELS: Record<PendingAction['risk'], string> = {
  low:    'Ação segura',
  medium: 'Requer confirmação',
  high:   '⚠️ Ação destrutiva',
};

export function ArtieConfirmCard({ action, onConfirm, onCancel, isExecuting }: ArtieConfirmCardProps) {
  const styles = RISK_STYLES[action.risk];

  return (
    <div className={`rounded-xl border ${styles.border} ${styles.bg} p-3.5 space-y-3 mx-1`}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <AlertTriangle size={15} className={styles.icon} />
        <span className={`text-xs font-bold ${styles.icon}`}>
          {RISK_LABELS[action.risk]}
        </span>
      </div>

      {/* Ação */}
      <p className="text-sm text-slate-700 leading-snug">
        {action.confirmationMessage.replace(/\*\*/g, '')}
      </p>

      {/* Botões */}
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          disabled={isExecuting}
          className={`
            flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all
            ${action.risk === 'high'
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : 'bg-teal-500 hover:bg-teal-600 text-white'
            }
            disabled:opacity-60 disabled:cursor-not-allowed
          `}
        >
          {isExecuting
            ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <Check size={15} />
          }
          {isExecuting ? 'Executando...' : 'Confirmar'}
        </button>

        <button
          onClick={onCancel}
          disabled={isExecuting}
          className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-all disabled:opacity-60"
        >
          <X size={15} />
          Cancelar
        </button>
      </div>
    </div>
  );
}
