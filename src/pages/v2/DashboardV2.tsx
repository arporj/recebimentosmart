import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  ArrowUpCircle, 
  ArrowDownCircle, 
  AlertCircle,
  TrendingUp,
  Filter,
  MoreVertical,
  ChevronRight
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import FinancialTransactionModalV2 from '../../components/v2/FinancialTransactionModalV2';
import { AdBanner } from '../../components/v2/AdBanner';

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

const DashboardV2 = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'income' | 'expense'>('income');
  const [stats, setStats] = useState({
    balance: 0,
    income: 0,
    expenses: 0,
    delinquency: 0
  });

  const fetchStats = async () => {
    if (!user) return;

    try {
      setLoading(true);
      // Aqui buscaremos os dados reais das tabelas configuradas na migração
      const { data: transactions, error } = await supabase
        .from('financial_transactions')
        .select('*')
        .eq('user_id', user.id) as { data: FinancialTransaction[] | null, error: any };

      if (error) throw error;

      const income = transactions
        ?.filter(t => t.type === 'income')
        .reduce((acc, curr) => acc + curr.amount, 0) || 0;

      const expenses = transactions
        ?.filter(t => t.type === 'expense')
        .reduce((acc, curr) => acc + curr.amount, 0) || 0;

      setStats({
        balance: income - expenses,
        income,
        expenses,
        delinquency: 0 // Implementar lógica de vencidos
      });
    } catch (err) {
      console.error('Erro ao buscar estatísticas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [user]);

  return (
    <div className="p-6 space-y-8 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-manrope">Dashboard Financeiro</h1>
          <p className="text-slate-500">Bem-vindo de volta! Aqui está o resumo do seu negócio.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              setModalType('income');
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-teal-600/20"
          >
            <Plus size={18} />
            Novo Lançamento
          </button>
        </div>
      </div>

      {/* Espaço de publicidade horizontal para contas do plano free */}
      <AdBanner format="horizontal" />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 group hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-teal-50 text-teal-600 rounded-xl group-hover:bg-teal-600 group-hover:text-white transition-all">
              <TrendingUp size={24} />
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Saldo Previsto</span>
          </div>
          <div className="space-y-1">
            <h3 className="text-2xl font-bold text-slate-900 font-manrope">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.balance)}
            </h3>
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <ChevronRight size={12} className="text-teal-500" /> Atualizado agora
            </p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 group hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-green-50 text-green-600 rounded-xl group-hover:bg-green-600 group-hover:text-white transition-all">
              <ArrowUpCircle size={24} />
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Receitas</span>
          </div>
          <div className="space-y-1">
            <h3 className="text-2xl font-bold text-slate-900 font-manrope">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.income)}
            </h3>
            <p className="text-xs text-green-500 font-medium">+12.5% vs mês passado</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 group hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-rose-50 text-rose-600 rounded-xl group-hover:bg-rose-600 group-hover:text-white transition-all">
              <ArrowDownCircle size={24} />
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Despesas</span>
          </div>
          <div className="space-y-1">
            <h3 className="text-2xl font-bold text-slate-900 font-manrope">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.expenses)}
            </h3>
            <p className="text-xs text-rose-500 font-medium">-4.2% vs mês passado</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 group hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl group-hover:bg-amber-600 group-hover:text-white transition-all">
              <AlertCircle size={24} />
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Inadimplência</span>
          </div>
          <div className="space-y-1">
            <h3 className="text-2xl font-bold text-slate-900 font-manrope">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.delinquency)}
            </h3>
            <p className="text-xs text-amber-500 font-medium">Atenção requerida</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Gráfico Placeholder */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-slate-900 font-manrope">Fluxo de Caixa</h2>
            <div className="flex gap-2">
              <button className="p-2 text-slate-400 hover:text-slate-600"><Filter size={20} /></button>
              <button className="p-2 text-slate-400 hover:text-slate-600"><MoreVertical size={20} /></button>
            </div>
          </div>
          <div className="h-64 flex items-end justify-around gap-2 px-2">
            {[45, 60, 40, 80, 55, 70, 90].map((h, i) => (
              <div key={i} className="flex-1 space-y-2">
                <div 
                  className="bg-teal-500/10 rounded-t-lg hover:bg-teal-500 transition-colors w-full cursor-pointer relative group" 
                  style={{ height: `${h}%` }}
                >
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    R$ {(h * 150).toLocaleString()}
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 text-center font-bold uppercase tracking-tighter">
                  Sem {i + 1}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Últimas Transações */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-slate-900 font-manrope">Atividades</h2>
            <button className="text-xs font-bold text-teal-600 hover:underline">Ver todas</button>
          </div>
          <div className="space-y-6">
            {[1, 2, 3, 4].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className={`p-2 rounded-lg ${i % 2 === 0 ? 'bg-green-50 text-green-600' : 'bg-rose-50 text-rose-600'}`}>
                  {i % 2 === 0 ? <Plus size={16} /> : <Minus size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">Venda Direta - PDV</p>
                  <p className="text-xs text-slate-400">Há 2 horas</p>
                </div>
                <div className={`text-sm font-bold ${i % 2 === 0 ? 'text-green-600' : 'text-rose-600'}`}>
                  {i % 2 === 0 ? '+' : '-'} R$ {(Math.random() * 500).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Modal de Transação */}
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
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export default DashboardV2;
