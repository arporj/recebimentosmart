import { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, 
  ArrowDownCircle,
  ArrowRightLeft,
  RefreshCcw,
  Plus,
  MoreVertical,
  CheckCircle2,
  Clock,
  Pencil,
  Trash2,
  CircleCheckBig,
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

// Instância virtual de recorrência para o mês
interface TransactionInstance extends FinancialTransaction {
  instanceDate: string; // Data efetiva naquele mês
  isVirtual: boolean;   // true = gerada por recorrência, false = registro real
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
  const [partialInput, setPartialInput] = useState<{ id: string; value: string } | null>(null);
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
      
      // Mapear dados da view para o formato esperado pelo componente
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

      // Carregar seleção do localStorage
      const saved = localStorage.getItem('recebimento_smart_selected_accounts');
      if (saved) {
        try {
          const ids = JSON.parse(saved);
          setSelectedAccountIds(new Set(ids));
        } catch (e) {
          console.error('Erro ao carregar contas salvas:', e);
        }
      } else if (data && data.length > 0) {
        // Se não houver nada salvo, selecionar todas por padrão
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

  // Salvar seleção no localStorage
  useEffect(() => {
    if (selectedAccountIds.size > 0 || accounts.length > 0) {
      localStorage.setItem('recebimento_smart_selected_accounts', JSON.stringify(Array.from(selectedAccountIds)));
    }
  }, [selectedAccountIds]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
        setPartialInput(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Gerar instâncias de recorrência para o mês selecionado
  const monthInstances = useMemo((): TransactionInstance[] => {
    const instances: TransactionInstance[] = [];

    for (const t of transactions) {
      const tDate = parseISO(t.date);

      if (!t.recurrence_enabled) {
        // Avulso: aparece no mês da data
        if (isSameMonth(tDate, currentMonth)) {
          instances.push({ ...t, instanceDate: t.date, isVirtual: false });
        }
        continue;
      }

      // Recorrente: calcular se alguma ocorrência cai neste mês
      const interval = t.recurrence_interval || 1;
      const period = t.recurrence_period || 'monthly';
      
      // Gerar datas de ocorrência a partir da data original
      let cursor = new Date(tDate);
      const maxDate = endOfMonth(currentMonth);
      
      // Avançar até no máximo 5 anos à frente (segurança)
      const absMax = addYears(today, 5);
      
      while (isBefore(cursor, absMax)) {
        if (isSameMonth(cursor, currentMonth)) {
          // Diferença de meses para calcular a parcela no caso de 'parcelada'
          const monthsDiff = (cursor.getFullYear() - tDate.getFullYear()) * 12 + (cursor.getMonth() - tDate.getMonth());
          const currentInst = (t.installment_current || 1) + monthsDiff;

          // Se for parcelada e já ultrapassou o total, interromper
          if (period === 'parcelada' && t.installment_total && currentInst > t.installment_total) {
            break;
          }

          instances.push({
            ...t,
            instanceDate: format(cursor, 'yyyy-MM-dd'),
            isVirtual: format(cursor, 'yyyy-MM-dd') !== t.date,
            installment_current: currentInst
          });
          break; // Apenas 1 instância por mês
        }
        
        if (isAfter(cursor, maxDate)) break;
        
        // Avançar cursor
        switch (period) {
          case 'daily': cursor = addDays(cursor, interval); break;
          case 'weekly': cursor = addWeeks(cursor, interval); break;
          case 'monthly': cursor = addMonths(cursor, interval); break;
          case 'yearly': cursor = addYears(cursor, interval); break;
          default: cursor = addMonths(cursor, interval);
        }
      }
    }

    // Ordenar por data
    instances.sort((a, b) => a.instanceDate.localeCompare(b.instanceDate));
    return instances;
  }, [transactions, currentMonth]);

  // Determinar status visual
  const getVisualStatus = (t: TransactionInstance): 'paid' | 'pending' | 'overdue' | 'partial' => {
    if (t.status === 'paid') return 'paid';
    if (t.status === 'partial') return 'partial';
    const dueDate = parseISO(t.instanceDate);
    if (isBefore(dueDate, today) && !isSameMonth(dueDate, today) || (isSameMonth(dueDate, today) && dueDate < today)) {
      return 'overdue';
    }
    return 'pending';
  };

  const getDisplayDate = (t: TransactionInstance) => {
    return format(parseISO(t.instanceDate), 'dd/MM/yy');
  };

  const handleConfirm = async (t: TransactionInstance, customAmount?: number) => {
    try {
      const paidAmount = customAmount ?? t.amount;
      const { error } = await supabase
        .from('financial_transactions')
        .update({
          status: 'paid',
          paid_amount: paidAmount,
          paid_date: format(today, 'yyyy-MM-dd')
        })
        .eq('id', t.id);
      if (error) throw error;
      toast.success('Pagamento confirmado!');
      await fetchTransactions();
    } catch {
      toast.error('Erro ao confirmar pagamento.');
    }
    setOpenDropdown(null);
  };

  const handlePartialConfirm = async (t: TransactionInstance, paidValue: number) => {
    if (paidValue <= 0 || paidValue >= t.amount) {
      toast.error('Valor parcial inválido.');
      return;
    }
    try {
      // 1. Marcar como parcial
      const { error: updateErr } = await supabase
        .from('financial_transactions')
        .update({
          status: 'partial',
          paid_amount: paidValue,
          paid_date: format(today, 'yyyy-MM-dd')
        })
        .eq('id', t.id);
      if (updateErr) throw updateErr;

      // 2. Criar lançamento pendente com o resto
      const remaining = t.amount - paidValue;
      const { error: insertErr } = await supabase
        .from('financial_transactions')
        .insert({
          user_id: user!.id,
          type: t.type,
          amount: remaining,
          date: format(today, 'yyyy-MM-dd'),
          description: `${t.description || 'Sem descrição'} (restante)`,
          status: 'pending',
          client_id: t.client_id || null,
          account_id: t.account_id || null,
          category_id: t.category_id || null,
          recurrence_enabled: false
        });
      if (insertErr) throw insertErr;

      toast.success(`Parcial confirmado: R$ ${paidValue.toFixed(2)}. Restante de R$ ${remaining.toFixed(2)} criado como pendente.`);
      await fetchTransactions();
    } catch {
      toast.error('Erro ao confirmar parcialmente.');
    }
    setOpenDropdown(null);
    setPartialInput(null);
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
      await fetchTransactions();
    } catch {
      toast.error('Erro ao clonar.');
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
      toast.error('Erro ao excluir.');
    }
    setOpenDropdown(null);
  };

  const handleEdit = (t: FinancialTransaction) => {
    setEditingTransaction(t);
    setModalType(t.type);
    setIsModalOpen(true);
    setOpenDropdown(null);
  };

  const monthLabel = format(currentMonth, "MMMM 'de' yyyy", { locale: ptBR });

  // Cálculos para a Sidebar
  const accountsData = useMemo(() => {
    return accounts.map(acc => {
      // Filtrar todas as transações desta conta (origem ou destino se for transferência)
      const accTransactions = transactions.filter(t => t.account_id === acc.id || t.destination_account_id === acc.id);
      
      // Saldo Anterior: Transações confirmadas antes do mês atual
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

      // Confirmado no Mês: Transações confirmadas no mês atual
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

      // Projetado no Mês: Todas as transações no mês atual (incluindo pendentes)
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

      return {
        ...acc,
        confirmed: previousTotal + monthConfirmed,
        projected: previousTotal + monthProjected
      };
    });
  }, [accounts, transactions, currentMonth]);

  // Totais da Sidebar (apenas selecionadas)
  const totals = useMemo(() => {
    const selected = accountsData.filter(a => selectedAccountIds.has(a.id));
    const confirmed = selected.reduce((sum, a) => sum + a.confirmed, 0);
    const projected = selected.reduce((sum, a) => sum + a.projected, 0);

    // Resumo de Entradas/Saídas (apenas transações das contas selecionadas no mês atual)
    const monthTrans = monthInstances.filter(t => 
      (t.account_id && selectedAccountIds.has(t.account_id)) || 
      (t.destination_account_id && selectedAccountIds.has(t.destination_account_id))
    );

    const income = monthTrans.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expense = monthTrans.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    
    // Transferências (ajuste para não duplicar no resultado líquido)
    const transfersIn = monthTrans.filter(t => t.type === 'transfer' && t.destination_account_id && selectedAccountIds.has(t.destination_account_id)).reduce((sum, t) => sum + t.amount, 0);
    const transfersOut = monthTrans.filter(t => t.type === 'transfer' && t.account_id && selectedAccountIds.has(t.account_id)).reduce((sum, t) => sum + t.amount, 0);

    return { 
      confirmed, 
      projected, 
      income, 
      expense, 
      transfersIn, 
      transfersOut,
      result: income - expense + (transfersIn - transfersOut)
    };
  }, [accountsData, selectedAccountIds, monthInstances]);

  // Filtrar instâncias da lista principal pela seleção de contas
  const displayInstances = useMemo(() => {
    return monthInstances.filter(t => {
      const isSelected = (t.account_id && selectedAccountIds.has(t.account_id)) || 
                         (t.destination_account_id && selectedAccountIds.has(t.destination_account_id));
      
      const matchesFilter = filter === 'all' || t.type === filter;
      const matchesSearch = searchTerm === '' || 
        (t.description?.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (t.client?.name?.toLowerCase().includes(searchTerm.toLowerCase()));
        
      return isSelected && matchesFilter && matchesSearch;
    });
  }, [monthInstances, selectedAccountIds, filter, searchTerm]);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const SidebarContent = () => (
    <div className="space-y-6">
      {/* Seletor de Mês */}
      <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between">
        <button 
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          className="p-2.5 hover:bg-slate-100 rounded-2xl transition-all active:scale-90"
        >
          <ChevronLeft size={22} className="text-slate-600" />
        </button>
        <div className="text-center">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-1">Mês de Referência</span>
          <h2 className="text-xl font-black text-slate-800 capitalize font-manrope">{monthLabel}</h2>
        </div>
        <button 
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          className="p-2.5 hover:bg-slate-100 rounded-2xl transition-all active:scale-90"
        >
          <ChevronRight size={22} className="text-slate-600" />
        </button>
      </div>

      {/* Lista de Contas */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-5 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
          <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-[0.15em]">Contas e Investimentos</h3>
          <span className="text-[10px] font-black text-slate-300 uppercase tracking-tighter">Conf. / Proj.</span>
        </div>
        <div className="divide-y divide-slate-50 max-h-[450px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200">
          {accountsData.map((acc) => (
            <div key={acc.id} className="p-4 flex items-center gap-4 hover:bg-slate-50/80 transition-colors group">
              <div className="relative flex items-center justify-center">
                <input 
                  type="checkbox"
                  checked={selectedAccountIds.has(acc.id)}
                  onChange={() => {
                    const next = new Set(selectedAccountIds);
                    if (next.has(acc.id)) next.delete(acc.id);
                    else next.add(acc.id);
                    setSelectedAccountIds(next);
                  }}
                  id={`acc-${acc.id}`}
                  className="w-5.5 h-5.5 rounded-xl border-slate-300 text-indigo-600 focus:ring-indigo-500/20 cursor-pointer transition-all border-2"
                />
              </div>
              <label htmlFor={`acc-${acc.id}`} className="flex-1 min-w-0 cursor-pointer">
                <p className="text-sm font-bold text-slate-600 group-hover:text-slate-900 transition-colors leading-tight break-words">
                  {acc.name}
                </p>
                <p className="text-[10px] font-medium text-slate-400">
                  {acc.type === 'checking' ? 'Conta Corrente' : 'Investimento'}
                </p>
              </label>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-black text-emerald-600">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(acc.confirmed)}
                </p>
                <p className="text-[10px] font-bold text-slate-400">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(acc.projected)}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="p-5 bg-slate-900 text-white flex justify-between items-center border-t border-white/5">
          <div className="flex flex-col">
            <span className="text-[10px] font-black opacity-40 uppercase tracking-[0.2em]">Saldo Selecionado</span>
            <span className="text-[9px] font-bold opacity-30 italic">{selectedAccountIds.size} contas</span>
          </div>
          <div className="text-right">
            <p className="text-xl font-black leading-tight tracking-tight">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.confirmed)}
            </p>
            <p className="text-[10px] font-bold opacity-40">
              Projetado: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.projected)}
            </p>
          </div>
        </div>
      </div>

      {/* Card de Resumo Financeiro Consolidado */}
      <div className="bg-gradient-to-br from-indigo-600 to-violet-700 p-7 rounded-[2.5rem] shadow-2xl shadow-indigo-500/20 text-white space-y-8 relative overflow-hidden group">
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-all duration-700"></div>
        
        <div className="space-y-6 relative z-10">
          <div className="flex items-center justify-between opacity-90 border-b border-white/10 pb-3">
            <span className="text-[10px] font-black uppercase tracking-[0.25em]">Resumo Mensal</span>
            <div className="p-1.5 bg-white/10 rounded-xl">
              <Filter size={16} className="text-white" />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <span className="text-[10px] uppercase font-black text-white/50 tracking-wider">Ganhos</span>
              <p className="text-lg font-black text-white">
                 {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.income)}
              </p>
              {totals.transfersIn > 0 && (
                <p className="text-[9px] text-white/40 font-bold uppercase tracking-tighter">
                  + {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.transfersIn)} transf.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <span className="text-[10px] uppercase font-black text-white/50 tracking-wider">Gastos</span>
              <p className="text-lg font-black text-white/90">
                -{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.expense)}
              </p>
              {totals.transfersOut > 0 && (
                <p className="text-[9px] text-white/40 font-bold uppercase tracking-tighter">
                  - {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.transfersOut)} transf.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-white/20 relative z-10">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/50">Fluxo de Caixa</span>
            <div className={`px-3 py-1.5 rounded-2xl text-[10px] font-black uppercase tracking-widest ${totals.result >= 0 ? 'bg-emerald-400/20 text-emerald-400 border border-emerald-400/30' : 'bg-rose-400/20 text-rose-400 border border-rose-400/30'}`}>
              {totals.result >= 0 ? '+ Lucro' : '- Déficit'}
            </div>
          </div>
          <p className={`text-4xl font-black font-manrope tracking-tighter ${totals.result >= 0 ? 'text-white' : 'text-rose-100'}`}>
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.result)}
          </p>
          <div className="mt-4 flex gap-2">
            <div className="h-1 flex-1 bg-white/10 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-1000 ${totals.result >= 0 ? 'bg-emerald-400' : 'bg-rose-400'}`}
                style={{ width: `${Math.min(100, (Math.abs(totals.result) / (totals.income || 1)) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen relative">
      <div className="max-w-[1700px] mx-auto">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* BARRA LATERAL (Desktop) */}
          <aside className="hidden lg:block w-[380px] flex-shrink-0">
            <SidebarContent />
          </aside>

          {/* Navegação Mobile (Cabeçalho de Ações) */}
          <div className="lg:hidden space-y-4 mb-4">
            <div className="flex items-center justify-between">
              {/* Gatilho 1: Menu Geral (Top) */}
              <button 
                className="p-3 bg-white text-slate-800 rounded-2xl shadow-sm border border-slate-100 active:scale-95 transition-all"
              >
                <div className="flex flex-col gap-1 w-5">
                  <div className="h-0.5 w-full bg-slate-800 rounded-full" />
                  <div className="h-0.5 w-full bg-slate-800 rounded-full" />
                  <div className="h-0.5 w-full bg-slate-800 rounded-full" />
                </div>
              </button>

              <div className="text-right">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Saldo Hoje</span>
                <p className="text-sm font-black text-slate-800 tracking-tight">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.confirmed)}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between bg-white p-3 rounded-2xl shadow-sm border border-slate-100">
               {/* Gatilho 2: Resumo (Bottom) */}
               <button 
                onClick={() => setIsSidebarOpen(true)}
                className="flex items-center gap-2 text-slate-800 font-black text-xs active:scale-95 transition-all"
              >
                <div className="flex flex-col gap-1 w-5">
                  <div className="h-0.5 w-full bg-slate-400 rounded-full" />
                  <div className="h-0.5 w-full bg-slate-400 rounded-full" />
                  <div className="h-0.5 w-full bg-slate-400 rounded-full" />
                </div>
                <span>Resumo das Contas</span>
              </button>
              
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{monthLabel}</span>
                <Clock size={14} className="text-slate-400" />
              </div>
            </div>
          </div>

          {/* Drawer Mobile */}
          {isSidebarOpen && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)} />
              <div className="absolute left-0 top-0 bottom-0 w-[320px] bg-slate-50 shadow-2xl p-6 overflow-y-auto animate-in slide-in-from-left duration-300">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-black text-slate-800">Resumo</h2>
                  <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-slate-200 rounded-xl transition-colors">
                    <ChevronLeft size={24} className="text-slate-600" />
                  </button>
                </div>
                <SidebarContent />
              </div>
            </div>
          )}

          {/* CONTEÚDO PRINCIPAL (Main Content) */}
          <main className="flex-1 space-y-6 min-w-0 pb-20">
            {/* Filtros e Busca */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">
              <div className="flex-1 relative group">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" size={22} />
                <input 
                  type="text"
                  placeholder="Pesquisar lançamentos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-14 pr-6 py-4.5 bg-white border border-slate-200 rounded-[2rem] focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/50 transition-all shadow-sm text-slate-700 font-bold placeholder:text-slate-300 placeholder:font-medium"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={fetchTransactions}
                  disabled={loading}
                  className={`p-4.5 bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 rounded-[1.8rem] transition-all shadow-sm active:scale-95 ${loading ? 'animate-spin cursor-not-allowed opacity-50' : ''}`}
                  title="Recarregar"
                >
                  <RefreshCcw size={20} />
                </button>
                <button 
                  onClick={() => { setModalType('income'); setEditingTransaction(null); setIsModalOpen(true); }}
                  className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-8 py-4.5 rounded-[1.8rem] font-black transition-all shadow-xl shadow-slate-900/20 whitespace-nowrap active:scale-95 text-sm"
                >
                  <Plus size={20} />
                  <span>Novo Lançamento</span>
                </button>
              </div>
            </div>

            {/* Listagem de Transações */}
            <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col overflow-hidden">
              <div className="px-8 py-6 border-b border-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-slate-50/30">
                <h2 className="text-xl font-black text-slate-800 flex items-center gap-4 font-manrope">
                  Transações
                  <span className="px-3 py-1 bg-white text-indigo-600 text-[10px] rounded-full font-black shadow-sm ring-1 ring-slate-100">{displayInstances.length}</span>
                </h2>
                <div className="flex items-center p-1 bg-white rounded-2xl shadow-sm ring-1 ring-slate-100 overflow-x-auto no-scrollbar">
                  {[
                    { id: 'all', label: 'Tudo' },
                    { id: 'income', label: 'Entradas' },
                    { id: 'expense', label: 'Saídas' },
                    { id: 'transfer', label: 'Transf.' }
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setFilter(f.id as any)}
                      className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap ${
                        filter === f.id 
                          ? 'bg-slate-900 text-white shadow-xl shadow-slate-900/20 scale-105 z-10' 
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="divide-y divide-slate-50 overflow-x-auto">
                {displayInstances.length === 0 ? (
                  <div className="py-20 text-center">
                    <div className="p-6 bg-slate-50 rounded-full inline-block mb-4">
                      <Search size={40} className="text-slate-300" />
                    </div>
                    <p className="text-slate-400 font-bold">Nenhum lançamento encontrado para este filtro.</p>
                  </div>
                ) : (
                  displayInstances.map((t) => {
                    const status = getVisualStatus(t);
                    const dropdownKey = `${t.id}-${t.instanceDate}`;
                    
                    return (
                      <div key={dropdownKey} className="group flex items-center gap-4 px-8 py-5 hover:bg-slate-50/50 transition-colors">
                        <div className={`p-3 rounded-2xl shadow-sm shrink-0 ${
                          t.type === 'income' ? 'bg-emerald-50 text-emerald-600' : 
                          t.type === 'expense' ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600'
                        }`}>
                          {t.type === 'income' ? <Plus size={20} /> : t.type === 'expense' ? <ArrowDownCircle size={20} /> : <ArrowRightLeft size={20} />}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-black text-slate-800 truncate">{t.description || 'S/ Descrição'}</h4>
                            {t.installment_total && t.installment_total > 1 && (
                              <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100">
                                Parc. {t.installment_current}/{t.installment_total}
                              </span>
                            )}
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ring-1 ${
                              status === 'paid' ? 'bg-emerald-50 text-emerald-600 ring-emerald-200' :
                              status === 'overdue' ? 'bg-rose-50 text-rose-600 ring-rose-200' :
                              status === 'partial' ? 'bg-orange-50 text-orange-600 ring-orange-200' :
                              'bg-amber-50 text-amber-600 ring-amber-200'
                            }`}>
                              {status === 'paid' ? 'Efetivado' : status === 'overdue' ? 'Atrasado' : status === 'partial' ? 'Parcial' : 'Pendente'}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-400 font-bold">
                            <span className="flex items-center gap-1.5"><Clock size={12} /> {getDisplayDate(t)}</span>
                            {t.account && (
                              <span className="flex items-center gap-1.5 break-words" title={t.account.name}>
                                / {t.account.name}
                              </span>
                            )}
                            {t.type === 'transfer' && t.destination_account && (
                              <span className="flex items-center gap-1.5 text-indigo-400 break-words" title={t.destination_account.name}>
                                → {t.destination_account.name}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right flex-shrink-0">
                            <p className="font-black text-slate-800 text-lg">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.amount)}
                            </p>
                            {status === 'partial' && t.paid_amount && (
                              <p className="text-[10px] font-bold text-emerald-600">
                                Pago: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.paid_amount)}
                              </p>
                            )}
                          </div>

                          <div className="relative" ref={openDropdown === dropdownKey ? dropdownRef : null}>
                            <button 
                              onClick={() => setOpenDropdown(openDropdown === dropdownKey ? null : dropdownKey)}
                              className="p-2.5 hover:bg-slate-100 rounded-xl transition-all text-slate-400 hover:text-indigo-600 active:scale-90"
                            >
                              <MoreVertical size={20} />
                            </button>

                            {openDropdown === dropdownKey && (
                              <div className={`absolute right-0 w-56 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-[150] animate-in fade-in zoom-in duration-200 origin-top-right overflow-visible
                                ${displayInstances.indexOf(t) >= Math.max(0, displayInstances.length - 3) ? 'bottom-full mb-2' : 'top-full mt-2'}`}>
                                {status !== 'paid' && status !== 'partial' && (
                                  <button
                                    onClick={() => handleConfirm(t)}
                                    className="flex items-center gap-2 w-full px-4 py-2.5 text-sm font-bold text-emerald-600 hover:bg-emerald-50 transition-colors"
                                  >
                                    <CheckCircle2 size={15} /> Confirmar Total
                                  </button>
                                )}
                                
                                {status !== 'paid' && (
                                  <button
                                    onClick={() => setPartialInput({ id: t.id, value: '' })}
                                    className="flex items-center gap-2 w-full px-4 py-2.5 text-sm font-bold text-amber-600 hover:bg-amber-50 transition-colors"
                                  >
                                    <CircleCheckBig size={15} /> Confirmar Parcial
                                  </button>
                                )}

                                <div className="border-t border-slate-50 my-1" />
                                
                                <button
                                  onClick={() => handleEdit(t)}
                                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                                >
                                  <Pencil size={15} /> Editar
                                </button>

                                <button
                                  onClick={() => handleClone(t)}
                                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                                >
                                  <Copy size={15} /> Duplicar
                                </button>

                                <div className="border-t border-slate-50 my-1" />

                                <button
                                  onClick={() => handleDelete(t.id)}
                                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm font-bold text-rose-600 hover:bg-rose-50 transition-colors"
                                >
                                  <Trash2 size={15} /> Excluir
                                </button>
                              </div>
                            )}
                          </div>
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

      {/* Input de Valor Parcial */}
      {partialInput && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] p-8 w-full max-w-md shadow-2xl animate-in zoom-in duration-300">
            <h3 className="text-xl font-black text-slate-800 mb-2 font-manrope">Pagamento Parcial</h3>
            <p className="text-slate-500 text-sm mb-6 font-bold">Informe o valor pago. O restante será gerado como um novo lançamento pendente.</p>
            <div className="space-y-4">
              <div className="relative">
                <span className="absolute left-5 top-1/2 -translate-y-1/2 font-black text-slate-400">R$</span>
                <input 
                  autoFocus
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  value={partialInput.value}
                  onChange={(e) => setPartialInput({ ...partialInput, value: e.target.value })}
                  className="w-full pl-12 pr-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:outline-none focus:border-indigo-500 transition-all font-black text-lg"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setPartialInput(null)}
                  className="flex-1 px-6 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => {
                    const trans = transactions.find(t => t.id === partialInput.id);
                    if (trans) handlePartialConfirm(trans as any, parseFloat(partialInput.value));
                  }}
                  className="flex-1 px-6 py-4 bg-indigo-600 text-white rounded-2xl font-black hover:bg-indigo-700 shadow-xl shadow-indigo-600/20 transition-all"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Transação */}
      <FinancialTransactionModalV2 
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingTransaction(null);
        }}
        onSuccess={fetchTransactions}
        initialType={modalType}
        transaction={editingTransaction}
      />
    </div>
  );
};

export default FinancialTransactionsV2;
