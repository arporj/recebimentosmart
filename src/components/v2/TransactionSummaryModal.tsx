import React from 'react';
import { X, Calendar, DollarSign, Tag, Wallet, User, CheckCircle2, AlertTriangle, Clock, Pencil, ArrowRightLeft, Repeat, Layers } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface TransactionInstance {
  id: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  date: string;
  description: string;
  status: 'paid' | 'pending' | 'overdue' | 'partial' | 'cancelled';
  account_id?: string;
  destination_account_id?: string;
  instanceDate: string;
  isVirtual?: boolean;
  isOpeningBalance?: boolean;
  isInvoiceSummary?: boolean;
  recurrence_enabled?: boolean;
  parent_id?: string;
  modalidade?: 'parcelada' | 'recorrente';
  installment_current?: number;
  installment_total?: number;
  account?: { name: string };
  destination_account?: { name: string };
  category?: { name: string };
  client?: { name: string };
}

interface TransactionSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: TransactionInstance | null;
  onEdit: (transaction: any) => void;
}

export const TransactionSummaryModal: React.FC<TransactionSummaryModalProps> = ({
  isOpen,
  onClose,
  transaction,
  onEdit,
}) => {
  if (!isOpen || !transaction) return null;

  const formattedDate = format(parseISO(transaction.instanceDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  
  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'paid':
        return {
          label: 'Confirmado',
          colorClass: 'bg-emerald-50 text-emerald-700 border-emerald-100',
          icon: CheckCircle2,
        };
      case 'overdue':
        return {
          label: 'Atrasado',
          colorClass: 'bg-rose-50 text-rose-700 border-rose-100',
          icon: AlertTriangle,
        };
      default:
        return {
          label: 'Pendente',
          colorClass: 'bg-amber-50 text-amber-700 border-amber-100',
          icon: Clock,
        };
    }
  };

  const statusInfo = getStatusInfo(transaction.status);
  const StatusIcon = statusInfo.icon;

  const typeLabels = {
    income: { label: 'Receita', color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
    expense: { label: 'Despesa', color: 'text-rose-600 bg-rose-50 border-rose-100' },
    transfer: { label: 'Transferência', color: 'text-blue-600 bg-blue-50 border-blue-100' },
  };

  const currentType = typeLabels[transaction.type] || { label: 'Lançamento', color: 'text-slate-600 bg-slate-50 border-slate-100' };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-slate-50 flex justify-between items-start">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${currentType.color}`}>
                {currentType.label}
              </span>
              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border flex items-center gap-1 ${statusInfo.colorClass}`}>
                <StatusIcon size={10} />
                {statusInfo.label}
              </span>
            </div>
            <h3 className="text-xl font-extrabold text-slate-800 line-clamp-2">
              {transaction.description || 'Lançamento Sem Descrição'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors active:scale-95 shrink-0"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Amount Badge Panel */}
          <div className={`p-6 rounded-3xl border text-center space-y-1 ${
            transaction.type === 'expense' ? 'bg-rose-50/30 border-rose-100/50' : 
            transaction.type === 'income' ? 'bg-emerald-50/30 border-emerald-100/50' : 
            'bg-blue-50/30 border-blue-100/50'
          }`}>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Valor do Lançamento</span>
            <p className={`text-3xl font-black ${
              transaction.type === 'expense' ? 'text-slate-800' : 
              transaction.type === 'income' ? 'text-emerald-600' : 
              'text-blue-600'
            }`}>
              {transaction.type === 'expense' ? '-' : ''}
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(transaction.amount)}
            </p>
          </div>

          {/* Details list */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Data */}
            <div className="flex items-center gap-3 p-3.5 bg-slate-50/50 rounded-2xl border border-slate-100/50">
              <Calendar size={18} className="text-slate-400 shrink-0" />
              <div className="min-w-0">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Data</span>
                <span className="text-xs font-bold text-slate-700 truncate block">{formattedDate}</span>
              </div>
            </div>

            {/* Conta */}
            <div className="flex items-center gap-3 p-3.5 bg-slate-50/50 rounded-2xl border border-slate-100/50">
              <Wallet size={18} className="text-slate-400 shrink-0" />
              <div className="min-w-0">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">
                  {transaction.type === 'transfer' ? 'Conta Origem' : 'Conta'}
                </span>
                <span className="text-xs font-bold text-slate-700 truncate block">
                  {transaction.account?.name || 'Não informada'}
                </span>
              </div>
            </div>

            {/* Conta Destino (se for transferência) */}
            {transaction.type === 'transfer' && transaction.destination_account && (
              <div className="flex items-center gap-3 p-3.5 bg-slate-50/50 rounded-2xl border border-slate-100/50 sm:col-span-2">
                <ArrowRightLeft size={18} className="text-slate-400 shrink-0" />
                <div className="min-w-0">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Conta Destino</span>
                  <span className="text-xs font-bold text-indigo-600 truncate block">
                    {transaction.destination_account.name}
                  </span>
                </div>
              </div>
            )}

            {/* Categoria */}
            <div className="flex items-center gap-3 p-3.5 bg-slate-50/50 rounded-2xl border border-slate-100/50">
              <Tag size={18} className="text-slate-400 shrink-0" />
              <div className="min-w-0">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Categoria</span>
                <span className="text-xs font-bold text-slate-700 truncate block">
                  {transaction.category?.name || 'Sem Categoria'}
                </span>
              </div>
            </div>

            {/* Cliente Associado */}
            <div className="flex items-center gap-3 p-3.5 bg-slate-50/50 rounded-2xl border border-slate-100/50">
              <User size={18} className="text-slate-400 shrink-0" />
              <div className="min-w-0">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Cliente Associado</span>
                <span className="text-xs font-bold text-sky-600 truncate block">
                  {transaction.client?.name || 'Nenhum'}
                </span>
              </div>
            </div>

            {/* Recorrência / Parcelas info se houver */}
            {(transaction.recurrence_enabled || !!transaction.parent_id || (transaction.installment_total && transaction.installment_total > 1)) && (
              <div className="flex items-center gap-3 p-3.5 bg-slate-50/50 rounded-2xl border border-slate-100/50 sm:col-span-2">
                {transaction.installment_total && transaction.installment_total > 1 ? (
                  <Layers size={18} className="text-indigo-500 shrink-0" />
                ) : (
                  <Repeat size={18} className="text-indigo-500 shrink-0" />
                )}
                <div className="min-w-0">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">
                    {transaction.installment_total && transaction.installment_total > 1 ? 'Parcelamento' : 'Recorrência'}
                  </span>
                  <span className="text-xs font-bold text-indigo-600 truncate block">
                    {transaction.installment_total && transaction.installment_total > 1 ? (
                      `Parcela ${transaction.installment_current} de ${transaction.installment_total}`
                    ) : (
                      'Este lançamento faz parte de uma transação recorrente.'
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer com botões Fechar e Editar */}
        <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="flex-1 sm:flex-initial px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-all text-center border border-slate-200"
          >
            Fechar
          </button>
          
          {!transaction.isVirtual && (
            <button
              onClick={() => {
                onClose();
                onEdit(transaction);
              }}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-[#0d9488] hover:bg-[#0f766e] text-white px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-wider shadow-md active:scale-95 transition-all text-center"
            >
              <Pencil size={14} />
              <span>Editar</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
