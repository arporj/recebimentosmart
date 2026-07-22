import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  TrendingUp,
  TrendingDown,
  Calendar,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Clock
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { format, parseISO, endOfMonth, addMonths } from 'date-fns';
import { expandTransactionInstances } from '../../lib/financeiro/instanceExpansion';
import ConfirmModal from './ConfirmModal';

interface ClientBankStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
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
  originalInstanceDate: string;
  isVirtual: boolean;
}

const PAGE_SIZE = 60;

export default function ClientBankStatementModalV2({
  isOpen,
  onClose,
  clientId,
  clientName
}: ClientBankStatementModalProps) {
  const { user } = useAuth();
  const [rawTransactions, setRawTransactions] = useState<FinancialTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [payingTx, setPayingTx] = useState<TransactionInstance | null>(null);
  const [paymentDate, setPaymentDate] = useState('');
  const [confirmingPayment, setConfirmingPayment] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen && clientId && user) {
      setVisibleCount(PAGE_SIZE);
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

  const todayStr = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);

  const openPaymentModal = (t: TransactionInstance) => {
    setPayingTx(t);
    setPaymentDate(todayStr);
  };

  const handleConfirmPayment = async () => {
    if (!payingTx || !user || !paymentDate) return;
    setConfirmingPayment(true);
    try {
      if (payingTx.isVirtual) {
        // Ocorrência ainda não materializada: cria o filho físico já pago,
        // mesmo padrão usado em FinancialTransactionsV2/CobrancasV2.
        const { error } = await supabase.from('financial_transactions').insert({
          user_id: user.id,
          type: payingTx.type,
          amount: payingTx.amount,
          date: payingTx.originalInstanceDate,
          description: payingTx.description,
          client_id: clientId,
          status: 'paid',
          paid_date: paymentDate,
          parent_id: payingTx.parent_id || payingTx.id,
          modalidade: 'unica',
          is_customized: true,
          recurrence_enabled: false,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('financial_transactions')
          .update({ status: 'paid', paid_date: paymentDate })
          .eq('id', payingTx.id);
        if (error) throw error;
      }
      toast.success('Pagamento confirmado!');
      setPayingTx(null);
      fetchStatement();
    } catch (err) {
      console.error('Erro ao confirmar pagamento:', err);
      toast.error('Erro ao confirmar pagamento.');
    } finally {
      setConfirmingPayment(false);
    }
  };

  // Extrato bancário: mostra o histórico inteiro do cliente (não travado a um mês),
  // ordenado da data mais nova para a mais antiga. Pendências vencidas são "roladas"
  // para hoje (rollOverUnpaidToToday) para nunca ficarem perdidas num mês antigo que
  // ninguém mais visita — mesma regra usada pelo DashboardV2.
  const allInstances = useMemo((): TransactionInstance[] => {
    const templates = rawTransactions.filter(t => t.recurrence_enabled && !t.parent_id);
    const materialized = rawTransactions.filter(t => !(t.recurrence_enabled && !t.parent_id));

    const expanded = expandTransactionInstances(materialized as any, templates as any, {
      horizonEnd: endOfMonth(addMonths(new Date(), 1)),
      rollOverUnpaidToToday: true,
    }) as unknown as TransactionInstance[];

    // rollOverUnpaidToToday só rola ocorrências físicas (Fase 1 do expansor);
    // ocorrências virtuais atrasadas (gaps nunca materializados) saem com sua
    // data original. Força o rollover aqui também para cumprir a regra em
    // qualquer caso: pendência vencida sempre aparece na data de hoje.
    const rolled = expanded.map(t =>
      t.status === 'pending' && t.instanceDate < todayStr
        ? { ...t, instanceDate: todayStr }
        : t
    );

    return rolled.sort((a, b) => {
      const dateCompare = b.instanceDate.localeCompare(a.instanceDate);
      if (dateCompare !== 0) return dateCompare;
      return (b.id ?? '').localeCompare(a.id ?? '');
    });
  }, [rawTransactions, todayStr]);

  const isOverdue = (t: TransactionInstance) =>
    t.status === 'pending' && t.originalInstanceDate < todayStr;

  // Coluna "Em Atraso": cobre TODA a história do cliente, não só o que está
  // visível na rolagem atual. Ordem cronológica decrescente pelo vencimento
  // original (o mais recente primeiro).
  const overdueInstances = useMemo(
    () => allInstances
      .filter(t => isOverdue(t))
      .sort((a, b) => b.originalInstanceDate.localeCompare(a.originalInstanceDate)),
    [allInstances, todayStr]
  );

  const overdueTotal = useMemo(
    () => overdueInstances.reduce((acc, cur) => acc + Number(cur.amount), 0),
    [overdueInstances]
  );

  const totals = useMemo(() => {
    const income = allInstances
      .filter(t => t.type === 'income')
      .reduce((acc, cur) => acc + Number(cur.amount), 0);

    const expense = allInstances
      .filter(t => t.type === 'expense')
      .reduce((acc, cur) => acc + Number(cur.amount), 0);

    return {
      income,
      expense,
      net: income - expense
    };
  }, [allInstances]);

  const visibleInstances = allInstances.slice(0, visibleCount);
  const hasMore = visibleCount < allInstances.length;

  useEffect(() => {
    if (!hasMore) return;
    const sentinel = sentinelRef.current;
    const root = scrollContainerRef.current;
    if (!sentinel || !root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount(c => Math.min(c + PAGE_SIZE, allInstances.length));
        }
      },
      { root, rootMargin: '300px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, allInstances.length]);

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      {/* Content Card */}
      <div className="relative bg-slate-50 w-full h-full md:max-w-5xl md:h-[85vh] md:rounded-[2rem] shadow-2xl overflow-hidden flex flex-col transition-all duration-300">

        {/* Modal Header */}
        <div className="bg-white border-b border-slate-100 px-6 py-5 shrink-0 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-teal-50 p-2.5 rounded-2xl text-teal-600 border border-teal-100/50">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-800 tracking-tight leading-tight">Extrato do Cliente</h3>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-0.5">{clientName}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 active:scale-95 rounded-xl transition-all border border-slate-200/60 bg-white shrink-0"
          >
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        {/* Cards de Totais */}
        <div className="bg-white border-b border-slate-100 px-6 py-5 grid grid-cols-3 gap-4 shrink-0">
          <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100 flex flex-col">
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">Total a Receber</span>
            <span className="text-base sm:text-lg font-black text-emerald-600 flex items-center">
              <TrendingUp className="w-4 h-4 mr-1 text-emerald-500" />
              {formatCurrency(totals.income)}
            </span>
          </div>

          <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100 flex flex-col">
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">Total a Pagar</span>
            <span className="text-base sm:text-lg font-black text-rose-600 flex items-center">
              <TrendingDown className="w-4 h-4 mr-1 text-rose-500" />
              {formatCurrency(totals.expense)}
            </span>
          </div>

          <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100 flex flex-col">
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">Saldo Geral</span>
            <span className={`text-base sm:text-lg font-black tracking-tight ${
              totals.net < 0 ? 'text-rose-600' : totals.net > 0 ? 'text-emerald-600' : 'text-slate-500'
            }`}>
              {formatCurrency(totals.net)}
            </span>
          </div>
        </div>

        {/* Corpo - Extrato estilo bancário, rolagem contínua */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center gap-3">
              <div className="w-10 h-10 border-4 border-teal-200 border-t-teal-500 rounded-full animate-spin" />
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Carregando Histórico...</span>
            </div>
          ) : allInstances.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-12 bg-white rounded-3xl border border-slate-200 border-dashed px-6">
              <div className="bg-slate-50 p-4 rounded-full mb-4">
                <Calendar className="w-8 h-8 text-slate-400" />
              </div>
              <h4 className="text-sm font-black text-slate-700 mb-1">Nenhum lançamento</h4>
              <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                Não existem transações registradas para este cliente.
              </p>
            </div>
          ) : (
            <div className={`flex flex-col gap-6 ${overdueInstances.length > 0 ? 'md:flex-row md:items-start' : ''}`}>
              {/* Coluna principal - Extrato completo */}
              <div className="bg-white rounded-3xl border border-slate-200 overflow-x-auto shadow-sm flex-1 min-w-0">
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 w-36">Data</th>
                      <th className="px-2 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Descrição</th>
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 text-right w-36">Valor</th>
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 text-center w-32">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleInstances.map((t) => {
                      const isIncome = t.type === 'income';
                      const overdue = isOverdue(t);
                      const formattedDate = format(parseISO(t.instanceDate), 'dd/MM/yyyy');

                      return (
                        <tr key={t.id} className={`transition-colors ${getRowClass(t)}`}>
                          <td className="px-4 py-3 text-xs font-bold text-slate-400 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              {t.status === 'pending' && (
                                <button
                                  onClick={() => openPaymentModal(t)}
                                  title="Confirmar pagamento"
                                  className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all shrink-0"
                                >
                                  <CheckCircle2 size={15} />
                                </button>
                              )}
                              <div>
                                {formattedDate}
                                {overdue && (
                                  <span className="block text-[9px] font-bold text-rose-500 mt-0.5">
                                    Venceu em {format(parseISO(t.originalInstanceDate), 'dd/MM/yyyy')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-3">
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

                {hasMore && (
                  <div ref={sentinelRef} className="py-5 flex items-center justify-center gap-2 text-slate-400">
                    <div className="w-4 h-4 border-2 border-slate-200 border-t-slate-400 rounded-full animate-spin" />
                    <span className="text-xs font-bold uppercase tracking-wider">Carregando mais...</span>
                  </div>
                )}
              </div>

              {/* Coluna secundária - Em Atraso (histórico completo, só aparece se houver contas atrasadas) */}
              {overdueInstances.length > 0 && (
                <div className="bg-rose-50/60 border border-rose-200 rounded-3xl shadow-sm shrink-0 w-full md:w-72 overflow-hidden">
                  <div className="px-4 py-3.5 border-b border-rose-200/70 bg-rose-100/50 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-black text-rose-700 uppercase tracking-wide">
                      <AlertTriangle size={14} />
                      Em Atraso
                      <span className="bg-rose-600 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center">
                        {overdueInstances.length}
                      </span>
                    </span>
                    <span className="text-sm font-black text-rose-700 font-manrope whitespace-nowrap">
                      {formatCurrency(overdueTotal)}
                    </span>
                  </div>

                  <div className="divide-y divide-rose-200/60 max-h-[420px] overflow-y-auto">
                    {overdueInstances.map(t => (
                      <div key={t.id} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold text-rose-500 whitespace-nowrap">
                            Venceu em {format(parseISO(t.originalInstanceDate), 'dd/MM/yyyy')}
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

      <ConfirmModal
        isOpen={!!payingTx}
        onClose={() => setPayingTx(null)}
        onConfirm={handleConfirmPayment}
        loading={confirmingPayment}
        title="Confirmar Pagamento"
        confirmLabel="Confirmar Pagamento"
        confirmColor="green"
        message={
          <div className="space-y-3">
            <div>
              <p className="font-bold text-slate-100">{payingTx?.description || 'Sem descrição'}</p>
              <p className="text-teal-400 font-black text-lg mt-0.5">
                {payingTx ? formatCurrency(payingTx.amount) : ''}
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Data do pagamento
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm font-medium text-slate-100 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
              />
            </div>
          </div>
        }
      />
    </div>
  );
}
