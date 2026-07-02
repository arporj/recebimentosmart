import React from 'react';
import { X } from 'lucide-react';
import { useEscapeKey } from '../../hooks/useEscapeKey';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  confirmColor?: 'green' | 'red' | 'blue';
  cancelLabel?: string;
  loading?: boolean;
}

const colorMap = {
  green: 'bg-[#0d9488] hover:bg-[#0f766e] text-white',
  red: 'bg-rose-600 hover:bg-rose-700 text-white',
  blue: 'bg-blue-600 hover:bg-blue-700 text-white',
};

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirmar',
  confirmColor = 'green',
  cancelLabel = 'Cancelar',
  loading = false,
}) => {
  useEscapeKey(onClose, isOpen);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#1e293b] border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-2 border-b border-slate-800/60">
          <h3 className="text-lg font-bold text-slate-100">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 text-sm text-slate-300 leading-relaxed">
          {message}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 pb-5 pt-2 border-t border-slate-800/60 bg-slate-900/40">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-5 py-2 text-sm font-bold rounded-xl transition-all ${colorMap[confirmColor]} ${loading ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {loading ? 'Aguarde...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
