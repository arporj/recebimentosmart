import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  TrendingUp,
  TrendingDown,
  Calendar,
  ChevronLeft,
  ChevronRight,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Clock
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  format,
  parseISO,
  endOfMonth,
  isSameMonth,
  subMonths,
  addMonths
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { expandTransactionInstances } from '../../lib/financeiro/instanceExpansion';

interface ClientBankStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
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

export default function ClientBankStatementModalV2({
  isOpen,
  onClose,
  clientId,
  clientName,
  selectedMonth
}: ClientBankStatementModalProps) {
  const { user } = useAuth();
  const [rawTransactions, setRawTransactions] = useState<FinancialTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(selectedMonth || new Date());

  useEffect(() => {
    if (isOpen && clientId && user) {
      fetchStatement();
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

  const fetchStatement = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('financial_transactions')
        .select(
          'id, type, amount, date, description, status, recurrence_enabled, recurrence_period, recurrence_interval, recurrence_end_date, parent_id, modalidade, installment_total, installment_current'
        )
        .eq('client_id', clientId)
        .eq('user_id', user.id)
        .neq('status', 'cancelled');

      if (error) throw error;
      setRawTransactions((data || []) as any);
    } catch (err) {
      console.error('Erro ao buscar extrato do cliente:', err);
    } finally {
      setLoading(false);
    }
  };

  // Expansão de recorrências e parcelamento localmente para o mês atual (fonte compartilhada
  // com FinancialTransactionsV2/DashboardV2). rawTransactions mistura o registro-mãe recorrente
  // (recurrence_enabled=true, sem parent_id) com as ocorrências físicas materializadas —
  // separamos os dois papéis antes de chamar o expansor compartilhado.
  const monthInstances = useMemo((): TransactionInstance[] => {
    const templates = rawTransactions.filter(t => t.recurrence_enabled && !t.parent_id);
    const materialized = rawTransactions.filter(t => !(t.recurrence_enabled && !t.parent_id));

    const expanded = expandTransactionInstances(materialized as any, templates as any, {
      horizonEnd: endOfMonth(currentMonth),
    }) as unknown as TransactionInstance[];

    const filtered = expanded.filter(t => isSameMonth(parseISO(t.instanceDate), currentMonth));

    // Extrato bancário: da data mais nova para a mais antiga.
    return filtered.sort((a, b) => {
      const dateCompare = b.instanceDate.localeCompare(a.instanceDate);
      if (dateCompare !== 0) return dateCompare;
      return (b.id ?? '').localeCompare(a.id ?? '');
    });
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

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isOverdue = (t: TransactionInstance) =>
    t.status === 'pending' && new Date(t.instanceDate + 'T00:00:00') < today;

  const overdueInstances = useMemo(
    () => monthInstances.filter(t => isOverdue(t)),
    [monthInstances]
  );

  const overdueTotal = useMemo(
    () => overdueInstances.reduce((acc, cur) => acc + Number(cur.amount), 0),
    [overdueInstances]
  );

  const getStatusBadge = (t: TransactionInstance) => {
    if (t.status === 'paid') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[9px] font-black bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase tracking-wide">
          <CheckCircle2 size={10} className="stroke-[3]" />
          Pago
        </span>
      );
    }
    if (t.status === 'partial') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[9px] font-black bg-amber-50 text-amber-600 border border-amber-100 uppercase tracking-wide">
          <Clock size={10} />
          Parcial
        </span>
      );
    }
    if (isOverdue(t)) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[9px] font-black bg-rose-50 text-rose-700 border border-rose-100 uppercase tracking-wide">
          <AlertTriangle size={10} />
          Atrasado
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[9px] font-black bg-slate-100 text-slate-500 border border-slate-200 uppercase tracking-wide">
        <Clock size={10} />
        Pendente
      </span>
    );
  };

  const getRowClass = (t: TransactionInstance) => {
    if (t.status === 'paid') return 'bg-emerald-50/40 hover:bg-emerald-50/70';
    if (isOverdue(t)) return 'bg-rose-50/40 hover:bg-rose-50/70';
    return 'hover:bg-slate-50/50';
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
      <div className="relative bg-slate-50 w-full h-full md:max-w-5xl md:h-[85vh] md:rounded-[2rem] shadow-2xl overflow-hidden flex flex-col transition-all duration-300">

        {/* Modal Header */}
        <div className="bg-white border-b border-slate-100 px-6 py-5 shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-teal-50 p-2.5 rounded-2xl text-teal-600 border border-teal-100/50">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-800 tracking-tight leading-tight">Extrato do Cliente</h3>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-0.5">{clientName}</p>
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

        {/* Corpo - Extrato estilo bancário */}
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
                Não existem transações correspondentes a este mês de referência.
              </p>
            </div>
          ) : (
            <div className={`flex flex-col gap-6 ${overdueInstances.length > 0 ? 'md:flex-row md:items-start' : ''}`}>
              {/* Coluna principal - Extrato completo */}
              <div className="bg-white rounded-3xl border border-slate-200 overflow-x-auto shadow-sm flex-1 min-w-0">
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 w-28">Data</th>
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Descrição</th>
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 text-right w-36">Valor</th>
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 text-center w-32">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {monthInstances.map((t) => {
                      const isIncome = t.type === 'income';
                      const formattedDate = format(parseISO(t.instanceDate), 'dd/MM/yyyy');

                      return (
                        <tr key={t.id} className={`transition-colors ${getRowClass(t)}`}>
                          <td className="px-4 py-3 text-xs font-bold text-slate-400 whitespace-nowrap">
                            {formattedDate}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs font-black text-slate-700 block truncate max-w-[320px]">
                              {t.description || 'Sem descrição'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <span className={`text-sm font-black font-manrope ${
                              isIncome ? 'text-emerald-600' : 'text-rose-600'
                            }`}>
                              {isIncome ? '+' : '-'} {formatCurrency(t.amount)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            {getStatusBadge(t)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Coluna secundária - Em Atraso (só aparece se houver contas atrasadas) */}
              {overdueInstances.length > 0 && (
                <div className="bg-rose-50/60 border border-rose-200 rounded-3xl shadow-sm shrink-0 w-full md:w-72 overflow-hidden">
                  <div className="px-4 py-3.5 border-b border-rose-200/70 bg-rose-100/50 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-black text-rose-700 uppercase tracking-wide">
                      <AlertTriangle size={14} />
                      Em Atraso
                    </span>
                    <span className="bg-rose-600 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center">
                      {overdueInstances.length}
                    </span>
                  </div>

                  <div className="px-4 py-2.5 border-b border-rose-200/70 text-right">
                    <span className="text-sm font-black text-rose-700 font-manrope">
                      {formatCurrency(overdueTotal)}
                    </span>
                  </div>

                  <div className="divide-y divide-rose-200/60 max-h-[420px] overflow-y-auto">
                    {overdueInstances.map(t => (
                      <div key={t.id} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold text-rose-500 whitespace-nowrap">
                            {format(parseISO(t.instanceDate), 'dd/MM/yyyy')}
                          </span>
                          <span className="text-xs font-black text-rose-700 font-manrope whitespace-nowrap">
                            {formatCurrency(t.amount)}
                          </span>
                        </div>
                        <span className="text-xs font-bold text-rose-900/80 block truncate mt-0.5">
                          {t.description || 'Sem descrição'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
