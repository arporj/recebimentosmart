import React, { useState, useEffect } from 'react';
import { X, TrendingUp, TrendingDown, Calendar, Clock, AlertCircle, CheckCircle2, FileText, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { format, parseISO, isBefore, startOfDay, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ClientStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
  selectedMonth?: Date;
}

interface StatementTransaction {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  date: string;
  description: string;
  status: 'pending' | 'paid' | 'partial' | 'cancelled';
  paid_amount?: number;
  paid_date?: string;
  category_name?: string;
  account_name?: string;
}

export default function ClientStatementModalV2({ isOpen, onClose, clientId, clientName, selectedMonth }: ClientStatementModalProps) {
  const [transactions, setTransactions] = useState<StatementTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');

  useEffect(() => {
    if (isOpen && clientId) {
      fetchStatement();
    }
  }, [isOpen, clientId, selectedMonth]);

  const fetchStatement = async () => {
    try {
      setLoading(true);
      // Consulta direta à view estendida ou tabela transactions trazendo as infos necessárias
      let query = (supabase as any)
        .from('v_financial_transactions') // Usando a view do sistema que já faz resolve de nomes
        .select('id, type, amount, date, description, status, paid_amount, paid_date, category_name, account_name')
        .eq('client_id', clientId);

      // Se um mês específico for fornecido, filtra as transações daquele mês
      if (selectedMonth) {
        const start = startOfMonth(selectedMonth).toISOString();
        const end = endOfMonth(selectedMonth).toISOString();
        query = query.gte('date', start).lte('date', end);
      }

      const { data, error } = await query.order('date', { ascending: false });

      if (error) throw error;
      setTransactions(data || []);
    } catch (err) {
      console.error('Erro ao buscar extrato do cliente:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const filteredTransactions = transactions.filter(t => 
    filterType === 'all' || t.type === filterType
  );

  // Cálculos rápidos
  const totalIncomePaid = transactions.filter(t => t.type === 'income' && t.status === 'paid').reduce((acc, cur) => acc + (cur.amount || 0), 0);
  const totalExpensePaid = transactions.filter(t => t.type === 'expense' && t.status === 'paid').reduce((acc, cur) => acc + (cur.amount || 0), 0);
  
  const pendingIncome = transactions.filter(t => t.type === 'income' && t.status === 'pending').reduce((acc, cur) => acc + (cur.amount || 0), 0);
  const pendingExpense = transactions.filter(t => t.type === 'expense' && t.status === 'pending').reduce((acc, cur) => acc + (cur.amount || 0), 0);

  const getStatusConfig = (status: string, dateStr: string) => {
    if (status === 'paid') {
      return {
        label: 'Pago',
        bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
      };
    }
    if (status === 'cancelled') {
      return {
        label: 'Cancelado',
        bg: 'bg-slate-100 text-slate-500 border-slate-200',
        icon: <X className="w-3.5 h-3.5 text-slate-400" />
      };
    }
    
    // Checar se está vencido
    const tDate = parseISO(dateStr);
    const today = startOfDay(new Date());
    if (isBefore(tDate, today)) {
      return {
        label: 'Atrasado',
        bg: 'bg-rose-50 text-rose-700 border-rose-200',
        icon: <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
      };
    }

    return {
      label: 'Pendente',
      bg: 'bg-amber-50 text-amber-700 border-amber-200',
      icon: <Clock className="w-3.5 h-3.5 text-amber-500" />
    };
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={onClose} />

      {/* Content Card */}
      <div className="relative bg-slate-50 rounded-3xl shadow-2xl w-full max-w-3xl h-[90vh] md:h-[80vh] overflow-hidden animate-in fade-in zoom-in-95 flex flex-col">
        
        {/* Modal Header */}
        <div className="bg-white border-b border-slate-100 px-6 py-5 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-teal-50 p-2.5 rounded-2xl text-teal-600">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800 tracking-tight leading-tight">Extrato Financeiro</h3>
              <p className="text-sm font-medium text-slate-500">{clientName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 active:bg-slate-200 rounded-xl transition-colors"
          >
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        {/* Resumo Rápido de Netting */}
        <div className="bg-white border-b border-slate-100 px-6 py-4 grid grid-cols-2 gap-4 shrink-0">
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Liquidado (Pago)</span>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-xl font-black text-slate-800">
                {formatCurrency(totalIncomePaid - totalExpensePaid)}
              </span>
            </div>
            <div className="flex justify-between text-xs font-bold text-slate-500 border-t border-slate-200/50 pt-2">
              <span className="flex items-center gap-1 text-emerald-600"><ArrowUpRight className="w-3 h-3" /> {formatCurrency(totalIncomePaid)}</span>
              <span className="flex items-center gap-1 text-rose-600"><ArrowDownRight className="w-3 h-3" /> {formatCurrency(totalExpensePaid)}</span>
            </div>
          </div>

          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Futuro (Pendente)</span>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-xl font-black text-slate-800">
                {formatCurrency(pendingIncome - pendingExpense)}
              </span>
            </div>
            <div className="flex justify-between text-xs font-bold text-slate-500 border-t border-slate-200/50 pt-2">
              <span className="flex items-center gap-1 text-indigo-500"><ArrowUpRight className="w-3 h-3" /> {formatCurrency(pendingIncome)}</span>
              <span className="flex items-center gap-1 text-amber-500"><ArrowDownRight className="w-3 h-3" /> {formatCurrency(pendingExpense)}</span>
            </div>
          </div>
        </div>

        {/* Barra de Filtro da Modal */}
        <div className="bg-white px-6 py-3 flex border-b border-slate-100 shrink-0 gap-2 overflow-x-auto">
          <button 
            onClick={() => setFilterType('all')}
            className={`px-4 py-1.5 rounded-xl text-xs font-black tracking-wide transition-all whitespace-nowrap border ${
              filterType === 'all' 
                ? 'bg-slate-800 text-white border-slate-800 shadow-sm' 
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            Todos
          </button>
          <button 
            onClick={() => setFilterType('income')}
            className={`px-4 py-1.5 rounded-xl text-xs font-black tracking-wide transition-all whitespace-nowrap border flex items-center gap-1.5 ${
              filterType === 'income' 
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' 
                : 'bg-emerald-50/50 text-emerald-700 border-emerald-200 hover:bg-emerald-50'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" /> Receitas
          </button>
          <button 
            onClick={() => setFilterType('expense')}
            className={`px-4 py-1.5 rounded-xl text-xs font-black tracking-wide transition-all whitespace-nowrap border flex items-center gap-1.5 ${
              filterType === 'expense' 
                ? 'bg-rose-600 text-white border-rose-600 shadow-sm' 
                : 'bg-rose-50/50 text-rose-700 border-rose-200 hover:bg-rose-50'
            }`}
          >
            <TrendingDown className="w-3.5 h-3.5" /> Despesas
          </button>
        </div>

        {/* Modal Body - Timeline Scroll */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center gap-3">
              <div className="w-10 h-10 border-4 border-teal-200 border-t-teal-500 rounded-full animate-spin" />
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Carregando Histórico...</span>
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-12 bg-white rounded-3xl border border-slate-200/60 border-dashed px-6">
              <div className="bg-slate-100 p-4 rounded-full mb-4">
                <Calendar className="w-8 h-8 text-slate-400" />
              </div>
              <h4 className="text-sm font-black text-slate-700 mb-1">Nenhum lançamento localizado</h4>
              <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                Não existem transações correspondentes aos filtros selecionados para este cliente.
              </p>
            </div>
          ) : (
            <div className="relative border-l-2 border-slate-200 pl-6 ml-3 space-y-6 py-2">
              {filteredTransactions.map((t) => {
                const statusCfg = getStatusConfig(t.status, t.date);
                const isIncome = t.type === 'income';
                const formattedDate = format(parseISO(t.date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });

                return (
                  <div key={t.id} className="relative">
                    {/* Timeline dot indicator */}
                    <div className={`absolute -left-[33px] top-1.5 w-4 h-4 rounded-full border-2 border-white shadow-sm transition-all ${
                      isIncome ? 'bg-emerald-500 ring-4 ring-emerald-50' : 'bg-rose-500 ring-4 ring-rose-50'
                    }`} />

                    {/* Card de Transação */}
                    <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:shadow-sm transition-all group">
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" /> {formattedDate}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border tracking-wide flex items-center gap-1 ${statusCfg.bg}`}>
                            {statusCfg.icon}
                            {statusCfg.label}
                          </span>
                        </div>

                        <h4 className="text-sm font-bold text-slate-700 truncate group-hover:text-slate-900 transition-colors">
                          {t.description}
                        </h4>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-slate-400">
                          {t.category_name && (
                            <span className="bg-slate-50 px-2 py-0.5 rounded text-slate-500 border border-slate-100">
                              {t.category_name}
                            </span>
                          )}
                          {t.account_name && (
                            <span className="flex items-center gap-1 text-[11px] uppercase font-bold text-indigo-400">
                              {t.account_name}
                            </span>
                          )}
                          {t.paid_date && (
                            <span className="text-[10px] font-bold text-emerald-500/80">
                              Baixa em: {format(parseISO(t.paid_date), 'dd/MM/yyyy')}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-left md:text-right self-end md:self-center border-t md:border-t-0 border-slate-100 pt-3 md:pt-0 w-full md:w-auto flex md:flex-col justify-between items-center md:items-end">
                        <span className="text-xs font-black text-slate-300 uppercase tracking-wider md:hidden">Valor</span>
                        <span className={`text-lg font-black font-manrope tracking-tight ${
                          isIncome ? 'text-emerald-600' : 'text-rose-600'
                        }`}>
                          {isIncome ? '+' : '-'} {formatCurrency(t.amount)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
