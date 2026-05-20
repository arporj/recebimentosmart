import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  FileText 
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
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

interface ClientStatementModalProps {
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
  paid_amount?: number;
  paid_date?: string;
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

export default function ClientStatementModalV2({ 
  isOpen, 
  onClose, 
  clientId, 
  clientName, 
  selectedMonth 
}: ClientStatementModalProps) {
  const [rawTransactions, setRawTransactions] = useState<FinancialTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(selectedMonth || new Date());

  useEffect(() => {
    if (isOpen && clientId) {
      fetchStatement();
    }
  }, [isOpen, clientId]);

  const fetchStatement = async () => {
    try {
      setLoading(true);
      // Buscar todas as transações ativas do cliente (não canceladas) para permitir a expansão de recorrências localmente
      const { data, error } = await supabase
        .from('financial_transactions')
        .select('id, type, amount, date, description, status, recurrence_enabled, recurrence_period, recurrence_interval, recurrence_end_date, parent_id, modalidade, installment_total, installment_current, paid_amount, paid_date')
        .eq('client_id', clientId)
        .neq('status', 'cancelled');

      if (error) throw error;
      setRawTransactions(data || []);
    } catch (err) {
      console.error('Erro ao buscar extrato do cliente:', err);
    } finally {
      setLoading(false);
    }
  };

  // Expansão de recorrências e parcelamento localmente para o mês atual
  const monthInstances = useMemo((): TransactionInstance[] => {
    const instances: TransactionInstance[] = [];
    const maxDate = endOfMonth(currentMonth);

    // Identificar registros físicos daquela cadeia para evitar duplicações
    const physicalDatesByParent = new Map<string, Set<string>>();
    for (const t of rawTransactions) {
      const parentId = t.parent_id || t.id;
      if (!physicalDatesByParent.has(parentId)) {
        physicalDatesByParent.set(parentId, new Set());
      }
      physicalDatesByParent.get(parentId)!.add(t.date);
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
        const alreadyHasPhysical = physicalDatesByParent.get(parentId)?.has(dateStr);

        if (!alreadyHasPhysical || dateStr === t.date) {
          const monthsDiff = (cursor.getFullYear() - tDate.getFullYear()) * 12 + (cursor.getMonth() - tDate.getMonth());
          const currentInst = (t.installment_current || 1) + monthsDiff;

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

    // Filtrar apenas as instâncias que caem no mês selecionado
    const filtered = instances.filter(t => isSameMonth(parseISO(t.instanceDate), currentMonth));

    // Ordenar decrescente pela data da instância e depois por id (estável)
    return filtered.sort((a, b) => {
      const dateCompare = b.instanceDate.localeCompare(a.instanceDate);
      if (dateCompare !== 0) return dateCompare;
      return (b.id ?? '').localeCompare(a.id ?? '');
    });
  }, [rawTransactions, currentMonth]);

  // Cálculos rápidos com inversão de perspectiva para o usuário logado:
  // - Despesa original do Remetente ('expense') -> Receita para o Receptor ('income', A Receber)
  // - Receita original do Remetente ('income') -> Despesa para o Receptor ('expense', A Pagar)
  const totals = useMemo(() => {
    // Calculados sobre as instâncias correspondentes ao mês
    const income = monthInstances
      .filter(t => t.type === 'expense')
      .reduce((acc, cur) => acc + Number(cur.amount), 0);

    const expense = monthInstances
      .filter(t => t.type === 'income')
      .reduce((acc, cur) => acc + Number(cur.amount), 0);

    return {
      income,
      expense,
      net: income - expense
    };
  }, [monthInstances]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const monthLabel = format(currentMonth, "MMMM 'de' yyyy", { locale: ptBR });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      {/* Content Card (Fullscreen no mobile e largo no desktop) */}
      <div className="relative bg-slate-50 w-full h-full md:max-w-5xl md:h-[85vh] md:rounded-[2rem] shadow-2xl overflow-hidden flex flex-col transition-all duration-300">
        
        {/* Modal Header */}
        <div className="bg-white border-b border-slate-100 px-6 py-5 shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-teal-50 p-2.5 rounded-2xl text-teal-600 border border-teal-100/50">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-800 tracking-tight leading-tight">Extrato Financeiro</h3>
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

        {/* Cards Rápidos de Totais no Mês */}
        <div className="bg-white border-b border-slate-100 px-6 py-5 grid grid-cols-3 gap-4 shrink-0">
          <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100 flex flex-col">
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">Entradas (Mês)</span>
            <span className="text-base sm:text-lg font-black text-emerald-600 flex items-center">
              <TrendingUp className="w-4 h-4 mr-1 text-emerald-500" />
              {formatCurrency(totals.income)}
            </span>
          </div>

          <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100 flex flex-col">
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">Saídas (Mês)</span>
            <span className="text-base sm:text-lg font-black text-rose-600 flex items-center">
              <TrendingDown className="w-4 h-4 mr-1 text-rose-500" />
              {formatCurrency(totals.expense)}
            </span>
          </div>

          <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100 flex flex-col">
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">Netting do Mês</span>
            <span className={`text-base sm:text-lg font-black tracking-tight ${
              totals.net < 0 ? 'text-rose-600' : totals.net > 0 ? 'text-emerald-600' : 'text-slate-500'
            }`}>
              {formatCurrency(totals.net)}
            </span>
          </div>
        </div>

        {/* Modal Body - Tabela Minimalista */}
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
            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-400 w-24">Data</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-400">Descrição</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-400 text-right w-36">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {monthInstances.map((t) => {
                    const isIncome = t.type === 'expense'; // Inversão aplicada: despesa original do remetente = receita para o receptor
                    const formattedDate = format(parseISO(t.instanceDate), 'dd/MM/yyyy');

                    return (
                      <tr key={t.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-6 py-4 text-xs font-bold text-slate-400 whitespace-nowrap">
                          {formattedDate}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-xs sm:text-sm font-bold text-slate-700 truncate max-w-md group-hover:text-slate-900 transition-colors">
                            {t.description}
                          </div>
                          {t.status === 'pending' && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold bg-amber-50 text-amber-700 border border-amber-100 uppercase tracking-wide mt-1 scale-95 origin-left">
                              Pendente
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <span className={`text-sm sm:text-base font-black font-manrope ${
                            isIncome ? 'text-emerald-600' : 'text-rose-600'
                          }`}>
                            {isIncome ? '+' : '-'} {formatCurrency(t.amount)}
                          </span>
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
