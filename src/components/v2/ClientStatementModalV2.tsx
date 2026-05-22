import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  FileText,
  ChevronDown,
  Landmark,
  PiggyBank,
  CreditCard
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-hot-toast';
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
  category_id?: string | null;
  account_id?: string | null;
  tags?: { tag: { id: string; name: string; color: string } }[];
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
  const { user } = useAuth();
  const [rawTransactions, setRawTransactions] = useState<FinancialTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(selectedMonth || new Date());
  
  // Categorias, Contas e Tags do usuário logado
  const [categories, setCategories] = useState<{ id: string; name: string; icon: string | null }[]>([]);
  const [accounts, setAccounts] = useState<{ 
    id: string; 
    name: string; 
    type: string; 
    bank_icon: string | null; 
    bank_name: string | null; 
  }[]>([]);
  const [availableTags, setAvailableTags] = useState<{ id: string; name: string; color: string }[]>([]);
  
  const [activeCategoryDropdownTxId, setActiveCategoryDropdownTxId] = useState<string | null>(null);
  const [activeAccountDropdownTxId, setActiveAccountDropdownTxId] = useState<string | null>(null);

  const getAccountTypeIcon = (type: string) => {
    switch (type) {
      case 'checking': return <Landmark size={14} className="text-teal-600 animate-in" />;
      case 'savings': return <PiggyBank size={14} className="text-blue-600 animate-in" />;
      case 'credit_card': return <CreditCard size={14} className="text-indigo-600 animate-in" />;
      case 'investment': return <TrendingUp size={14} className="text-slate-600 animate-in" />;
      default: return <Landmark size={14} className="text-slate-600 animate-in" />;
    }
  };

  const getAccountTypeLabel = (type?: string) => {
    switch (type) {
      case 'checking': return 'Corrente';
      case 'savings': return 'Poupança';
      case 'investment': return 'Investimento';
      case 'credit_card': return 'Cartão de Crédito';
      default: return 'Conta';
    }
  };

  const AccountIcon = ({ account }: { account: any }) => {
    if (!account) return <div className="text-slate-400 shrink-0">{getAccountTypeIcon('')}</div>;

    const typeConfig: Record<string, string> = {
      checking: 'bg-blue-50 text-blue-700 border-blue-200/50',
      savings: 'bg-green-50 text-green-700 border-green-200/50',
      credit_card: 'bg-purple-50 text-purple-700 border-purple-200/50',
      investment: 'bg-amber-50 text-amber-700 border-amber-200/50'
    };

    const bgColorClass = typeConfig[account.type] || 'bg-slate-50 text-slate-400 border-slate-200';

    return (
      <div className={`w-5 h-5 rounded flex items-center justify-center border overflow-hidden shrink-0 ${bgColorClass}`}>
        {account.bank_icon ? (
          <div className="w-full h-full relative flex items-center justify-center">
            <img 
              src={`https://www.google.com/s2/favicons?domain=${account.bank_icon}&sz=64`} 
              alt={account.bank_name || ''} 
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.classList.add('hidden');
                if (target.nextElementSibling) {
                  target.nextElementSibling.classList.remove('hidden');
                }
              }}
            />
            <div className="hidden absolute inset-0 flex items-center justify-center font-bold text-[8px] text-slate-500 bg-slate-100">
              {account.bank_name?.charAt(0) || 'B'}
            </div>
          </div>
        ) : (
          <div className="text-current scale-[0.7] flex items-center justify-center shrink-0">{getAccountTypeIcon(account.type)}</div>
        )}
      </div>
    );
  };

  useEffect(() => {
    if (isOpen && clientId && user) {
      fetchStatement();
      fetchCategoriesAccountsAndTags();
    }
  }, [isOpen, clientId, user]);

  const fetchCategoriesAccountsAndTags = async () => {
    if (!user) return;
    try {
      const [catRes, accRes, tagRes] = await Promise.all([
        supabase.from('financial_categories').select('id, name, icon').eq('user_id', user.id).order('name'),
        supabase.from('financial_accounts').select('id, name, type, bank_icon, bank_name').eq('user_id', user.id).eq('is_active', true).order('name'),
        supabase.from('financial_tags').select('id, name, color').eq('user_id', user.id)
      ]);
      if (catRes.data) setCategories(catRes.data as any);
      if (accRes.data) setAccounts(accRes.data as any);
      if (tagRes.data) setAvailableTags(tagRes.data);
    } catch (err) {
      console.error('Erro ao carregar categorias, contas ou tags:', err);
    }
  };

  const fetchStatement = async () => {
    if (!user) return;
    try {
      setLoading(true);
      // Buscar todas as transações ativas do cliente com suas tags
      const { data, error } = await supabase
        .from('financial_transactions')
        .select(`
          id, type, amount, date, description, status, recurrence_enabled, recurrence_period, recurrence_interval, recurrence_end_date, parent_id, modalidade, installment_total, installment_current, paid_amount, paid_date, category_id, account_id,
          tags:transaction_tags(tag:financial_tags(id, name, color))
        `)
        .eq('client_id', clientId)
        .eq('user_id', user.id)
        .neq('status', 'cancelled');

      if (error) throw error;
      setRawTransactions((data || []) as any);
    } catch (err) {
      console.error('Erro ao buscar extrato do cliente:', err);
    } finally {
      setLoading(false);
    }
  };

  // Atualização inline de campos da transação
  const handleUpdateField = async (transactionId: string, field: string, value: any, oldValue: any) => {
    if (value === oldValue) return;
    try {
      const { error } = await supabase
        .from('financial_transactions')
        .update({ [field]: value })
        .eq('id', transactionId);

      if (error) throw error;

      // Propagar para filhos se for uma transação mãe recorrente
      const tx = rawTransactions.find(t => t.id === transactionId);
      const isMother = tx && tx.recurrence_enabled && !tx.parent_id;

      if (isMother && (field === 'category_id' || field === 'account_id')) {
        const { error: childErr } = await supabase
          .from('financial_transactions')
          .update({ [field]: value })
          .eq('parent_id', transactionId);

        if (childErr) console.error('Erro ao propagar alteração para parcelas filhas:', childErr);
      }

      toast.success('Lançamento atualizado com sucesso!');
      fetchStatement();
    } catch (err) {
      console.error('Erro ao atualizar campo:', err);
      toast.error('Erro ao salvar alterações.');
    }
  };

  // Gerenciamento de Tags na transação
  const handleAddTag = async (transactionId: string, tagId: string) => {
    try {
      const { error } = await supabase
        .from('transaction_tags')
        .insert({
          transaction_id: transactionId,
          tag_id: tagId
        });

      if (error) throw error;
      toast.success('Tag associada!');
      fetchStatement();
    } catch (err) {
      console.error('Erro ao adicionar tag:', err);
      toast.error('Falha ao associar tag.');
    }
  };

  const handleRemoveTag = async (transactionId: string, tagId: string) => {
    try {
      const { error } = await supabase
        .from('transaction_tags')
        .delete()
        .eq('transaction_id', transactionId)
        .eq('tag_id', tagId);

      if (error) throw error;
      toast.success('Tag removida.');
      fetchStatement();
    } catch (err) {
      console.error('Erro ao remover tag:', err);
      toast.error('Falha ao desassociar tag.');
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

  // Cálculos de totais baseados nos tipos corretos de transações (income = receita, expense = despesa)
  const totals = useMemo(() => {
    const income = monthInstances
      .filter(t => t.type === 'income')
      .reduce((acc, cur) => acc + Number(cur.amount), 0);

    const expense = monthInstances
      .filter(t => t.type === 'expense')
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

      {/* Content Card */}
      <div className="relative bg-slate-50 w-full h-full md:max-w-6xl md:h-[85vh] md:rounded-[2rem] shadow-2xl overflow-hidden flex flex-col transition-all duration-300">
        
        {/* Modal Header */}
        <div className="bg-white border-b border-slate-100 px-6 py-5 shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-teal-50 p-2.5 rounded-2xl text-teal-600 border border-teal-100/50">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-800 tracking-tight leading-tight">Extrato Compartilhado</h3>
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

        {/* Cards de Totais */}
        <div className="bg-white border-b border-slate-100 px-6 py-5 grid grid-cols-3 gap-4 shrink-0">
          <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100 flex flex-col">
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">A Receber (Mês)</span>
            <span className="text-base sm:text-lg font-black text-emerald-600 flex items-center">
              <TrendingUp className="w-4 h-4 mr-1 text-emerald-500" />
              {formatCurrency(totals.income)}
            </span>
          </div>

          <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100 flex flex-col">
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">A Pagar (Mês)</span>
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

        {/* Corpo - Tabela de Lançamentos Granulares Notion-Style */}
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
            <div className="bg-white rounded-3xl border border-slate-200 overflow-x-auto shadow-sm transition-all duration-300 pb-2">
              <table className="w-full text-left border-collapse min-w-[900px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 w-24">Data</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 w-52">Descrição</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 w-44">Categoria</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 w-44">Conta Bancária</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 w-48">Tags</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 text-right w-32">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {monthInstances.map((t) => {
                    const isIncome = t.type === 'income'; 
                    const formattedDate = format(parseISO(t.instanceDate), 'dd/MM/yyyy');

                    return (
                      <tr key={t.id} className="hover:bg-slate-50/50 transition-colors group">
                        {/* Data */}
                        <td className="px-4 py-3 text-xs font-bold text-slate-400 whitespace-nowrap">
                          {formattedDate}
                        </td>

                        {/* Descrição */}
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            defaultValue={t.description}
                            onBlur={(e) => handleUpdateField(t.id, 'description', e.target.value, t.description)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                            className="bg-transparent hover:bg-slate-100/70 focus:bg-white focus:ring-1 focus:ring-teal-500 rounded px-2 py-1 w-full text-xs font-bold text-slate-700 transition-all border border-transparent focus:border-slate-200 outline-none"
                            placeholder="Descrição do lançamento..."
                          />
                          {t.status === 'pending' && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold bg-amber-50 text-amber-700 border border-amber-100 uppercase tracking-wide mt-1 ml-2">
                              Pendente
                            </span>
                          )}
                        </td>

                        {/* Categoria */}
                        <td className="px-4 py-3 relative">
                          {(() => {
                            const currentCat = categories.find(c => c.id === t.category_id);
                            const isOpenDropdown = activeCategoryDropdownTxId === t.id;
                            return (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveCategoryDropdownTxId(isOpenDropdown ? null : t.id);
                                    setActiveAccountDropdownTxId(null);
                                  }}
                                  className="w-full text-left px-2.5 py-2 hover:bg-slate-100/70 rounded-xl flex items-center justify-between text-xs font-bold text-slate-700 transition-all gap-1.5 border border-transparent hover:border-slate-200/50"
                                >
                                  <span className="flex items-center gap-2 truncate">
                                    <span className="text-base shrink-0 select-none">{currentCat?.icon || '📁'}</span>
                                    <span className="truncate">{currentCat?.name || 'Sem Categoria'}</span>
                                  </span>
                                  <ChevronDown size={12} className="text-slate-400 shrink-0" />
                                </button>
                                
                                {isOpenDropdown && (
                                  <>
                                    <div className="fixed inset-0 z-20" onClick={() => setActiveCategoryDropdownTxId(null)} />
                                    <div className="absolute left-2 top-full mt-1 z-30 w-52 bg-white rounded-xl shadow-xl border border-slate-100 p-1.5 max-h-56 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          handleUpdateField(t.id, 'category_id', null, t.category_id);
                                          setActiveCategoryDropdownTxId(null);
                                        }}
                                        className="flex items-center gap-2.5 w-full px-3 py-2 text-left hover:bg-slate-50 text-xs font-medium text-slate-400 transition-colors border-b border-slate-50 rounded-lg"
                                      >
                                        <span className="text-sm shrink-0 select-none">📁</span>
                                        <div className="flex flex-col">
                                          <span className="leading-tight font-semibold text-slate-400">Sem Categoria</span>
                                          <span className="text-[8px] text-slate-300 font-medium">Nenhuma categoria selecionada</span>
                                        </div>
                                      </button>
                                      
                                      {categories.map(c => (
                                        <button
                                          key={c.id}
                                          type="button"
                                          onClick={() => {
                                            handleUpdateField(t.id, 'category_id', c.id, t.category_id);
                                            setActiveCategoryDropdownTxId(null);
                                          }}
                                          className={`flex items-center gap-2.5 w-full px-3 py-2 text-left hover:bg-slate-50 text-xs transition-colors rounded-lg ${
                                            t.category_id === c.id ? 'bg-teal-50/50 font-black text-teal-800' : 'text-slate-600 font-medium'
                                          }`}
                                        >
                                          <span className="text-base shrink-0 select-none">{c.icon || '📁'}</span>
                                          <span className="truncate">{c.name}</span>
                                        </button>
                                      ))}
                                    </div>
                                  </>
                                )}
                              </>
                            );
                          })()}
                        </td>

                        {/* Conta Bancária */}
                        <td className="px-4 py-3 relative">
                          {(() => {
                            const currentAcc = accounts.find(a => a.id === t.account_id);
                            const isOpenDropdown = activeAccountDropdownTxId === t.id;
                            return (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveAccountDropdownTxId(isOpenDropdown ? null : t.id);
                                    setActiveCategoryDropdownTxId(null);
                                  }}
                                  className="w-full text-left px-2.5 py-1.5 hover:bg-slate-100/70 rounded-xl flex items-center justify-between text-xs font-bold text-slate-700 transition-all gap-1.5 border border-transparent hover:border-slate-200/50"
                                >
                                  <span className="flex items-center gap-2.5 truncate">
                                    <AccountIcon account={currentAcc} />
                                    <div className="flex flex-col min-w-0 text-left">
                                      <span className="truncate text-slate-700 font-bold text-xs leading-tight">
                                        {currentAcc?.name || 'Sem Conta'}
                                      </span>
                                      {currentAcc && (
                                        <span className="text-[8px] text-slate-400 font-semibold leading-none mt-0.5">
                                          {getAccountTypeLabel(currentAcc.type)}
                                        </span>
                                      )}
                                    </div>
                                  </span>
                                  <ChevronDown size={12} className="text-slate-400 shrink-0" />
                                </button>
                                
                                {isOpenDropdown && (
                                  <>
                                    <div className="fixed inset-0 z-20" onClick={() => setActiveAccountDropdownTxId(null)} />
                                    <div className="absolute left-2 top-full mt-1 z-30 w-52 bg-white rounded-xl shadow-xl border border-slate-100 p-1.5 max-h-56 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          handleUpdateField(t.id, 'account_id', null, t.account_id);
                                          setActiveAccountDropdownTxId(null);
                                        }}
                                        className="flex items-center gap-2.5 w-full px-3 py-2 text-left hover:bg-slate-50 text-xs font-medium text-slate-400 transition-colors border-b border-slate-50 rounded-lg"
                                      >
                                        <div className="w-5 h-5 rounded flex items-center justify-center border border-slate-200 bg-slate-50 text-slate-400 shrink-0">
                                          <Landmark size={12} />
                                        </div>
                                        <div className="flex flex-col">
                                          <span className="leading-tight font-semibold">Sem Conta</span>
                                          <span className="text-[8px] text-slate-300 font-medium">Nenhuma conta selecionada</span>
                                        </div>
                                      </button>
                                      
                                      {accounts.map(a => (
                                        <button
                                          key={a.id}
                                          type="button"
                                          onClick={() => {
                                            handleUpdateField(t.id, 'account_id', a.id, t.account_id);
                                            setActiveAccountDropdownTxId(null);
                                          }}
                                          className={`flex items-center gap-2.5 w-full px-3 py-2 text-left hover:bg-slate-50 text-xs transition-colors rounded-lg ${
                                            t.account_id === a.id ? 'bg-teal-50/50 font-black text-teal-800' : 'text-slate-600 font-medium'
                                          }`}
                                        >
                                          <AccountIcon account={a} />
                                          <div className="flex flex-col min-w-0">
                                            <span className="truncate font-semibold leading-tight">{a.name}</span>
                                            <span className="text-[8px] text-slate-400 mt-0.5">{getAccountTypeLabel(a.type)}</span>
                                          </div>
                                        </button>
                                      ))}
                                    </div>
                                  </>
                                )}
                              </>
                            );
                          })()}
                        </td>

                        {/* Tags */}
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1 items-center">
                            {t.tags?.map(tt => (
                              <span
                                key={tt.tag.id}
                                className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-md border text-white shadow-sm flex items-center gap-0.5"
                                style={{ backgroundColor: tt.tag.color || '#20B2AA', borderColor: tt.tag.color || '#20B2AA' }}
                              >
                                {tt.tag.name}
                                <button
                                  onClick={() => handleRemoveTag(t.id, tt.tag.id)}
                                  className="hover:bg-white/20 rounded-full p-0.5 transition-colors"
                                >
                                  <X size={8} />
                                </button>
                              </span>
                            ))}
                            <select
                              value=""
                              onChange={(e) => {
                                if (e.target.value) {
                                  handleAddTag(t.id, e.target.value);
                                }
                              }}
                              className="bg-slate-100 hover:bg-slate-200 rounded px-1 py-0.5 text-[9px] font-black text-slate-500 border border-transparent cursor-pointer w-[42px] h-[20px] outline-none"
                            >
                              <option value="" disabled>+</option>
                              {availableTags
                                .filter(tag => !t.tags?.some(tt => tt.tag.id === tag.id))
                                .map(tag => (
                                  <option key={tag.id} value={tag.id}>{tag.name}</option>
                                ))
                              }
                            </select>
                          </div>
                        </td>

                        {/* Valor */}
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <span className={`text-sm font-black font-manrope ${
                            isIncome ? 'text-emerald-600' : 'text-rose-600'
                          }`}>
                            {isIncome ? '+' : '-'} {formatCurrency(t.amount)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  
                  {/* Linha espaçadora transparente para expandir a altura do tbody quando o dropdown estiver aberto */}
                  {(activeCategoryDropdownTxId || activeAccountDropdownTxId) && (
                    <tr className="h-56 select-none pointer-events-none border-none">
                      <td colSpan={6} className="border-none bg-transparent h-56"></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
