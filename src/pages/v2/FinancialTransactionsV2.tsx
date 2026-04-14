import { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Plus, 
  MoreHorizontal,
  CheckCircle2,
  Clock,
  Pencil,
  Trash2,
  CircleCheckBig,
  CircleDashed
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import FinancialTransactionModalV2 from '../../components/v2/FinancialTransactionModalV2';

interface FinancialTransaction {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  date: string;
  description: string;
  status: 'pending' | 'paid';
  recurrence_enabled?: boolean;
  recurrence_period?: string;
  recurrence_interval?: number;
  client_id?: string;
  client?: { name: string };
  tags?: { tag: { name: string; color: string } }[];
}

const FinancialTransactionsV2 = () => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'income' | 'expense'>('income');
  const [editingTransaction, setEditingTransaction] = useState<FinancialTransaction | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggleStatus = async (transaction: FinancialTransaction) => {
    const newStatus = transaction.status === 'paid' ? 'pending' : 'paid';
    try {
      const { error } = await supabase
        .from('financial_transactions')
        .update({ status: newStatus })
        .eq('id', transaction.id);
      if (error) throw error;
      toast.success(newStatus === 'paid' ? 'Marcado como pago!' : 'Marcado como pendente.');
      await fetchTransactions();
    } catch {
      toast.error('Erro ao atualizar status.');
    }
    setOpenDropdown(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este lançamento?')) return;
    try {
      const { error } = await supabase
        .from('financial_transactions')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast.success('Lançamento excluído!');
      await fetchTransactions();
    } catch {
      toast.error('Erro ao excluir lançamento.');
    }
    setOpenDropdown(null);
  };

  const handleEdit = (transaction: FinancialTransaction) => {
    setEditingTransaction(transaction);
    setModalType(transaction.type);
    setIsModalOpen(true);
    setOpenDropdown(null);
  };

  const filteredTransactions = transactions.filter(t => {
    const matchesFilter = filter === 'all' || t.type === filter;
    const matchesSearch = searchTerm === '' || 
      (t.description?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (t.client?.name?.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

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
                setEditingTransaction(null);
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
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
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
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">Nenhuma transação encontrada.</td>
                </tr>
              ) : (
                filteredTransactions.map((t) => (
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
                      {format(new Date(t.date + 'T00:00:00'), 'dd/MM/yyyy')}
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
                      <div className="relative inline-block" ref={openDropdown === t.id ? dropdownRef : undefined}>
                        <button
                          onClick={() => setOpenDropdown(openDropdown === t.id ? null : t.id)}
                          className="text-slate-400 hover:text-slate-900 transition-colors p-1.5 rounded-lg hover:bg-slate-100"
                        >
                          <MoreHorizontal size={18} />
                        </button>
                        {openDropdown === t.id && (
                          <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-50 animate-in fade-in slide-in-from-top-1">
                            <button
                              onClick={() => handleToggleStatus(t)}
                              className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                            >
                              {t.status === 'paid' ? (
                                <><CircleDashed size={15} className="text-amber-500" /> Marcar como Pendente</>
                              ) : (
                                <><CircleCheckBig size={15} className="text-green-500" /> Marcar como Pago</>
                              )}
                            </button>
                            <button
                              onClick={() => handleEdit(t)}
                              className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                            >
                              <Pencil size={15} className="text-blue-500" /> Editar
                            </button>
                            <div className="border-t border-slate-100 my-1" />
                            <button
                              onClick={() => handleDelete(t.id)}
                              className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 size={15} /> Excluir
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {/* Footer com contagem */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/30">
          <p className="text-xs text-slate-400">
            {filteredTransactions.length} lançamento{filteredTransactions.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
      {/* Modal de Transação */}
      <FinancialTransactionModalV2 
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingTransaction(null);
        }}
        onSuccess={fetchTransactions}
        initialType={modalType}
      />
    </div>
  );
};

export default FinancialTransactionsV2;
