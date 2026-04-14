import { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, 
  Plus, 
  MoreVertical,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Pencil,
  Trash2,
  CircleCheckBig,
  CircleDashed,
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
  type: 'income' | 'expense';
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
  category_id?: string;
  client?: { name: string };
  account?: { name: string; type: string };
  category?: { name: string; icon: string | null; parent_id: string | null };
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
  const [searchTerm, setSearchTerm] = useState('');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'income' | 'expense'>('income');
  const [editingTransaction, setEditingTransaction] = useState<FinancialTransaction | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [partialInput, setPartialInput] = useState<{ id: string; value: string } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const today = new Date();
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const fetchTransactions = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('financial_transactions')
        .select(`
          *,
          client:clients(name),
          account:financial_accounts(name, type),
          category:financial_categories(name, icon, parent_id),
          tags:transaction_tags(
            tag:financial_tags(id, name, color)
          )
        `)
        .eq('user_id', user.id)
        .order('date', { ascending: true });

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
          instances.push({
            ...t,
            instanceDate: format(cursor, 'yyyy-MM-dd'),
            isVirtual: format(cursor, 'yyyy-MM-dd') !== t.date
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

  const getStatusDot = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-500';
      case 'pending': return 'bg-amber-400';
      case 'overdue': return 'bg-rose-500';
      case 'partial': return 'bg-orange-400';
      default: return 'bg-slate-300';
    }
  };

  const getDisplayDate = (t: TransactionInstance) => {
    const status = getVisualStatus(t);
    if (status === 'overdue') return 'hoje';
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

  const filteredInstances = monthInstances.filter(t => {
    const matchesFilter = filter === 'all' || t.type === filter;
    const matchesSearch = searchTerm === '' || 
      (t.description?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (t.client?.name?.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  const monthLabel = format(currentMonth, "MMMM 'de' yyyy", { locale: ptBR });

  // Totais do mês
  const totalIncome = filteredInstances.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = filteredInstances.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-manrope">Fluxo Financeiro</h1>
          <p className="text-slate-500 text-sm">Gerencie suas receitas e despesas em um só lugar.</p>
        </div>
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

      {/* Navegador de Mês */}
      <div className="flex items-center justify-between bg-white rounded-2xl shadow-sm border border-slate-100 px-6 py-4">
        <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
          <ChevronLeft size={20} className="text-slate-600" />
        </button>
        <h2 className="text-lg font-bold text-slate-900 capitalize font-manrope">{monthLabel}</h2>
        <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
          <ChevronRight size={20} className="text-slate-600" />
        </button>
      </div>

      {/* Resumo do Mês */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Receitas</p>
          <p className="text-xl font-extrabold text-teal-600">
            + {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalIncome)}
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Despesas</p>
          <p className="text-xl font-extrabold text-rose-600">
            - {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalExpense)}
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Saldo</p>
          <p className={`text-xl font-extrabold ${totalIncome - totalExpense >= 0 ? 'text-teal-600' : 'text-rose-600'}`}>
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalIncome - totalExpense)}
          </p>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {/* Filtros */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row justify-between gap-4">
          <div className="flex bg-white p-1 rounded-xl border border-slate-200 w-fit">
            <button onClick={() => setFilter('all')} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${filter === 'all' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}>Todos</button>
            <button onClick={() => setFilter('income')} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${filter === 'income' ? 'bg-teal-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}>Receitas</button>
            <button onClick={() => setFilter('expense')} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${filter === 'expense' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}>Despesas</button>
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

        {/* Lista */}
        <div className="divide-y divide-slate-100">
          {loading ? (
            <div className="px-6 py-12 text-center text-slate-400 italic">Carregando...</div>
          ) : filteredInstances.length === 0 ? (
            <div className="px-6 py-12 text-center text-slate-400 italic">Nenhum lançamento neste mês.</div>
          ) : (
            filteredInstances.map((t, idx) => {
              const visualStatus = getVisualStatus(t);
              const dropdownKey = `${t.id}-${idx}`;
              return (
                <div key={dropdownKey} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/50 transition-colors group">
                  {/* Status Dot */}
                  <div className={`w-3 h-3 rounded-full shrink-0 ${getStatusDot(visualStatus)}`} />

                  {/* Date */}
                  <div className="w-20 shrink-0">
                    <span className={`text-sm font-medium ${visualStatus === 'overdue' ? 'text-rose-600 font-bold' : 'text-slate-500'}`}>
                      {getDisplayDate(t)}
                    </span>
                  </div>

                  {/* Description + Badges */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{t.description || 'Sem descrição'}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {/* Account badge */}
                      {t.account && (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-medium">
                          {t.account.name}
                        </span>
                      )}
                      {/* Category badge */}
                      {t.category && (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-medium">
                          {t.category.icon || ''} {t.category.name}
                        </span>
                      )}
                      {/* Tags */}
                      {t.tags?.map((tag: any, i: number) => (
                        <span 
                          key={i}
                          className="text-[10px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 font-medium"
                          style={{ borderLeft: `2px solid ${tag.tag.color}` }}
                        >
                          {tag.tag.name}
                        </span>
                      ))}
                      {/* Client badge */}
                      {t.client?.name && (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 font-bold border border-teal-200">
                          {t.client.name}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status icons */}
                  <div className="flex items-center gap-2 shrink-0">
                    {t.status === 'paid' && <CheckCircle2 size={16} className="text-green-500" />}
                    {t.status === 'partial' && <CircleDashed size={16} className="text-orange-500" />}
                  </div>

                  {/* Amount */}
                  <div className="w-32 text-right shrink-0">
                    <span className={`text-sm font-bold ${t.type === 'income' ? 'text-teal-600' : 'text-rose-600'}`}>
                      {t.type === 'expense' ? '-' : ''}{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.amount)}
                    </span>
                    {t.paid_amount && t.paid_amount !== t.amount && (
                      <p className="text-[10px] text-slate-400">Pago: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.paid_amount)}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="relative shrink-0" ref={openDropdown === dropdownKey ? dropdownRef : undefined}>
                    <button
                      onClick={() => setOpenDropdown(openDropdown === dropdownKey ? null : dropdownKey)}
                      className="text-slate-400 hover:text-slate-900 transition-colors p-1.5 rounded-lg hover:bg-slate-100"
                    >
                      <MoreVertical size={18} />
                    </button>
                    {openDropdown === dropdownKey && (
                      <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-50">
                        {/* Confirmar */}
                        {t.status !== 'paid' && (
                          <button
                            onClick={() => handleConfirm(t)}
                            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                          >
                            <CircleCheckBig size={15} className="text-green-500" /> Confirmar
                          </button>
                        )}
                        {/* Confirmar Parcialmente */}
                        {t.status !== 'paid' && (
                          <div>
                            {partialInput?.id === dropdownKey ? (
                              <div className="px-4 py-2.5 space-y-2">
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Valor pago</label>
                                <div className="flex gap-2">
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    max={t.amount - 0.01}
                                    placeholder="0,00"
                                    value={partialInput.value}
                                    onChange={(e) => setPartialInput({ id: dropdownKey, value: e.target.value })}
                                    className="flex-1 px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500/20"
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => handlePartialConfirm(t, parseFloat(partialInput.value))}
                                    className="px-3 py-1.5 bg-teal-600 text-white text-xs font-bold rounded-lg hover:bg-teal-700"
                                  >
                                    OK
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => setPartialInput({ id: dropdownKey, value: '' })}
                                className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                              >
                                <CircleDashed size={15} className="text-orange-500" /> Confirmar Parcialmente
                              </button>
                            )}
                          </div>
                        )}
                        {/* Desfazer confirmação */}
                        {t.status === 'paid' && (
                          <button
                            onClick={async () => {
                              await supabase.from('financial_transactions').update({ status: 'pending', paid_amount: null, paid_date: null }).eq('id', t.id);
                              toast.success('Status revertido para pendente.');
                              await fetchTransactions();
                              setOpenDropdown(null);
                            }}
                            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                          >
                            <CircleDashed size={15} className="text-amber-500" /> Desfazer Confirmação
                          </button>
                        )}
                        <div className="border-t border-slate-100 my-1" />
                        {/* Clonar */}
                        <button
                          onClick={() => handleClone(t)}
                          className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          <Copy size={15} className="text-slate-500" /> Clonar
                        </button>
                        {/* Editar */}
                        <button
                          onClick={() => handleEdit(t)}
                          className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          <Pencil size={15} className="text-blue-500" /> Editar
                        </button>
                        <div className="border-t border-slate-100 my-1" />
                        {/* Excluir */}
                        <button
                          onClick={() => handleDelete(t.id)}
                          className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={15} /> Excluir
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/30">
          <p className="text-xs text-slate-400">
            {filteredInstances.length} lançamento{filteredInstances.length !== 1 ? 's' : ''} neste mês
          </p>
        </div>
      </div>

      {/* Modal */}
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
