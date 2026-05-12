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
  Filter,
  CheckCircle2,
  Repeat,
  Zap,
  ArrowRight,
  CreditCard
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { format, startOfMonth, endOfMonth, addMonths, subMonths, isAfter, isBefore, isSameMonth, parseISO, addDays, addWeeks, addYears, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'react-hot-toast';
import FinancialTransactionModalV2 from '../../components/v2/FinancialTransactionModalV2';
import { ModalOpcaoRecorrente } from '../../components/financeiro/ModalOpcaoRecorrente';
import { deletarTransacao } from '../../lib/financeiro/deletarTransacao';

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
  parent_id?: string | null;
  modalidade?: 'unica' | 'parcelada' | 'recorrente';
  installment_total?: number;
  installment_current?: number;
  auto_confirm?: boolean;
  tags?: { tag: { id: string; name: string; color: string } }[];
  invoice_month?: string | null;
  account_type?: string;
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
  const [creditCardAccounts, setCreditCardAccounts] = useState<any[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'income' | 'expense' | 'transfer'>('income');
  const [editingTransaction, setEditingTransaction] = useState<FinancialTransaction | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Estados para exclusão em cadeia
  const [isDeleteScopeModalOpen, setIsDeleteScopeModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<FinancialTransaction | null>(null);

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
        account_type: t.account_type || null,
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

  const fetchCreditCardAccounts = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('financial_accounts')
        .select('id, name, type, due_day')
        .eq('type', 'credit_card')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      setCreditCardAccounts(data || []);
    } catch (err) {
      console.error('Erro ao buscar cartões:', err);
    }
  };

  useEffect(() => {
    fetchTransactions();
    fetchAccounts();
    fetchCreditCardAccounts();
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

    // 1. Identificar registros físicos daquela cadeia para evitar sobreposição
    const physicalDatesByParent = new Map<string, Set<string>>();
    for (const t of transactions) {
      const parentId = t.parent_id || t.id;
      if (!physicalDatesByParent.has(parentId)) {
        physicalDatesByParent.set(parentId, new Set());
      }
      physicalDatesByParent.get(parentId)!.add(t.date);
    }

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
      const parentId = t.id; // Se tem recurrence_enabled é o pai
      
      while (isBefore(cursor, absMax)) {
        const dateStr = format(cursor, 'yyyy-MM-dd');
        // Só gera virtual se não houver registro físico correspondente
        const alreadyHasPhysical = physicalDatesByParent.get(parentId)?.has(dateStr);

        if (isSameMonth(cursor, currentMonth)) {
          // Se for a data original do pai ou uma virtual que não existe fisicamente
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
              installment_current: currentInst
            });
          }
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
    
    // Apenas atrasado se for antes de hoje (hoje é amarelo/pendente)
    if (isBefore(dueDate, startOfMonth(today)) || (isBefore(dueDate, today) && !isSameDay(dueDate, today))) {
      return 'overdue';
    }
    return 'pending';
  };

  const handleEdit = (t: FinancialTransaction) => {
    setEditingTransaction(t);
    setModalType(t.type);
    setIsConfirming(false);
    setIsModalOpen(true);
    setOpenDropdown(null);
  };

  const handleConfirmAction = (t: FinancialTransaction) => {
    setEditingTransaction(t);
    setModalType(t.type);
    setIsConfirming(true);
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

  const handleDelete = async (t: FinancialTransaction, scope: 'this' | 'following' | 'all' = 'this') => {
    const isRecurring = t.modalidade === 'recorrente' || t.modalidade === 'parcelada' || !!t.parent_id || t.recurrence_enabled;
    
    if (isRecurring && !isDeleteScopeModalOpen && scope === 'this') {
      setItemToDelete(t);
      setIsDeleteScopeModalOpen(true);
      setOpenDropdown(null);
      return;
    }

    try {
      const { error } = await deletarTransacao(t.id, scope);
      if (error) throw error;
      toast.success('Excluído!');
      fetchTransactions();
    } catch {
      toast.error('Erro ao excluir.');
    } finally {
      setIsDeleteScopeModalOpen(false);
      setItemToDelete(null);
      setOpenDropdown(null);
    }
  };

  const accountsData = useMemo(() => {
    return accounts.map(acc => {
      const accTransactions = transactions.filter(t => t.account_id === acc.id || t.destination_account_id === acc.id);
      const monthStart = startOfMonth(currentMonth);
      
      const previousTotal = accTransactions
        .filter(t => isBefore(parseISO(t.date), monthStart) && t.status === 'paid')
        .reduce((sum, t) => {
          const valValue = Number(t.amount) || 0;
          if (t.type === 'income') return sum + valValue;
          if (t.type === 'expense') return sum - valValue;
          if (t.type === 'transfer') {
             if (t.destination_account_id === acc.id) return sum + valValue;
             if (t.account_id === acc.id) return sum - valValue;
          }
          return sum;
        }, Number(acc.initial_balance) || 0);

      const monthConfirmed = accTransactions
        .filter(t => isSameMonth(parseISO(t.date), currentMonth) && t.status === 'paid')
        .reduce((sum, t) => {
          const valValue = Number(t.amount) || 0;
          if (t.type === 'income') return sum + valValue;
          if (t.type === 'expense') return sum - valValue;
          if (t.type === 'transfer') {
             if (t.destination_account_id === acc.id) return sum + valValue;
             if (t.account_id === acc.id) return sum - valValue;
          }
          return sum;
        }, 0);

      const monthProjected = accTransactions
        .filter(t => isSameMonth(parseISO(t.date), currentMonth))
        .reduce((sum, t) => {
          const valValue = Number(t.amount) || 0;
          if (t.type === 'income') return sum + valValue;
          if (t.type === 'expense') return sum - valValue;
          if (t.type === 'transfer') {
             if (t.destination_account_id === acc.id) return sum + valValue;
             if (t.account_id === acc.id) return sum - valValue;
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
    const filtered = monthInstances.filter(t => {
      const isSelected = (t.account_id && selectedAccountIds.has(t.account_id)) || (t.destination_account_id && selectedAccountIds.has(t.destination_account_id));
      const matchesFilter = filter === 'all' || t.type === filter;
      const matchesSearch = searchTerm === '' || t.description?.toLowerCase().includes(searchTerm.toLowerCase());
      return isSelected && matchesFilter && matchesSearch;
    });

    // Início do saldo acumulado para as contas selecionadas no início do mês
    let runningBalance = totals.confirmed - monthInstances
      .filter(t => isSameMonth(parseISO(t.instanceDate), currentMonth) && t.status === 'paid' && ((t.account_id && selectedAccountIds.has(t.account_id)) || (t.destination_account_id && selectedAccountIds.has(t.destination_account_id))))
      .reduce((sum, t) => {
        if (t.type === 'income') return sum + t.amount;
        if (t.type === 'expense') return sum - t.amount;
        if (t.type === 'transfer') {
          if (t.destination_account_id && selectedAccountIds.has(t.destination_account_id)) sum += t.amount;
          if (t.account_id && selectedAccountIds.has(t.account_id)) sum -= t.amount;
        }
        return sum;
      }, 0);

    return filtered.map(t => {
      if (t.type === 'income') runningBalance += t.amount;
      else if (t.type === 'expense') runningBalance -= t.amount;
      else if (t.type === 'transfer') {
        const isOut = t.account_id && selectedAccountIds.has(t.account_id);
        const isIn = t.destination_account_id && selectedAccountIds.has(t.destination_account_id);
        if (isIn && !isOut) runningBalance += t.amount;
        else if (isOut && !isIn) runningBalance -= t.amount;
      }
      return { ...t, runningBalance };
    });
  }, [monthInstances, selectedAccountIds, filter, searchTerm, totals.confirmed, currentMonth]);

  // Generate credit card invoice summary lines for the current month
  const invoiceSummaries = useMemo(() => {
    const currentMonthStr = format(currentMonth, 'yyyy-MM');
    
    // Group all transactions with invoice_month matching current month by account_id
    const invoiceMap = new Map<string, { accountName: string; total: number; dueDay: number | null }>();
    
    for (const t of transactions) {
      if (t.account_type !== 'credit_card' || t.invoice_month !== currentMonthStr) continue;
      
      const existing = invoiceMap.get(t.account_id!);
      const amount = Number(t.amount) || 0;
      
      if (existing) {
        existing.total += amount;
      } else {
        const card = creditCardAccounts.find(c => c.id === t.account_id);
        invoiceMap.set(t.account_id!, {
          accountName: card?.name || t.account?.name || 'Cartão',
          total: amount,
          dueDay: card?.due_day || null,
        });
      }
    }

    return Array.from(invoiceMap.entries()).map(([accountId, data]) => ({
      id: `invoice-${accountId}-${currentMonthStr}`,
      accountId,
      accountName: data.accountName,
      total: data.total,
      dueDay: data.dueDay,
      invoiceMonth: currentMonthStr,
    }));
  }, [transactions, creditCardAccounts, currentMonth]);

  const monthLabel = format(currentMonth, "MMMM 'de' yyyy", { locale: ptBR });

  const SidebarContent = () => (
    <div className="space-y-4 h-full pb-6">
      <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between">
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
        <div className="p-4 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center text-xs font-extrabold uppercase tracking-widest text-slate-400">
          <span>Contas</span>
          <span>Saldo</span>
        </div>
        <div className="divide-y divide-slate-50 max-h-[300px] overflow-y-auto">
          {accountsData.map((acc) => (
            <div key={acc.id} className="p-3 flex items-center gap-4 hover:bg-slate-50 transition-colors">
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
        <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
          <div className="flex flex-col"><span className="text-[10px] font-black opacity-40 uppercase">Total</span></div>
          <div className="text-right">
            <p className="text-lg font-black">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.confirmed)}</p>
            <p className="text-[10px] font-bold opacity-40">Proj: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.projected)}</p>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-indigo-600 to-violet-700 p-5 rounded-[2.5rem] text-white space-y-6 relative overflow-hidden group">
        <div className="space-y-4 relative z-10">
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
    <div className="bg-slate-50 h-screen overflow-hidden flex flex-col">
      {/* ===== MOBILE LAYOUT ===== */}
      <div className="lg:hidden flex flex-col h-full overflow-hidden">
        {/* Mobile Header: Resumo + Busca + Criar */}
        <div className="shrink-0 bg-white border-b border-slate-100 px-3 pt-3 pb-2 space-y-2">
          {/* Linha 1: Hamburger Resumo + Saldo + Botão Criar */}
          <div className="flex items-center justify-between">
            <button onClick={() => setIsSidebarOpen(true)} className="flex items-center gap-2">
              <div className="flex flex-col gap-[3px] w-4"><div className="h-[2px] w-full bg-slate-600" /><div className="h-[2px] w-full bg-slate-600" /><div className="h-[2px] w-full bg-slate-600" /></div>
              <span className="text-xs font-black text-slate-800">Resumo</span>
            </button>
            <span className="text-sm font-black text-slate-800">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.confirmed)}</span>
            <button
              onClick={() => { setModalType('income'); setEditingTransaction(null); setIsModalOpen(true); }}
              className="flex items-center gap-1.5 bg-[#0d9488] text-white px-3 py-1.5 rounded-xl text-[9px] font-black shadow-md hover:bg-[#0f766e] transition-all uppercase tracking-wider"
            >
              <Plus size={12} /> Criar
            </button>
          </div>
          {/* Linha 2: Navegação de Mês */}
          <div className="flex items-center justify-between bg-slate-50 rounded-xl px-1 py-1">
            <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1.5 hover:bg-white rounded-lg transition-all active:scale-90">
              <ChevronLeft size={18} className="text-slate-600" />
            </button>
            <span className="text-xs font-black text-slate-700 capitalize">{monthLabel}</span>
            <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1.5 hover:bg-white rounded-lg transition-all active:scale-90">
              <ChevronRight size={18} className="text-slate-600" />
            </button>
          </div>
          {/* Linha 2: Busca + Refresh */}
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text" placeholder="Filtrar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
              />
            </div>
            <button onClick={fetchTransactions} disabled={loading} className={`p-2 bg-slate-50 border border-slate-200 rounded-xl ${loading ? 'animate-spin' : ''}`}><RefreshCcw size={16} /></button>
          </div>
          {/* Linha 3: Filtros */}
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {['all', 'income', 'expense', 'transfer'].map(f => (
              <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 rounded-lg text-[9px] font-black transition-all shrink-0 ${filter === f ? 'bg-slate-900 text-white shadow' : 'text-slate-400 bg-slate-50'}`}>
                {f === 'all' ? 'TUDO' : f === 'income' ? 'ENTRADAS' : f === 'expense' ? 'SAÍDAS' : 'TRANSF.'}
              </button>
            ))}
          </div>
        </div>

        {/* Mobile Transaction List - Layout tabular compacto */}
        <div className="flex-1 overflow-y-auto bg-white">
          {displayInstances.length === 0 && invoiceSummaries.length === 0 ? (
            <div className="py-20 text-center"><p className="text-slate-400 font-bold">Nenhum lançamento.</p></div>
          ) : (
            <>
            {invoiceSummaries.map((inv) => (
              <div key={inv.id} className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100 bg-gradient-to-r from-amber-50/60 to-orange-50/40">
                <div className="w-2 h-2 rounded-full shrink-0 bg-amber-500" />
                <span className="text-[10px] font-bold text-slate-400 shrink-0 w-[52px]">{inv.dueDay ? `Dia ${String(inv.dueDay).padStart(2, '0')}` : '—'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <CreditCard size={12} className="text-amber-600 shrink-0" />
                    <span className="font-black text-xs text-slate-800 truncate">Fatura {inv.accountName}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-black text-xs text-amber-700">
                    -{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(inv.total)}
                  </p>
                </div>
              </div>
            ))}
            {displayInstances.map((t, index) => {
              const status = getVisualStatus(t);
              const dropdownKey = `${t.id}-${t.instanceDate}`;
              const isEven = index % 2 === 0;

              return (
                <div key={dropdownKey} className={`flex items-center gap-2 px-3 py-2 border-b border-slate-50 ${isEven ? 'bg-white' : 'bg-slate-50/30'}`}>
                  {/* Status dot */}
                  <div className={`w-2 h-2 rounded-full shrink-0 ${status === 'paid' ? 'bg-emerald-500' : status === 'overdue' ? 'bg-rose-500' : 'bg-amber-400'}`} />
                  {/* Data */}
                  <span className="text-[10px] font-bold text-slate-400 shrink-0 w-[52px]">{format(parseISO(t.instanceDate), 'dd/MM/yy')}</span>
                  {/* Descrição + badges */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-xs text-slate-800 truncate">{t.description || 'S/ Descrição'}</span>
                      {(t.recurrence_enabled || !!t.parent_id) && t.modalidade !== 'parcelada' && <Repeat size={10} className="text-slate-400/60 shrink-0" />}
                      {t.installment_total && t.installment_total > 1 && (
                        <span className="text-[8px] font-black text-indigo-600 shrink-0">{t.installment_current}/{t.installment_total}</span>
                      )}
                    </div>
                    {(t.account || t.category) && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {t.account && <span className="text-[8px] font-black text-slate-400 uppercase">{t.account.name}</span>}
                        {t.category && <span className="text-[8px] font-medium text-slate-300">· {t.category.name}</span>}
                      </div>
                    )}
                  </div>
                  {/* Valor + Saldo */}
                  <div className="text-right shrink-0">
                    <p className={`font-black text-xs ${t.type === 'expense' ? 'text-slate-800' : t.type === 'income' ? 'text-emerald-600' : 'text-indigo-600'}`}>
                      {t.type === 'expense' ? '-' : ''}{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.amount)}
                    </p>
                    {(t as any).runningBalance && !isNaN((t as any).runningBalance) && (
                      <p className="text-[9px] font-bold text-slate-300">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((t as any).runningBalance)}
                      </p>
                    )}
                  </div>
                  {/* Menu */}
                  <div className="relative shrink-0" ref={openDropdown === dropdownKey ? dropdownRef : null}>
                    <button onClick={() => setOpenDropdown(openDropdown === dropdownKey ? null : dropdownKey)} className="p-1 text-slate-300"><MoreVertical size={16} /></button>
                    {openDropdown === dropdownKey && (
                      <div className={`absolute right-0 w-44 bg-white rounded-xl shadow-2xl border border-slate-100 py-1.5 z-[300] ${index >= displayInstances.length - 3 ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                        {t.status !== 'paid' && (
                          <button onClick={() => handleConfirmAction(t)} className="w-full px-3 py-1.5 text-left text-[11px] font-black text-blue-600 hover:bg-blue-50 flex items-center gap-2"><CheckCircle2 size={12} /> Confirmar</button>
                        )}
                        <button onClick={() => handleEdit(t)} className="w-full px-3 py-1.5 text-left text-[11px] font-bold hover:bg-slate-50 flex items-center gap-2"><Pencil size={12} /> Editar</button>
                        <button onClick={() => handleClone(t)} className="w-full px-3 py-1.5 text-left text-[11px] font-bold hover:bg-slate-50 flex items-center gap-2"><Copy size={12} /> Clonar</button>
                        <button onClick={() => handleDelete(t)} className="w-full px-3 py-1.5 text-left text-[11px] font-bold hover:bg-rose-50 text-rose-600 border-t mt-0.5 pt-1.5 flex items-center gap-2"><Trash2 size={12} /> Excluir</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
            </>
          )}
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
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

      {/* ===== DESKTOP LAYOUT ===== */}
      <div className="hidden lg:flex flex-1 max-w-[1700px] mx-auto w-full p-6 overflow-hidden gap-6">
        {/* Sidebar - Fixa */}
        <aside className="w-[360px] flex-shrink-0 h-full">
          <SidebarContent />
        </aside>

        {/* Main Content */}
        <main className="flex-1 h-full flex flex-col space-y-6 min-w-0 overflow-hidden">
          {/* Header da Lista (Fixo) */}
          <div className="flex flex-col xl:flex-row gap-4 justify-between shrink-0">
            <div className="flex-1 relative group">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input
                type="text" placeholder="Filtrar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-14 pr-6 py-4 bg-white border border-slate-200 rounded-3xl font-bold shadow-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <button onClick={fetchTransactions} disabled={loading} className={`p-4 bg-white border border-slate-200 rounded-3xl shadow-sm ${loading ? 'animate-spin' : ''}`}><RefreshCcw size={20} /></button>
            </div>
          </div>

          {/* Listagem (Rolável) */}
          <div className="flex-1 bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden flex flex-col">
            <div className="px-8 py-5 border-b border-slate-50 bg-slate-50/20 flex flex-row items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-black">Transações</h2>
                <button
                  onClick={() => { setModalType('income'); setEditingTransaction(null); setIsModalOpen(true); }}
                  className="flex items-center gap-2 bg-[#0d9488] text-white px-5 py-2.5 rounded-2xl text-[10px] font-black shadow-lg hover:bg-[#0f766e] hover:scale-105 transition-all uppercase tracking-wider"
                >
                  <Plus size={14} />
                  <span>Criar Lançamento</span>
                  <ArrowRight size={14} className="ml-1 opacity-70" />
                </button>
              </div>
              <div className="flex gap-1 bg-white p-1 rounded-2xl shadow-sm border border-slate-100">
                {['all', 'income', 'expense', 'transfer'].map(f => (
                  <button key={f} onClick={() => setFilter(f)} className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${filter === f ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400'}`}>
                    {f === 'all' ? 'TUDO' : f === 'income' ? 'ENTRADAS' : f === 'expense' ? 'SAÍDAS' : 'TRANSF.'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {displayInstances.length === 0 && invoiceSummaries.length === 0 ? (
                <div className="py-20 text-center"><p className="text-slate-400 font-bold">Nenhum lançamento.</p></div>
              ) : (
                <>
                {invoiceSummaries.map((inv) => (
                  <div key={inv.id} className="group flex items-center gap-4 px-8 py-4 bg-gradient-to-r from-amber-50/80 to-orange-50/50 border-b border-amber-100/50">
                    <div className="p-3 rounded-2xl shrink-0 bg-amber-100 text-amber-600">
                      <CreditCard size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full shrink-0 bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]" />
                        <h4 className="font-black text-slate-800 text-sm">Fatura {inv.accountName}</h4>
                      </div>
                      <div className="flex items-center gap-x-3 mt-1">
                        <p className="text-[10px] font-bold text-slate-400">{inv.dueDay ? `Vencimento dia ${String(inv.dueDay).padStart(2, '0')}` : '—'}</p>
                        <div className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-100/60 rounded-md">
                          <span className="text-[9px] font-black text-amber-700 uppercase">{inv.accountName}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-black text-base text-amber-700">
                        -{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(inv.total)}
                      </p>
                      <p className="text-[10px] font-bold text-amber-500/70">Fatura consolidada</p>
                    </div>
                  </div>
                ))}
                {displayInstances.map((t, index) => {
                  const status = getVisualStatus(t);
                  const dropdownKey = `${t.id}-${t.instanceDate}`;
                  const isEven = index % 2 === 0;

                  return (
                    <div key={dropdownKey} className={`group flex items-center gap-4 px-8 py-4 transition-colors ${isEven ? 'bg-white' : 'bg-slate-50/40'} hover:bg-slate-100/50`}>
                      <div className={`p-3 rounded-2xl shrink-0 ${t.type === 'income' ? 'bg-emerald-50 text-emerald-600' : t.type === 'expense' ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600'}`}>
                        {t.type === 'income' ? <Plus size={20} /> : t.type === 'expense' ? <ArrowDownCircle size={20} /> : <ArrowRightLeft size={20} />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${status === 'paid' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : status === 'overdue' ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]' : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]'}`} />
                          <h4 className="font-extrabold text-slate-800 truncate text-sm">{t.description || 'S/ Descrição'}</h4>

                          <div className="flex items-center gap-1.5 px-2">
                            {t.status === 'paid' && <CheckCircle2 size={12} className="text-emerald-500/60" />}
                            {(t.recurrence_enabled || !!t.parent_id) && t.modalidade !== 'parcelada' && <Repeat size={12} className="text-slate-400/60" />}
                            {t.auto_confirm && <Zap size={12} className="text-amber-500/60" />}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                          <p className="text-[10px] font-bold text-slate-400">{format(parseISO(t.instanceDate), 'dd/MM/yy')}</p>

                          {t.account && (
                            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 rounded-md">
                              <span className="text-[9px] font-black text-slate-500 uppercase">{t.account.name}</span>
                            </div>
                          )}

                          {t.type === 'transfer' && t.destination_account && (
                            <>
                              <ArrowRight size={10} className="text-slate-300" />
                              <div className="flex items-center gap-1 px-1.5 py-0.5 bg-indigo-50 rounded-md">
                                <span className="text-[9px] font-black text-indigo-500 uppercase">{t.destination_account.name}</span>
                              </div>
                            </>
                          )}

                          {t.category && (
                            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-50 border border-slate-100 rounded-md">
                              <span className="text-[9px] font-bold text-slate-400">{t.category.name}</span>
                            </div>
                          )}

                          {t.installment_total && t.installment_total > 1 && (
                            <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-md">
                              {t.installment_current}/{t.installment_total}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <p className={`font-black text-base ${t.type === 'expense' ? 'text-slate-800' : t.type === 'income' ? 'text-emerald-600' : 'text-indigo-600'}`}>
                          {t.type === 'expense' ? '-' : ''}{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.amount)}
                        </p>
                        <p className="text-[10px] font-bold text-slate-300">
                           {(t as any).runningBalance && !isNaN((t as any).runningBalance) ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((t as any).runningBalance) : ''}
                        </p>
                      </div>

                      <div className="relative" ref={openDropdown === dropdownKey ? dropdownRef : null}>
                        <button onClick={() => setOpenDropdown(openDropdown === dropdownKey ? null : dropdownKey)} className="p-2 text-slate-300 hover:text-slate-600 transition-colors"><MoreVertical size={20} /></button>
                        {openDropdown === dropdownKey && (
                          <div className={`absolute right-0 w-48 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-[300] ${displayInstances.indexOf(t) >= displayInstances.length - 3 ? 'bottom-full mb-2' : 'top-full mt-2'}`}>
                            {t.status !== 'paid' && (
                              <button onClick={() => handleConfirmAction(t)} className="w-full px-4 py-2 text-left text-xs font-black text-blue-600 hover:bg-blue-50 flex items-center gap-3"><CheckCircle2 size={14} /> Confirmar</button>
                            )}
                            <button onClick={() => handleEdit(t)} className="w-full px-4 py-2 text-left text-xs font-bold hover:bg-slate-50 flex items-center gap-3"><Pencil size={14} /> Editar</button>
                            <button onClick={() => handleClone(t)} className="w-full px-4 py-2 text-left text-xs font-bold hover:bg-slate-50 flex items-center gap-3"><Copy size={14} /> Clonar</button>
                            <button onClick={() => handleDelete(t)} className="w-full px-4 py-2 text-left text-xs font-bold hover:bg-rose-50 text-rose-600 border-t mt-1 pt-2 flex items-center gap-3"><Trash2 size={14} /> Excluir</button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
                </>
              )}
            </div>
          </div>
        </main>
      </div>

      <FinancialTransactionModalV2 
        isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSuccess={fetchTransactions}
        initialType={modalType} transaction={editingTransaction} isConfirming={isConfirming}
      />

      {itemToDelete && (
        <ModalOpcaoRecorrente
          isOpen={isDeleteScopeModalOpen}
          onClose={() => setIsDeleteScopeModalOpen(false)}
          onSelect={(scope) => handleDelete(itemToDelete, scope as any)}
          type="delete"
          modalidade={(itemToDelete as any).modalidade === 'parcelada' ? 'parcelada' : 'recorrente'}
        />
      )}
    </div>
  );
};

export default FinancialTransactionsV2;
