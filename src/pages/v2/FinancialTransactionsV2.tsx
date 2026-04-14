import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Plus, 
  MoreHorizontal,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import FinancialTransactionModalV2 from '../../components/v2/FinancialTransactionModalV2';

interface FinancialTransaction {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  date: string;
  description: string;
  status: 'pending' | 'paid';
  client?: { name: string };
  tags?: { tag: { name: string; color: string } }[];
}

const FinancialTransactionsV2 = () => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'income' | 'expense'>('income');

  const fetchTransactions = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('financial_transactions')
        .select(`
          *,
          client:clients(name),
          tags:transaction_tags(
            tag:financial_tags(name, color)
          )
        `)
        .eq('user_id', user.id)
        .order('date', { ascending: false });

      if (error) throw error;
      setTransactions(data || []);
    } catch (err) {
      console.error('Erro ao buscar transações:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [user]);

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-manrope">Fluxo Financeiro</h1>
          <p className="text-slate-500 text-sm">Gerencie suas receitas avulsas e contas a pagar em um só lugar.</p>
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
              Nova Receita
            </button>
            <button 
              onClick={() => {
                setModalType('expense');
                setIsModalOpen(true);
              }}
              className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm"
            >
              <Plus size={18} className="text-rose-600" />
              Nova Despesa
            </button>
          </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row justify-between gap-4">
          <div className="flex bg-white p-1 rounded-xl border border-slate-200 w-fit">
            <button 
              onClick={() => setFilter('all')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${filter === 'all' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}
            >
              Todos
            </button>
            <button 
              onClick={() => setFilter('income')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${filter === 'income' ? 'bg-teal-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}
            >
              Receitas
            </button>
            <button 
              onClick={() => setFilter('expense')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${filter === 'expense' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}
            >
              Despesas
            </button>
          </div>
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-teal-600 transition-colors" size={18} />
            <input 
              type="text" 
              placeholder="Buscar por descrição ou cliente..." 
              className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all w-full md:w-64"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Descrição</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Data</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Valor</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Vínculo</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">Carregando transações...</td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">Nenhuma transação encontrada.</td>
                </tr>
              ) : (
                transactions.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      {t.status === 'paid' ? (
                        <div className="flex items-center gap-1.5 text-green-600 bg-green-50 px-2 py-1 rounded-full w-fit">
                          <CheckCircle2 size={14} />
                          <span className="text-[10px] font-bold uppercase">Pago</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-amber-600 bg-amber-50 px-2 py-1 rounded-full w-fit">
                          <Clock size={14} />
                          <span className="text-[10px] font-bold uppercase">Pendente</span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-900">{t.description || 'Sem descrição'}</span>
                        <div className="flex gap-1 mt-1">
                          {t.tags?.map((tag: any, idx: number) => (
                            <span 
                              key={idx} 
                              className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600"
                              style={{ borderLeft: `2px solid ${tag.tag.color}` }}
                            >
                              {tag.tag.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {format(new Date(t.date), 'dd/MM/yyyy')}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-sm font-bold ${t.type === 'income' ? 'text-teal-600' : 'text-rose-600'}`}>
                        {t.type === 'income' ? '+' : '-'} {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.amount)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {t.client?.name || '-'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="text-slate-400 hover:text-slate-900 transition-colors p-1.5 rounded-lg hover:bg-white shadow-sm hover:shadow">
                        <MoreHorizontal size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {/* Modal de Transação */}
      <FinancialTransactionModalV2 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchTransactions}
        initialType={modalType}
      />
    </div>
  );
};

export default FinancialTransactionsV2;
