import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  FileText,
  Check,
  Clock,
  AlertTriangle,
  Mail
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { 
  format, 
  parseISO, 
  isBefore, 
  startOfMonth, 
  endOfMonth, 
  isAfter, 
  isSameMonth, 
  addDays, 
  addWeeks, 
  addMonths, 
  addYears, 
  isSameDay,
  subMonths 
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SharerStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
  receiverEmail: string;
  shareStatus: 'pending' | 'accepted' | 'rejected';
  selectedMonth?: Date;
}

interface FinancialTransaction {
  id: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  date: string;
  description: string;
  status: 'pending' | 'paid' | 'partial' | 'cancelled';
  recurrence_enabled?: boolean;
  recurrence_period?: string;
  recurrence_interval?: number;
  recurrence_end_date?: string | null;
  parent_id?: string | null;
  modalidade?: 'unica' | 'parcelada' | 'recorrente';
  installment_total?: number;
  installment_current?: number;
}

interface TransactionInstance extends FinancialTransaction {
  instanceDate: string;
  isVirtual: boolean;
}

export default function SharerStatementModalV2({ 
  isOpen, 
  onClose, 
  clientId, 
  clientName, 
  receiverEmail,
  shareStatus,
  selectedMonth 
}: SharerStatementModalProps) {
  const { user } = useAuth();
  const [rawTransactions, setRawTransactions] = useState<FinancialTransaction[]>([]);
  const [clonedTransactions, setClonedTransactions] = useState<any[]>([]);
  const [pendingDeletes, setPendingDeletes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(selectedMonth || new Date());

  useEffect(() => {
    if (isOpen && clientId && user) {
      fetchData();
    }
  }, [isOpen, clientId, user]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const fetchData = async () => {
    if (!user) return;
    try {
      setLoading(true);
      
      // 1. Buscar transações do próprio compartilhador (remetente)
      const { data: myTxs, error: myTxsError } = await supabase
        .from('financial_transactions')
        .select('id, type, amount, date, description, status, recurrence_enabled, recurrence_period, recurrence_interval, recurrence_end_date, parent_id, modalidade, installment_total, installment_current')
        .eq('client_id', clientId)
        .eq('user_id', user.id)
        .neq('status', 'cancelled');

      if (myTxsError) throw myTxsError;
      setRawTransactions(myTxs || []);

      // 2. Se o compartilhamento foi aceito, buscar as transações clonadas no receptor
      if (shareStatus === 'accepted') {
        const { data: clones, error: clonesError } = await supabase
          .from('financial_transactions')
          .select('id, status, shared_original_transaction_id, date')
          .eq('shared_by_user_id', user.id)
          .eq('client_id', clientId)
          .neq('status', 'cancelled');

        if (clonesError) {
          console.warn('Erro ao carregar clones de transações (pode ser restrição de RLS ou sem clones):', clonesError);
        } else {
          setClonedTransactions(clones || []);
        }

        // 3. Buscar propostas de exclusão bilaterais pendentes
        const { data: updates, error: updatesError } = await supabase
          .from('shared_transaction_updates')
          .select('id, original_transaction_id, update_type, status')
          .eq('sender_id', user.id)
          .eq('status', 'pending')
          .eq('update_type', 'delete');

        if (!updatesError && updates) {
          setPendingDeletes(updates);
        } else {
          setPendingDeletes([]);
        }
      } else {
        setClonedTransactions([]);
        setPendingDeletes([]);
      }
    } catch (err) {
      console.error('Erro ao buscar dados de acompanhamento:', err);
    } finally {
      setLoading(false);
    }
  };

  // Expansão local de recorrências/parcelamentos do remetente
  const monthInstances = useMemo((): TransactionInstance[] => {
    const instances: TransactionInstance[] = [];
    const maxDate = endOfMonth(currentMonth);

    const physicalDatesByParent = new Map<string, Set<string>>();
    const physicalIndicesByParent = new Map<string, Set<number>>();
    for (const t of rawTransactions) {
      const parentId = t.parent_id || t.id;
      if (!physicalDatesByParent.has(parentId)) {
        physicalDatesByParent.set(parentId, new Set());
      }
      physicalDatesByParent.get(parentId)!.add(t.date);

      // CRUCIAL: Adicionamos ao índice de parcelas físicas APENAS se for um filho físico (t.parent_id !== null).
      // Isso nos permite detectar quando uma ocorrência específica foi desmembrada por edição de escopo 'somente este'.
      if (t.parent_id && t.installment_current !== null && t.installment_current !== undefined) {
        if (!physicalIndicesByParent.has(parentId)) {
          physicalIndicesByParent.set(parentId, new Set());
        }
        physicalIndicesByParent.get(parentId)!.add(t.installment_current);
      }
    }

    for (const t of rawTransactions) {
      const tDate = parseISO(t.date);

      if (!t.recurrence_enabled) {
        if (isBefore(tDate, maxDate) || isSameDay(tDate, maxDate)) {
          instances.push({ ...t, instanceDate: t.date, isVirtual: false });
        }
        continue;
      }

      const interval = t.recurrence_interval || 1;
      const period = t.recurrence_period || 'monthly';
      const recEndDate = t.recurrence_end_date ? parseISO(t.recurrence_end_date) : null;
      
      let cursor = new Date(tDate);
      const parentId = t.id;
      
      while (isBefore(cursor, maxDate) || isSameDay(cursor, maxDate)) {
        if (recEndDate && isAfter(cursor, recEndDate)) break;

        const dateStr = format(cursor, 'yyyy-MM-dd');
        const monthsDiff = (cursor.getFullYear() - tDate.getFullYear()) * 12 + (cursor.getMonth() - tDate.getMonth());
        const currentInst = (t.installment_current || 1) + monthsDiff;

        // Checar por índice sequencial e por data (fallback)
        const hasPhysicalByIndex = physicalIndicesByParent.get(parentId)?.has(currentInst);
        const hasPhysicalByDate = physicalDatesByParent.get(parentId)?.has(dateStr);
        const alreadyHasPhysical = hasPhysicalByIndex || hasPhysicalByDate;

        // Se for a data original do pai (e não houver filho físico desmembrado para esse mesmo índice)
        // ou uma virtual que não existe fisicamente.
        if (!alreadyHasPhysical || (dateStr === t.date && !hasPhysicalByIndex)) {
          if (period === 'parcelada' && t.installment_total && currentInst > t.installment_total) {
            break;
          }

          instances.push({
            ...t,
            instanceDate: dateStr,
            isVirtual: dateStr !== t.date,
            status: dateStr !== t.date ? 'pending' : t.status,
            installment_current: currentInst,
          });
        }
        
        switch (period) {
          case 'daily': cursor = addDays(cursor, interval); break;
          case 'weekly': cursor = addWeeks(cursor, interval); break;
          case 'monthly': cursor = addMonths(cursor, interval); break;
          case 'yearly': cursor = addYears(cursor, interval); break;
          default: cursor = addMonths(cursor, interval);
        }
      }
    }

    const filtered = instances.filter(t => isSameMonth(parseISO(t.instanceDate), currentMonth));
    return filtered.sort((a, b) => b.instanceDate.localeCompare(a.instanceDate));
  }, [rawTransactions, currentMonth]);

  const totals = useMemo(() => {
    const income = monthInstances
      .filter(t => t.type === 'income')
      .reduce((acc, cur) => acc + Number(cur.amount), 0);

    const expense = monthInstances
      .filter(t => t.type === 'expense')
      .reduce((acc, cur) => acc + Number(cur.amount), 0);

    return {
      income,
      expense,
      net: income - expense
    };
  }, [monthInstances]);

  // Função para mapear a reação do receptor para cada instância de transação
  const getReactionBadge = (instance: TransactionInstance) => {
    if (shareStatus === 'pending') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[9px] font-black bg-slate-100 text-slate-500 border border-slate-200 uppercase tracking-wide">
          <Clock size={10} />
          Aguardando aceite do convite
        </span>
      );
    }

    if (shareStatus === 'rejected') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[9px] font-black bg-rose-50 text-rose-700 border border-rose-100 uppercase tracking-wide">
          <X size={10} />
          Compartilhamento Recusado
        </span>
      );
    }

    // Verificar se existe proposta de exclusão pendente
    const hasPendingDelete = pendingDeletes.some(u => u.original_transaction_id === instance.id);
    if (hasPendingDelete) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[9px] font-black bg-rose-50 text-rose-700 border border-rose-200/50 uppercase tracking-wide animate-pulse">
          <AlertTriangle size={10} />
          Recusado (Aguardando sua confirmação de exclusão)
        </span>
      );
    }

    // Achar o clone correspondente no receptor
    // Se for virtual, podemos mapear pela data da instância ou similar
    const clone = clonedTransactions.find(c => 
      c.shared_original_transaction_id === instance.id && 
      (instance.isVirtual ? c.date === instance.instanceDate : true)
    );

    if (!clone) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[9px] font-black bg-rose-100 text-rose-700 border border-rose-200 uppercase tracking-wide">
          <X size={10} />
          Recusado pelo Recebedor
        </span>
      );
    }

    if (clone.status === 'paid') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[9px] font-black bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase tracking-wide">
          <Check size={10} className="stroke-[3]" />
          Aceito pelo Recebedor
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[9px] font-black bg-amber-50 text-amber-600 border border-amber-100 uppercase tracking-wide">
        <Clock size={10} />
        Aguardando Conciliação
      </span>
    );
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const monthLabel = format(currentMonth, "MMMM 'de' yyyy", { locale: ptBR });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      {/* Content Card */}
      <div className="relative bg-slate-50 w-full h-full md:max-w-6xl md:h-[85vh] md:rounded-[2rem] shadow-2xl overflow-hidden flex flex-col transition-all duration-300">
        
        {/* Modal Header */}
        <div className="bg-white border-b border-slate-100 px-6 py-5 shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-teal-50 p-2.5 rounded-2xl text-teal-600 border border-teal-100/50">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-800 tracking-tight leading-tight">Acompanhar Extrato (Enviado)</h3>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Cliente: {clientName}</span>
                <span className="text-slate-300 text-xs font-bold">•</span>
                <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                  <Mail size={12} className="text-slate-400" />
                  Destinatário: {receiverEmail}
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3 self-end sm:self-auto">
            {/* Seletor Mensal Premium */}
            <div className="bg-slate-50 p-1.5 rounded-xl border border-slate-200/60 flex items-center gap-2">
              <button 
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} 
                className="p-1.5 hover:bg-white active:scale-95 rounded-xl transition-all shadow-sm border border-transparent hover:border-slate-100"
              >
                <ChevronLeft size={16} className="text-slate-600" />
              </button>
              <span className="text-xs font-black text-slate-700 capitalize min-w-[110px] text-center">
                {monthLabel}
              </span>
              <button 
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} 
                className="p-1.5 hover:bg-white active:scale-95 rounded-xl transition-all shadow-sm border border-transparent hover:border-slate-100"
              >
                <ChevronRight size={16} className="text-slate-600" />
              </button>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 active:scale-95 rounded-xl transition-all border border-slate-200/60 bg-white"
            >
              <X size={20} className="text-slate-500" />
            </button>
          </div>
        </div>

        {/* Cards de Totais */}
        <div className="bg-white border-b border-slate-100 px-6 py-5 grid grid-cols-3 gap-4 shrink-0">
          <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100 flex flex-col">
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">A Receber (Mês)</span>
            <span className="text-base sm:text-lg font-black text-emerald-600 flex items-center">
              <TrendingUp className="w-4 h-4 mr-1 text-emerald-500" />
              {formatCurrency(totals.income)}
            </span>
          </div>

          <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100 flex flex-col">
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">A Pagar (Mês)</span>
            <span className="text-base sm:text-lg font-black text-rose-600 flex items-center">
              <TrendingDown className="w-4 h-4 mr-1 text-rose-500" />
              {formatCurrency(totals.expense)}
            </span>
          </div>

          <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100 flex flex-col">
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">Saldo do Mês</span>
            <span className={`text-base sm:text-lg font-black tracking-tight ${
              totals.net < 0 ? 'text-rose-600' : totals.net > 0 ? 'text-emerald-600' : 'text-slate-500'
            }`}>
              {formatCurrency(totals.net)}
            </span>
          </div>
        </div>

        {/* Corpo - Tabela de Lançamentos Granulares Notion-Style */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center gap-3">
              <div className="w-10 h-10 border-4 border-teal-200 border-t-teal-500 rounded-full animate-spin" />
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Carregando Histórico...</span>
            </div>
          ) : monthInstances.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-12 bg-white rounded-3xl border border-slate-200 border-dashed px-6">
              <div className="bg-slate-50 p-4 rounded-full mb-4">
                <Calendar className="w-8 h-8 text-slate-400" />
              </div>
              <h4 className="text-sm font-black text-slate-700 mb-1">Nenhum lançamento no mês</h4>
              <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                Você não possui transações registradas para este cliente neste mês.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-slate-200 overflow-x-auto shadow-sm pb-2">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 w-24">Data</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 w-64">Descrição</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 w-28">Recorrência</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 text-right w-32">Valor</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 text-center w-52">Reação do Receptor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {monthInstances.map((t) => {
                    const isIncome = t.type === 'income'; 
                    const formattedDate = format(parseISO(t.instanceDate), 'dd/MM/yyyy');

                    return (
                      <tr key={t.id} className="hover:bg-slate-50/50 transition-colors group">
                        {/* Data */}
                        <td className="px-4 py-3 text-xs font-bold text-slate-400 whitespace-nowrap">
                          {formattedDate}
                        </td>

                        {/* Descrição */}
                        <td className="px-4 py-3">
                          <span className="text-xs font-black text-slate-700 block truncate max-w-[250px]">
                            {t.description || 'Sem descrição'}
                          </span>
                        </td>

                        {/* Recorrência */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-[10px] font-bold text-slate-400 uppercase">
                            {t.recurrence_enabled ? (t.recurrence_period === 'parcelada' ? 'Parcelado' : 'Recorrente') : 'Único'}
                          </span>
                        </td>

                        {/* Valor */}
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <span className={`text-sm font-black font-manrope ${
                            isIncome ? 'text-emerald-600' : 'text-rose-600'
                          }`}>
                            {isIncome ? '+' : '-'} {formatCurrency(t.amount)}
                          </span>
                        </td>

                        {/* Reação do Receptor */}
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          {getReactionBadge(t)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
