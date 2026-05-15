import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  ArrowUpCircle, 
  ArrowDownCircle, 
  AlertCircle,
  TrendingUp,
  ChevronRight,
  ChevronLeft,
  Calendar,
  Inbox
} from 'lucide-react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  eachWeekOfInterval, 
  endOfWeek, 
  isWithinInterval, 
  parseISO 
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import FinancialTransactionModalV2 from '../../components/v2/FinancialTransactionModalV2';

interface FinancialTransaction {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  date: string;
  description: string;
  status: 'pending' | 'paid';
  client_id?: string;
  user_id: string;
  created_at: string;
}

interface WeeklyStat {
  label: string;
  income: number;
  expense: number;
}

const DashboardV2 = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'income' | 'expense'>('income');
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [stats, setStats] = useState({
    balance: 0,
    income: 0,
    expenses: 0,
    monthlyDelinquency: 0,
    historicalDelinquency: 0
  });
  const [weeklyData, setWeeklyData] = useState<WeeklyStat[]>([]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const fetchStats = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const start = startOfMonth(currentMonth);
      const end = endOfMonth(currentMonth);
      const todayStr = format(new Date(), 'yyyy-MM-dd');

      // 1. Buscar transações apenas do mês corrente do usuário conectado
      const { data: txData, error: txError } = await supabase
        .from('financial_transactions')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', format(start, 'yyyy-MM-dd'))
        .lte('date', format(end, 'yyyy-MM-dd'))
        .order('date', { ascending: false }) as { data: FinancialTransaction[] | null, error: any };

      if (txError) throw txError;
      const loadedTx = txData || [];
      setTransactions(loadedTx);

      // 2. Buscar totalizador de inadimplência histórica (todas pendentes vencidas fora do escopo temporal restrito)
      const { data: histData, error: histError } = await supabase
        .from('financial_transactions')
        .select('amount')
        .eq('user_id', user.id)
        .eq('type', 'income')
        .eq('status', 'pending')
        .lt('date', todayStr) as { data: { amount: number }[] | null, error: any };

      if (histError) throw histError;
      
      // Cálculos dos cartões de topo
      const income = loadedTx
        .filter(t => t.type === 'income')
        .reduce((acc, curr) => acc + curr.amount, 0);

      const expenses = loadedTx
        .filter(t => t.type === 'expense')
        .reduce((acc, curr) => acc + curr.amount, 0);

      // Inadimplência do mês selecionado (receitas vencidas pendentes com data no mês atual)
      const monthlyDelinquency = loadedTx
        .filter(t => t.type === 'income' && t.status === 'pending' && t.date < todayStr)
        .reduce((acc, curr) => acc + curr.amount, 0);

      // Inadimplência geral
      const historicalDelinquency = histData
        ?.reduce((acc, curr) => acc + curr.amount, 0) || 0;

      setStats({
        balance: income - expenses,
        income,
        expenses,
        monthlyDelinquency,
        historicalDelinquency
      });

      // 3. Processamento do Gráfico de Barras Duplas por Semana
      const weeksInMonth = eachWeekOfInterval({ start, end });
      const computedWeeks: WeeklyStat[] = weeksInMonth.map((weekStart, index) => {
        const weekEnd = endOfWeek(weekStart);
        const weekTransactions = loadedTx.filter(t => {
          const tDate = parseISO(t.date);
          return isWithinInterval(tDate, { start: weekStart, end: weekEnd });
        });

        const wIncome = weekTransactions
          .filter(t => t.type === 'income')
          .reduce((acc, curr) => acc + curr.amount, 0);

        const wExpense = weekTransactions
          .filter(t => t.type === 'expense')
          .reduce((acc, curr) => acc + curr.amount, 0);

        return {
          label: `Sem ${index + 1}`,
          income: wIncome,
          expense: wExpense
        };
      });

      setWeeklyData(computedWeeks);

    } catch (err) {
      console.error('Erro ao carregar dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [user, currentMonth]);

  // Encontrar valor máximo do gráfico para escala visual fluida
  const maxChartValue = Math.max(
    ...weeklyData.map(w => Math.max(w.income, w.expense)), 
    100 // Mínimo para manter o gráfico apresentável mesmo vazio
  );

  const handlePrevMonth = () => setCurrentMonth(prev => subMonths(prev, 1));
  const handleNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));

  return (
    <div className="p-6 space-y-8 bg-slate-50 min-h-screen">
      {/* Header Dinâmico */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900 font-manrope tracking-tight">Dashboard Financeiro</h1>
          <p className="text-slate-500 text-sm mt-1">Acompanhe o fluxo real do seu negócio com total segurança.</p>
        </div>

        <div className="flex flex-wrap items-center gap-4 bg-slate-50/50 p-1.5 rounded-2xl border border-slate-100 self-start md:self-auto">
          {/* Seletor Temporal Consistente */}
          <div className="flex items-center bg-white px-3 py-1.5 rounded-xl shadow-sm border border-slate-200/50">
            <button 
              onClick={handlePrevMonth}
              className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-500"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="flex items-center gap-2 px-4 min-w-[160px] justify-center">
              <Calendar size={16} className="text-teal-600" />
              <span className="text-sm font-bold text-slate-800 capitalize select-none">
                {format(currentMonth, "MMMM 'de' yyyy", { locale: ptBR })}
              </span>
            </div>
            <button 
              onClick={handleNextMonth}
              className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-500"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <button 
            onClick={() => {
              setModalType('income');
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-teal-600/20 active:scale-95"
          >
            <Plus size={18} />
            Novo Lançamento
          </button>
        </div>
      </div>

      {/* Grid de Indicadores Reais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Saldo Previsto */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 group hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-teal-50 text-teal-600 rounded-xl group-hover:bg-teal-600 group-hover:text-white transition-all shadow-inner shadow-teal-600/5">
              <TrendingUp size={24} />
            </div>
            <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Saldo Líquido do Mês</span>
          </div>
          <div className="space-y-1">
            <h3 className={`text-2xl font-bold font-manrope ${stats.balance >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
              {formatCurrency(stats.balance)}
            </h3>
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <ChevronRight size={12} className="text-teal-500" /> Baseado em lançamentos do mês
            </p>
          </div>
        </div>

        {/* Receitas */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 group hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl group-hover:bg-emerald-600 group-hover:text-white transition-all shadow-inner">
              <ArrowUpCircle size={24} />
            </div>
            <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Receitas do Mês</span>
          </div>
          <div className="space-y-1">
            <h3 className="text-2xl font-bold text-slate-900 font-manrope">
              {formatCurrency(stats.income)}
            </h3>
            <p className="text-xs text-emerald-600 font-bold tracking-tight">Total previsto e pago</p>
          </div>
        </div>

        {/* Despesas */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 group hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-rose-50 text-rose-600 rounded-xl group-hover:bg-rose-600 group-hover:text-white transition-all shadow-inner">
              <ArrowDownCircle size={24} />
            </div>
            <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Despesas do Mês</span>
          </div>
          <div className="space-y-1">
            <h3 className="text-2xl font-bold text-slate-900 font-manrope">
              {formatCurrency(stats.expenses)}
            </h3>
            <p className="text-xs text-rose-600 font-bold tracking-tight">Total de custos gerados</p>
          </div>
        </div>

        {/* Inadimplência Integrada */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 group hover:shadow-md transition-all relative overflow-hidden">
          <div className="flex items-center justify-between mb-4 relative z-10">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl group-hover:bg-amber-600 group-hover:text-white transition-all shadow-inner">
              <AlertCircle size={24} />
            </div>
            <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Inadimplência</span>
          </div>
          <div className="space-y-1 relative z-10">
            <h3 className="text-2xl font-bold text-slate-900 font-manrope">
              {formatCurrency(stats.monthlyDelinquency)}
            </h3>
            <div className="pt-2 border-t border-slate-100 mt-2 flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-tight">Atrasado Histórico:</span>
              <span className="text-[11px] font-black text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                {formatCurrency(stats.historicalDelinquency)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Painéis de Fluxo e Movimentação */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Gráfico Semanal de Barras Duplas Real */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h2 className="text-lg font-bold text-slate-900 font-manrope tracking-tight">Fluxo de Caixa Semanal</h2>
              <p className="text-xs text-slate-400 font-medium mt-0.5">Distribuição real de receitas e despesas por semana no calendário</p>
            </div>
            <div className="flex items-center gap-4 bg-slate-50 px-3 py-1.5 rounded-xl text-[11px] font-bold border border-slate-100 shadow-inner">
              <div className="flex items-center gap-1.5 text-emerald-600">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Receita
              </div>
              <div className="flex items-center gap-1.5 text-rose-600">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Despesa
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-[240px] flex items-end justify-between gap-4 lg:gap-8 px-2 border-b border-slate-100 pb-2">
            {weeklyData.map((w, i) => {
              const incHeight = (w.income / maxChartValue) * 100;
              const expHeight = (w.expense / maxChartValue) * 100;

              return (
                <div key={i} className="flex-1 flex flex-col items-center h-full justify-end">
                  {/* Conjunto de Barras Duplas */}
                  <div className="w-full flex items-end justify-center gap-1.5 h-full group relative">
                    {/* Barra de Receita */}
                    <div 
                      className="w-1/2 bg-emerald-500/20 rounded-t-md hover:bg-emerald-500 transition-all cursor-pointer flex items-end relative min-h-[2px]"
                      style={{ height: `${Math.max(incHeight, 2)}%` }}
                    >
                      <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 font-bold whitespace-nowrap border border-slate-700">
                        Rec: {formatCurrency(w.income)}
                      </div>
                    </div>

                    {/* Barra de Despesa */}
                    <div 
                      className="w-1/2 bg-rose-500/20 rounded-t-md hover:bg-rose-500 transition-all cursor-pointer flex items-end relative min-h-[2px]"
                      style={{ height: `${Math.max(expHeight, 2)}%` }}
                    >
                      <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 font-bold whitespace-nowrap border border-slate-700">
                        Desp: {formatCurrency(w.expense)}
                      </div>
                    </div>
                  </div>

                  {/* Identificador da Semana */}
                  <p className="text-[10px] text-slate-500 text-center font-extrabold uppercase tracking-wider mt-3 pt-2 border-t border-dashed border-slate-100 w-full">
                    {w.label}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Últimas Atividades Reais */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col h-full">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900 font-manrope tracking-tight">Movimentações</h2>
              <p className="text-xs text-slate-400">Lançamentos mais recentes no mês</p>
            </div>
          </div>
          
          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            {transactions.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-8">
                <div className="p-3 bg-slate-50 text-slate-400 rounded-2xl mb-3 border border-dashed border-slate-200">
                  <Inbox size={28} />
                </div>
                <p className="text-sm font-bold text-slate-800">Nenhuma movimentação</p>
                <p className="text-xs text-slate-400 mt-1 max-w-[180px]">Nenhum lançamento foi encontrado neste mês.</p>
              </div>
            ) : (
              transactions.slice(0, 5).map((t) => (
                <div key={t.id} className="flex items-center gap-3 p-3 bg-slate-50/50 hover:bg-slate-50 border border-slate-100/50 hover:border-slate-200/70 rounded-xl transition-all group cursor-default">
                  <div className={`p-2 rounded-lg shadow-sm transition-all ${t.type === 'income' ? 'bg-emerald-100 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white' : 'bg-rose-100 text-rose-700 group-hover:bg-rose-600 group-hover:text-white'}`}>
                    {t.type === 'income' ? <Plus size={14} className="font-black" /> : <Minus size={14} className="font-black" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-slate-800 truncate group-hover:text-slate-900 capitalize">{t.description || 'Sem Descrição'}</p>
                    <p className="text-[10px] font-bold text-slate-400">
                      {format(parseISO(t.date), 'dd/MM/yyyy')} • <span className={t.status === 'paid' ? 'text-emerald-600' : 'text-amber-600 font-extrabold'}>
                        {t.status === 'paid' ? 'Pago' : 'Pendente'}
                      </span>
                    </p>
                  </div>
                  <div className={`text-xs font-black ${t.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {t.type === 'income' ? '+' : '-'} {formatCurrency(t.amount)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modal de Lançamento integrado às estatísticas reais */}
      <FinancialTransactionModalV2 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchStats}
        initialType={modalType}
      />
    </div>
  );
};

const Minus = ({ size, ...props }: { size: number; [key: string]: any }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export default DashboardV2;

