import { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, 
  ArrowDownCircle,
  ArrowRightLeft,
  RefreshCcw,
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Copy,
  ChevronLeft,
  ChevronRight,
  Filter
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { format, startOfMonth, endOfMonth, addMonths, subMonths, isAfter, isBefore, isSameMonth, parseISO, addDays, addWeeks, addYears } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'react-hot-toast';
import FinancialTransactionModalV2 from '../../components/v2/FinancialTransactionModalV2';

interface FinancialTransaction {
  id: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  date: string;
  description: string;
  status: 'pending' | 'paid' | 'partial';
  paid_amount?: number;
  paid_date?: string;
  recurrence_enabled?: boolean;
  recurrence_period?: string;
  recurrence_interval?: number;
  client_id?: string;
  account_id?: string;
  destination_account_id?: string;
  category_id?: string;
  client?: { name: string };
  account?: { name: string; type: string };
  destination_account?: { name: string; type: string };
  category?: { name: string; icon: string | null; parent_id: string | null };
  installment_total?: number;
  installment_current?: number;
  tags?: { tag: { id: string; name: string; color: string } }[];
}

interface TransactionInstance extends FinancialTransaction {
  instanceDate: string;
  isVirtual: boolean;
}

const FinancialTransactionsV2 = () => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'income' | 'expense' | 'transfer'>('income');
  const [editingTransaction, setEditingTransaction] = useState<FinancialTransaction | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const today = new Date();

  const fetchTransactions = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from('v_financial_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: true });

      if (error) throw error;
      
      const mappedData = (data || []).map((t: any) => ({
        ...t,
        account: t.account_name ? { name: t.account_name, type: t.account_type } : null,
        destination_account: t.destination_account_name ? { name: t.destination_account_name, type: t.destination_account_type } : null,
        client: t.client_name ? { name: t.client_name } : null,
        category: t.category_name ? { name: t.category_name, icon: t.category_icon, parent_id: t.category_parent_id } : null
      }));

      setTransactions(mappedData);
    } catch (err) {
      console.error('Erro ao buscar transações:', err);
      toast.error('Erro ao carregar transações');
    } finally {
      setLoading(false);
    }
  };

  const fetchAccounts = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('financial_accounts')
        .select('*')
        .in('type', ['checking', 'investment'])
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      setAccounts(data || []);

      const saved = localStorage.getItem('recebimento_smart_selected_accounts');
      if (saved) {
        try {
          const ids = JSON.parse(saved);
          setSelectedAccountIds(new Set(ids));
        } catch (e) {
          console.error('Erro ao carregar contas salvas:', e);
        }
      } else if (data && data.length > 0) {
        setSelectedAccountIds(new Set(data.map(a => a.id)));
      }
    } catch (err) {
      console.error('Erro ao buscar contas:', err);
    }
  };

  useEffect(() => {
    fetchTransactions();
    fetchAccounts();
  }, [user]);

  useEffect(() => {
    if (selectedAccountIds.size > 0 || accounts.length > 0) {
      localStorage.setItem('recebimento_smart_selected_accounts', JSON.stringify(Array.from(selectedAccountIds)));
    }
  }, [selectedAccountIds, accounts.length]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const monthInstances = useMemo((): TransactionInstance[] => {
    const instances: TransactionInstance[] = [];

    for (const t of transactions) {
      const tDate = parseISO(t.date);

      if (!t.recurrence_enabled) {
        if (isSameMonth(tDate, currentMonth)) {
          instances.push({ ...t, instanceDate: t.date, isVirtual: false });
        }
        continue;
      }

      const interval = t.recurrence_interval || 1;
      const period = t.recurrence_period || 'monthly';
      const maxDate = endOfMonth(currentMonth);
      const absMax = addYears(today, 5);
      
      let cursor = new Date(tDate);
      while (isBefore(cursor, absMax)) {
        if (isSameMonth(cursor, currentMonth)) {
          const monthsDiff = (cursor.getFullYear() - tDate.getFullYear()) * 12 + (cursor.getMonth() - tDate.getMonth());
          const currentInst = (t.installment_current || 1) + monthsDiff;

          if (period === 'parcelada' && t.installment_total && currentInst > t.installment_total) {
            break;
          }

          instances.push({
            ...t,
            instanceDate: format(cursor, 'yyyy-MM-dd'),
            isVirtual: format(cursor, 'yyyy-MM-dd') !== t.date,
            installment_current: currentInst
          });
          break;
        }
        
        if (isAfter(cursor, maxDate)) break;
        
        switch (period) {
          case 'daily': cursor = addDays(cursor, interval); break;
          case 'weekly': cursor = addWeeks(cursor, interval); break;
          case 'monthly': cursor = addMonths(cursor, interval); break;
          case 'yearly': cursor = addYears(cursor, interval); break;
          default: cursor = addMonths(cursor, interval);
        }
      }
    }

    return instances.sort((a, b) => a.instanceDate.localeCompare(b.instanceDate));
  }, [transactions, currentMonth]);

  const getVisualStatus = (t: TransactionInstance): 'paid' | 'pending' | 'overdue' | 'partial' => {
    if (t.status === 'paid') return 'paid';
    if (t.status === 'partial') return 'partial';
    const dueDate = parseISO(t.instanceDate);
    if (isBefore(dueDate, today) && !isSameMonth(dueDate, today) || (isSameMonth(dueDate, today) && dueDate < today)) {
      return 'overdue';
    }
    return 'pending';
  };

  const handleEdit = (t: FinancialTransaction) => {
    setEditingTransaction(t);
    setModalType(t.type);
    setIsModalOpen(true);
    setOpenDropdown(null);
  };

  const handleClone = async (t: FinancialTransaction) => {
    try {
      const { error } = await supabase
        .from('financial_transactions')
        .insert({
          user_id: user!.id,
          type: t.type,
          amount: t.amount,
          date: t.date,
          description: `${t.description || ''} (cópia)`,
          status: 'pending',
          client_id: t.client_id || null,
          account_id: t.account_id || null,
          category_id: t.category_id || null,
          recurrence_enabled: t.recurrence_enabled,
          recurrence_period: t.recurrence_period,
          recurrence_interval: t.recurrence_interval
        });
      if (error) throw error;
      toast.success('Lançamento clonado!');
      fetchTransactions();
    } catch {
      toast.error('Erro ao clonar.');
    }
    setOpenDropdown(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este lançamento?')) return;
    try {
      const { error } = await supabase.from('financial_transactions').delete().eq('id', id);
      if (error) throw error;
      toast.success('Excluído!');
      fetchTransactions();
    } catch {
      toast.error('Erro ao excluir.');
    }
    setOpenDropdown(null);
  };

  const accountsData = useMemo(() => {
    return accounts.map(acc => {
      const accTransactions = transactions.filter(t => t.account_id === acc.id || t.destination_account_id === acc.id);
      const monthStart = startOfMonth(currentMonth);
      
      const previousTotal = accTransactions
        .filter(t => isBefore(parseISO(t.date), monthStart) && t.status === 'paid')
        .reduce((sum, t) => {
          if (t.type === 'income') return sum + t.amount;
          if (t.type === 'expense') return sum - t.amount;
          if (t.type === 'transfer') {
             if (t.destination_account_id === acc.id) return sum + t.amount;
             if (t.account_id === acc.id) return sum - t.amount;
          }
          return sum;
        }, acc.initial_balance || 0);

      const monthConfirmed = accTransactions
        .filter(t => isSameMonth(parseISO(t.date), currentMonth) && t.status === 'paid')
        .reduce((sum, t) => {
          if (t.type === 'income') return sum + t.amount;
          if (t.type === 'expense') return sum - t.amount;
          if (t.type === 'transfer') {
             if (t.destination_account_id === acc.id) return sum + t.amount;
             if (t.account_id === acc.id) return sum - t.amount;
          }
          return sum;
        }, 0);

      const monthProjected = accTransactions
        .filter(t => isSameMonth(parseISO(t.date), currentMonth))
        .reduce((sum, t) => {
          if (t.type === 'income') return sum + t.amount;
          if (t.type === 'expense') return sum - t.amount;
          if (t.type === 'transfer') {
             if (t.destination_account_id === acc.id) return sum + t.amount;
             if (t.account_id === acc.id) return sum - t.amount;
          }
          return sum;
        }, 0);

      return { ...acc, confirmed: previousTotal + monthConfirmed, projected: previousTotal + monthProjected };
    });
  }, [accounts, transactions, currentMonth]);

  const totals = useMemo(() => {
    const selected = accountsData.filter(a => selectedAccountIds.has(a.id));
    const confirmed = selected.reduce((sum, a) => sum + a.confirmed, 0);
    const projected = selected.reduce((sum, a) => sum + a.projected, 0);

    const monthTrans = monthInstances.filter(t => 
      (t.account_id && selectedAccountIds.has(t.account_id)) || 
      (t.destination_account_id && selectedAccountIds.has(t.destination_account_id))
    );

    const totalIncome = monthTrans.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = monthTrans.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const transfersIn = monthTrans.filter(t => t.type === 'transfer' && t.destination_account_id && selectedAccountIds.has(t.destination_account_id)).reduce((sum, t) => sum + t.amount, 0);
    const transfersOut = monthTrans.filter(t => t.type === 'transfer' && t.account_id && selectedAccountIds.has(t.account_id)).reduce((sum, t) => sum + t.amount, 0);

    return { 
      confirmed, projected, income: totalIncome, expense: totalExpense, transfersIn, transfersOut,
      result: totalIncome - totalExpense + (transfersIn - transfersOut)
    };
  }, [accountsData, selectedAccountIds, monthInstances]);

  const displayInstances = useMemo(() => {
    return monthInstances.filter(t => {
      const isSelected = (t.account_id && selectedAccountIds.has(t.account_id)) || (t.destination_account_id && selectedAccountIds.has(t.destination_account_id));
      const matchesFilter = filter === 'all' || t.type === filter;
      const matchesSearch = searchTerm === '' || t.description?.toLowerCase().includes(searchTerm.toLowerCase());
      return isSelected && matchesFilter && matchesSearch;
    });
  }, [monthInstances, selectedAccountIds, filter, searchTerm]);

  const monthLabel = format(currentMonth, "MMMM 'de' yyyy", { locale: ptBR });

  const SidebarContent = () => (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between">
        <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2.5 hover:bg-slate-100 rounded-2xl transition-all active:scale-90">
          <ChevronLeft size={22} className="text-slate-600" />
        </button>
        <div className="text-center">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-1">Mês de Referência</span>
          <h2 className="text-xl font-black text-slate-800 capitalize font-manrope">{monthLabel}</h2>
        </div>
        <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2.5 hover:bg-slate-100 rounded-2xl transition-all active:scale-90">
          <ChevronRight size={22} className="text-slate-600" />
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-5 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center text-xs font-extrabold uppercase tracking-widest text-slate-400">
          <span>Contas</span>
          <span>Saldo</span>
        </div>
        <div className="divide-y divide-slate-50 max-h-[400px] overflow-y-auto">
          {accountsData.map((acc) => (
            <div key={acc.id} className="p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
              <input 
                type="checkbox"
                checked={selectedAccountIds.has(acc.id)}
                onChange={() => {
                  const next = new Set(selectedAccountIds);
                  if (next.has(acc.id)) next.delete(acc.id); else next.add(acc.id);
                  setSelectedAccountIds(next);
                }}
                className="w-5 h-5 rounded-lg border-slate-300 text-indigo-600 cursor-pointer"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-700 truncate">{acc.name}</p>
                <p className="text-[10px] text-slate-400">{acc.type === 'checking' ? 'Corrente' : 'Inv.'}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-black text-emerald-600">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(acc.confirmed)}</p>
                <p className="text-[10px] font-bold text-slate-300">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(acc.projected)}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="p-5 bg-slate-900 text-white flex justify-between items-center">
          <div className="flex flex-col"><span className="text-[10px] font-black opacity-40 uppercase">Total</span></div>
          <div className="text-right">
            <p className="text-lg font-black">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.confirmed)}</p>
            <p className="text-[10px] font-bold opacity-40">Proj: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.projected)}</p>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-indigo-600 to-violet-700 p-7 rounded-[2.5rem] text-white space-y-8 relative overflow-hidden group">
        <div className="space-y-6 relative z-10">
          <div className="flex items-center justify-between opacity-90 border-b border-white/10 pb-3">
            <span className="text-[10px] font-black uppercase tracking-[0.25em]">Resumo Mensal</span>
            <Filter size={16} className="text-white/50" />
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <span className="text-[10px] uppercase font-black text-white/50">Ganhos</span>
              <p className="text-lg font-black">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.income)}</p>
            </div>
            <div>
              <span className="text-[10px] uppercase font-black text-white/50">Gastos</span>
              <p className="text-lg font-black">-{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.expense)}</p>
            </div>
          </div>
        </div>
        <div className="pt-6 border-t border-white/20 relative z-10">
          <span className="text-[10px] font-black uppercase text-white/50">Líquido</span>
          <p className="text-4xl font-black">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.result)}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen relative">
      <div className="max-w-[1700px] mx-auto">
        <div className="flex flex-col lg:flex-row gap-6">
          <aside className="hidden lg:block w-[360px] flex-shrink-0"><SidebarContent /></aside>

          <div className="lg:hidden space-y-4 mb-4">
            <div className="flex items-center justify-between p-3 bg-white rounded-2xl border border-slate-100 shadow-sm" onClick={() => setIsSidebarOpen(true)}>
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1 w-5"><div className="h-0.5 w-full bg-slate-400" /><div className="h-0.5 w-full bg-slate-400" /><div className="h-0.5 w-full bg-slate-400" /></div>
                <span className="text-xs font-black text-slate-800">Resumo</span>
              </div>
              <div className="text-right">
                <p className="text-sm font-black text-slate-800">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.confirmed)}</p>
              </div>
            </div>
          </div>

          {isSidebarOpen && (
            <div className="fixed inset-0 z-[200] lg:hidden">
              <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)} />
              <div className="absolute left-0 top-0 bottom-0 w-[300px] bg-slate-50 p-6 overflow-y-auto animate-in slide-in-from-left">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-black">Resumo</h2>
                  <button onClick={() => setIsSidebarOpen(false)} className="p-2"><ChevronLeft size={24} /></button>
                </div>
                <SidebarContent />
              </div>
            </div>
          )}

          <main className="flex-1 space-y-6 min-w-0">
            <div className="flex flex-col xl:flex-row gap-4 justify-between">
              <div className="flex-1 relative group">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input 
                  type="text" placeholder="Filtrar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-14 pr-6 py-4 bg-white border border-slate-200 rounded-3xl font-bold shadow-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <button onClick={fetchTransactions} disabled={loading} className={`p-4 bg-white border border-slate-200 rounded-3xl shadow-sm ${loading ? 'animate-spin' : ''}`}><RefreshCcw size={20} /></button>
                <button 
                  onClick={() => { setModalType('income'); setEditingTransaction(null); setIsModalOpen(true); }}
                  className="flex items-center gap-2 bg-slate-900 text-white px-8 py-4 rounded-3xl font-black shadow-xl"
                >
                  <Plus size={20} /><span>Novo Lançamento</span>
                </button>
              </div>
            </div>

            <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
              <div className="px-8 py-5 border-b border-slate-50 bg-slate-50/20 flex items-center justify-between">
                <h2 className="text-xl font-black">Transações</h2>
                <div className="flex gap-1 bg-white p-1 rounded-2xl shadow-sm border border-slate-100">
                  {['all', 'income', 'expense', 'transfer'].map(f => (
                    <button key={f} onClick={() => setFilter(f)} className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${filter === f ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400'}`}>
                      {f === 'all' ? 'TUDO' : f === 'income' ? 'ENTRADAS' : f === 'expense' ? 'SAÍDAS' : 'TRANSF.'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="divide-y divide-slate-50">
                {displayInstances.length === 0 ? (
                  <div className="py-20 text-center"><p className="text-slate-400 font-bold">Nenhum lançamento.</p></div>
                ) : (
                  displayInstances.map((t) => {
                    const status = getVisualStatus(t);
                    const dropdownKey = `${t.id}-${t.instanceDate}`;
                    return (
                      <div key={dropdownKey} className="group flex items-center gap-4 px-8 py-5 hover:bg-slate-50 transition-colors">
                        <div className={`p-3 rounded-2xl ${t.type === 'income' ? 'bg-emerald-50 text-emerald-600' : t.type === 'expense' ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600'}`}>
                          {t.type === 'income' ? <Plus size={20} /> : t.type === 'expense' ? <ArrowDownCircle size={20} /> : <ArrowRightLeft size={20} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <h4 className="font-extrabold text-slate-800 truncate">{t.description || 'S/ Descrição'}</h4>
                            <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ring-1 ${status === 'paid' ? 'bg-emerald-50 text-emerald-600 ring-emerald-100' : 'bg-amber-50 text-amber-600 ring-amber-100'}`}>{status}</span>
                          </div>
                          <p className="text-[10px] font-bold text-slate-400">{format(parseISO(t.instanceDate), 'dd/MM/yy')} {t.account ? `/ ${t.account.name}` : ''}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-slate-800 text-lg">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.amount)}</p>
                        </div>
                        <div className="relative" ref={openDropdown === dropdownKey ? dropdownRef : null}>
                          <button onClick={() => setOpenDropdown(openDropdown === dropdownKey ? null : dropdownKey)} className="p-2 text-slate-300 hover:text-slate-600"><MoreVertical size={20} /></button>
                          {openDropdown === dropdownKey && (
                            <div className={`absolute right-0 w-48 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-[300] ${displayInstances.indexOf(t) >= displayInstances.length - 3 ? 'bottom-full mb-2' : 'top-full mt-2'}`}>
                              <button onClick={() => handleEdit(t)} className="w-full px-4 py-2 text-left text-xs font-bold hover:bg-slate-50 flex items-center gap-3"><Pencil size={14} /> Editar</button>
                              <button onClick={() => handleClone(t)} className="w-full px-4 py-2 text-left text-xs font-bold hover:bg-slate-50 flex items-center gap-3"><Copy size={14} /> Clonar</button>
                              <button onClick={() => handleDelete(t.id)} className="w-full px-4 py-2 text-left text-xs font-bold hover:bg-rose-50 text-rose-600 border-t flex items-center gap-3"><Trash2 size={14} /> Excluir</button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </main>
        </div>
      </div>

      <FinancialTransactionModalV2 
        isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSuccess={fetchTransactions}
        initialType={modalType} transaction={editingTransaction}
      />
    </div>
  );
};

export default FinancialTransactionsV2;
