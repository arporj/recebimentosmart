import React, { useState } from 'react';
import { X, Copy, Check, Share2, Calendar, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'react-hot-toast';

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

interface ShareTransactionsModalV2Props {
  isOpen: boolean;
  onClose: () => void;
  currentMonth: Date;
  totals: {
    income: number;
    expense: number;
    transfersIn: number;
    transfersOut: number;
    result: number;
  };
  displayInstances: TransactionInstance[];
}

export const ShareTransactionsModalV2: React.FC<ShareTransactionsModalV2Props> = ({
  isOpen,
  onClose,
  currentMonth,
  totals,
  displayInstances,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const monthLabel = format(currentMonth, "MMMM 'de' yyyy", { locale: ptBR });
  const filteredList = displayInstances.filter(t => !t.isOpeningBalance);

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const handleCopyToClipboard = () => {
    try {
      const monthName = format(currentMonth, "MMMM 'de' yyyy", { locale: ptBR });
      
      let text = `📅 *Resumo Financeiro - ${monthName.charAt(0).toUpperCase() + monthName.slice(1)}*\n`;
      text += `----------------------------------\n`;
      text += `📈 *Ganhos:* ${formatBRL(totals.income + totals.transfersIn)}\n`;
      text += `📉 *Gastos:* -${formatBRL(totals.expense + totals.transfersOut)}\n`;
      
      const resultVal = totals.result;
      text += `💰 *Resultado Líquido:* ${formatBRL(resultVal)} (${resultVal >= 0 ? 'Superávit' : 'Déficit'})\n\n`;
      
      if (filteredList.length > 0) {
        text += `📝 *Lançamentos (${filteredList.length}):*\n`;
        text += `----------------------------------\n`;
        filteredList.forEach(t => {
          const dateFormatted = t.instanceDate ? format(parseISO(t.instanceDate), 'dd/MM') : '';
          const symbol = t.type === 'income' ? '🟢' : t.type === 'expense' ? '🔴' : '🔵';
          const typeLabel = t.type === 'transfer' ? ' (Transf.)' : '';
          const sign = t.type === 'expense' ? '-' : '';
          const amountFormatted = formatBRL(t.amount);
          
          text += `${symbol} *[${dateFormatted}]* ${t.description || 'Sem descrição'}${typeLabel}: ${sign}${amountFormatted}\n`;
        });
        text += `----------------------------------\n`;
      }
      
      text += `*Compartilhado via Recebimento $mart* ⚡\n`;
      text += `https://www.recebimentosmart.com.br`;
      
      navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copiado para a área de transferência!');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Erro ao copiar:', err);
      toast.error('Erro ao copiar para a área de transferência.');
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in duration-200 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-slate-50 flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-teal-50 text-teal-700 border border-teal-100 flex items-center gap-1">
                <Share2 size={10} />
                Compartilhar
              </span>
              <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-50 text-slate-600 border border-slate-100 capitalize">
                {monthLabel}
              </span>
            </div>
            <h3 className="text-xl font-extrabold text-slate-800 font-manrope">
              Resumo para Compartilhamento
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors active:scale-95 shrink-0"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-6 overflow-y-auto no-scrollbar flex-1">
          {/* Resumo Card Section */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-950 p-5 rounded-3xl text-white space-y-4 relative overflow-hidden shadow-xl border border-slate-800">
            <div className="absolute -right-10 -top-10 w-28 h-28 bg-teal-500/10 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -left-10 -bottom-10 w-28 h-28 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

            <div className="space-y-2 relative z-10">
              <span className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400">Resumo Financeiro do Compartilhamento</span>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-950/40 p-3 rounded-2xl border border-slate-800/40 hover:border-slate-800 transition-colors flex flex-col justify-between">
                  <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider flex items-center gap-1">
                    <TrendingUp size={10} className="text-emerald-400" /> Ganhos
                  </span>
                  <p className="text-sm font-black text-emerald-400 mt-1">{formatBRL(totals.income + totals.transfersIn)}</p>
                </div>
                <div className="bg-slate-950/40 p-3 rounded-2xl border border-slate-800/40 hover:border-slate-800 transition-colors flex flex-col justify-between">
                  <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider flex items-center gap-1">
                    <TrendingDown size={10} className="text-rose-400" /> Gastos
                  </span>
                  <p className="text-sm font-black text-rose-400 mt-1">-{formatBRL(totals.expense + totals.transfersOut)}</p>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-between items-center relative z-10">
              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Resultado Líquido</span>
                <p className={`text-xl font-black tracking-tight ${totals.result >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {formatBRL(totals.result)}
                </p>
              </div>
              <span className={`text-[8px] font-black uppercase px-2 py-1 rounded-lg ${totals.result >= 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                {totals.result >= 0 ? 'Superávit' : 'Déficit'}
              </span>
            </div>
          </div>

          {/* Lançamentos Filtrados Title */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <span>Lançamentos na Lista</span>
                <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[9px] font-extrabold">
                  {filteredList.length}
                </span>
              </h4>
            </div>

            {/* List */}
            <div className="divide-y divide-slate-50 border border-slate-100 rounded-3xl overflow-hidden bg-white max-h-[250px] overflow-y-auto no-scrollbar shadow-sm">
              {filteredList.length === 0 ? (
                <div className="py-8 text-center"><p className="text-slate-400 font-bold text-xs">Nenhum lançamento filtrado para exibir.</p></div>
              ) : (
                filteredList.map((t, idx) => {
                  const dateFormatted = t.instanceDate ? format(parseISO(t.instanceDate), 'dd/MM') : '';
                  return (
                    <div
                      key={`${t.id}-${idx}`}
                      className="p-3 flex items-center justify-between text-xs hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Bullet indicator */}
                        <div className={`w-2 h-2 rounded-full shrink-0 ${t.type === 'income' ? 'bg-emerald-500' : t.type === 'expense' ? 'bg-rose-500' : 'bg-indigo-500'}`} />
                        <span className="text-[10px] font-bold text-slate-400 shrink-0">
                          {dateFormatted}
                        </span>
                        <div className="min-w-0">
                          <p className="font-extrabold text-slate-700 truncate">{t.description || 'Sem descrição'}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {t.account && <span className="text-[8px] font-black text-slate-400 uppercase leading-none">{t.account.name}</span>}
                            {t.type === 'transfer' && <span className="text-[8px] font-black text-indigo-500 bg-indigo-50 px-1 py-0.5 rounded leading-none uppercase">Transf.</span>}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className={`font-black ${t.type === 'expense' ? 'text-rose-600' : t.type === 'income' ? 'text-emerald-600' : 'text-indigo-600'}`}>
                          {t.type === 'expense' ? '-' : ''}{formatBRL(t.amount)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-all text-center border border-slate-200"
          >
            Fechar
          </button>
          
          <button
            onClick={handleCopyToClipboard}
            className="w-full sm:flex-1 flex items-center justify-center gap-2 bg-[#0d9488] hover:bg-[#0f766e] text-white px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg active:scale-95 transition-all text-center"
          >
            {copied ? (
              <>
                <Check size={14} className="text-emerald-300" />
                <span>Copiado!</span>
              </>
            ) : (
              <>
                <Copy size={14} />
                <span>Copiar para a Área de Transferência</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
