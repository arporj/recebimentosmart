import { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Calendar as CalendarIcon,
  CheckSquare,
  Square,
  Trash2,
  Save,
  Tag as TagIcon,
  ChevronDown,
  Loader2,
  AlertTriangle,
  Landmark,
  PiggyBank,
  TrendingUp,
  CreditCard,
  Search,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { editarTransacao as editarTransacaoFinanceira } from '../../lib/financeiro/editarTransacao';
import { deletarTransacao } from '../../lib/financeiro/deletarTransacao';
import { ModalOpcaoRecorrente } from '../financeiro/ModalOpcaoRecorrente';
import { useEscapeKey } from '../../hooks/useEscapeKey';

interface QuickEditTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  transaction: any;
  isConfirming?: boolean;
}

const QuickEditTransactionModal = ({
  isOpen,
  onClose,
  onSuccess,
  transaction,
  isConfirming = false,
}: QuickEditTransactionModalProps) => {
  const { user } = useAuth();

  // Form fields
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [clientId, setClientId] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isPaid, setIsPaid] = useState(false);
  const [autoConfirm, setAutoConfirm] = useState(false);

  // Data lists
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);

  // UI states
  const [loading, setLoading] = useState(false);
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
  const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState(false);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');

  // Dynamic directions and heights
  const [openAccountUpward, setOpenAccountUpward] = useState(false);
  const [openCategoryUpward, setOpenCategoryUpward] = useState(false);
  const [openTagUpward, setOpenTagUpward] = useState(false);
  const [accountMaxHeight, setAccountMaxHeight] = useState(200);
  const [categoryMaxHeight, setCategoryMaxHeight] = useState(200);
  const [tagMaxHeight, setTagMaxHeight] = useState(140);

  // Refs
  const tagRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const categoryRef = useRef<HTMLDivElement>(null);

  // Scope modal for recurrent/installment transactions
  const [isScopeModalOpen, setIsScopeModalOpen] = useState(false);
  const [scopeAction, setScopeAction] = useState<'edit' | 'delete'>('edit');
  const [pendingPayload, setPendingPayload] = useState<any>(null);

  // Delete confirm for unique transactions
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const isRecurring = transaction?.modalidade === 'recorrente' || transaction?.modalidade === 'parcelada' || !!transaction?.parent_id || transaction?.recurrence_enabled;
  const isCreditCard = accounts.find(a => a.id === accountId)?.type === 'credit_card';

  useEscapeKey(() => {
    if (isScopeModalOpen || isDeleteConfirmOpen || isAccountDropdownOpen || isCategoryDropdownOpen || isTagDropdownOpen) return;
    onClose();
  }, isOpen);

  // Populate form fields
  useEffect(() => {
    if (isOpen && transaction) {
      let initialDate = transaction.originalInstanceDate || transaction.date || format(new Date(), 'yyyy-MM-dd');
      
      // Se for confirmação e a data for futura, ajusta para hoje
      if (isConfirming) {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        if (initialDate > todayStr) {
          initialDate = todayStr;
        }
      }
      
      setDate(initialDate);
      setDescription(transaction.description || '');
      setAccountId(transaction.account_id || '');
      setCategoryId(transaction.category_id || '');
      setClientId(transaction.client_id || '');
      setIsPaid(isConfirming ? true : transaction.status === 'paid');
      setAutoConfirm(transaction.auto_confirm || false);

      // Format amount
      const amountCents = Math.round((transaction.amount || 0) * 100);
      setAmount(
        new Intl.NumberFormat('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(amountCents / 100)
      );

      // Tags
      if (transaction.tags) {
        setSelectedTags(transaction.tags.map((t: any) => t.tag?.id || t.id).filter(Boolean));
      } else {
        setSelectedTags([]);
      }
    }
  }, [isOpen, transaction, isConfirming]);

  // Fetch data
  useEffect(() => {
    if (isOpen && user) {
      fetchAccounts();
      fetchCategories();
      fetchTags();
      fetchClients();
    }
  }, [isOpen, user]);

  // Measure dropdown spaces dynamically
  useEffect(() => {
    if (isCategoryDropdownOpen && categoryRef.current) {
      const rect = categoryRef.current.getBoundingClientRect();
      const scrollContainer = categoryRef.current.closest('.overflow-y-auto');
      const bottomSpace = scrollContainer 
        ? scrollContainer.getBoundingClientRect().bottom - rect.bottom 
        : window.innerHeight - rect.bottom;
      const topSpace = scrollContainer
        ? rect.top - scrollContainer.getBoundingClientRect().top
        : rect.top;
      const shouldOpenUpward = bottomSpace < 120 && topSpace > 200;
      setOpenCategoryUpward(shouldOpenUpward);
      setCategoryMaxHeight(Math.max(120, Math.min(220, (shouldOpenUpward ? topSpace : bottomSpace) - 16)));
    }
  }, [isCategoryDropdownOpen]);

  useEffect(() => {
    if (isAccountDropdownOpen && accountRef.current) {
      const rect = accountRef.current.getBoundingClientRect();
      const scrollContainer = accountRef.current.closest('.overflow-y-auto');
      const bottomSpace = scrollContainer 
        ? scrollContainer.getBoundingClientRect().bottom - rect.bottom 
        : window.innerHeight - rect.bottom;
      const topSpace = scrollContainer
        ? rect.top - scrollContainer.getBoundingClientRect().top
        : rect.top;
      const shouldOpenUpward = bottomSpace < 120 && topSpace > 200;
      setOpenAccountUpward(shouldOpenUpward);
      setAccountMaxHeight(Math.max(120, Math.min(220, (shouldOpenUpward ? topSpace : bottomSpace) - 16)));
    }
  }, [isAccountDropdownOpen]);

  useEffect(() => {
    if (isTagDropdownOpen && tagRef.current) {
      const rect = tagRef.current.getBoundingClientRect();
      const scrollContainer = tagRef.current.closest('.overflow-y-auto');
      const bottomSpace = scrollContainer 
        ? scrollContainer.getBoundingClientRect().bottom - rect.bottom 
        : window.innerHeight - rect.bottom;
      const topSpace = scrollContainer
        ? rect.top - scrollContainer.getBoundingClientRect().top
        : rect.top;
      const shouldOpenUpward = bottomSpace < 100 && topSpace > 180;
      setOpenTagUpward(shouldOpenUpward);
      setTagMaxHeight(Math.max(100, Math.min(180, (shouldOpenUpward ? topSpace : bottomSpace) - 16)));
    }
  }, [isTagDropdownOpen]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (tagRef.current && !tagRef.current.contains(e.target as Node)) {
        setIsTagDropdownOpen(false);
      }
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setIsAccountDropdownOpen(false);
      }
      if (categoryRef.current && !categoryRef.current.contains(e.target as Node)) {
        setIsCategoryDropdownOpen(false);
        setCategorySearch('');
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const fetchAccounts = async () => {
    const { data } = await supabase
      .from('financial_accounts')
      .select('id, name, type')
      .eq('user_id', user?.id || '')
      .eq('is_active', true)
      .order('name');
    if (data) setAccounts(data);
  };

  const fetchClients = async () => {
    const { data } = await supabase
      .from('clients')
      .select('id, name')
      .eq('user_id', user?.id || '')
      .is('deleted_at', null)
      .order('name');
    if (data) setClients(data);
  };

  const fetchCategories = async () => {
    const { data } = await supabase
      .from('financial_categories')
      .select('id, name, icon, parent_id')
      .eq('user_id', user?.id || '')
      .order('name');
    if (data) setCategories(data);
  };

  const fetchTags = async () => {
    const { data } = await supabase
      .from('financial_tags')
      .select('*')
      .eq('user_id', user?.id || '')
      .order('name');
    if (data) setTags(data);
  };

  const formatCurrency = (value: string) => {
    const cleanValue = value.replace(/\D/g, '');
    const cents = parseInt(cleanValue || '0');
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmount(formatCurrency(e.target.value));
  };

  // Organize categories as parent -> children
  const organizedCategories = useMemo(() => {
    const parents = categories.filter((c) => !c.parent_id);
    return parents.map((p) => ({
      ...p,
      children: categories.filter((c) => c.parent_id === p.id),
    }));
  }, [categories]);

  // Filtragem de categorias baseada no termo de busca
  const filteredCategories = useMemo(() => {
    const search = categorySearch.trim().toLowerCase();
    if (!search) {
      return {
        parentCategories: organizedCategories,
        getChildren: (parentId: string) => categories.filter(c => c.parent_id === parentId)
      };
    }

    const matchingCats = categories.filter(c => c.name.toLowerCase().includes(search));
    const matchingIds = new Set(matchingCats.map(c => c.id));
    
    const parentIdsFromChildren = new Set<string>();
    matchingCats.forEach(c => {
      if (c.parent_id) {
        parentIdsFromChildren.add(c.parent_id);
      }
    });

    const parentCats = organizedCategories.filter(c => matchingIds.has(c.id) || parentIdsFromChildren.has(c.id));

    const getFilteredChildren = (parentId: string) => {
      const parentMatches = matchingCats.some(c => c.id === parentId && !c.parent_id);
      return categories.filter(c => 
        c.parent_id === parentId && 
        (parentMatches || c.name.toLowerCase().includes(search))
      );
    };

    return {
      parentCategories: parentCats,
      getChildren: getFilteredChildren
    };
  }, [categories, organizedCategories, categorySearch]);

  const getAccountTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      checking: 'Conta Corrente',
      savings: 'Poupança',
      credit_card: 'Cartão de Crédito',
      investment: 'Investimento'
    };
    return labels[type] || type;
  };

  const getAccountTypeIcon = (type: string) => {
    switch (type) {
      case 'checking': return <Landmark size={18} className="text-teal-600" />;
      case 'savings': return <PiggyBank size={18} className="text-blue-600" />;
      case 'credit_card': return <CreditCard size={18} className="text-indigo-600" />;
      case 'investment': return <TrendingUp size={18} className="text-slate-600" />;
      default: return <Landmark size={18} className="text-slate-600" />;
    }
  };

  const AccountIcon = ({ account }: { account: any }) => {
    if (!account) return <div className="text-slate-400">{getAccountTypeIcon('')}</div>;

    const typeConfig: Record<string, string> = {
      checking: 'bg-blue-50 text-blue-700 border-blue-200',
      savings: 'bg-green-50 text-green-700 border-green-200',
      credit_card: 'bg-purple-50 text-purple-700 border-purple-200',
      investment: 'bg-amber-50 text-amber-700 border-amber-200'
    };

    const bgColorClass = typeConfig[account.type] || 'bg-slate-50 text-slate-400 border-slate-200';

    return (
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center border overflow-hidden shrink-0 ${bgColorClass}`}>
        {getAccountTypeIcon(account.type)}
      </div>
    );
  };

  const handleSave = async (scope?: 'this' | 'following' | 'all') => {
    const parsedAmount = parseFloat(amount.replace(/\./g, '').replace(',', '.'));
    if (!amount || parsedAmount <= 0) {
      toast.error('Informe um valor válido');
      return;
    }

    try {
      setLoading(true);

      const isDateChanged = date !== (transaction.originalInstanceDate || transaction.date);
      const isStatusChangedToPaid = isPaid && transaction.status !== 'paid';
      let paidDate = isPaid 
        ? (isStatusChangedToPaid ? new Date().toISOString() : transaction.paid_date)
        : null;

      if (isPaid && isDateChanged && !isStatusChangedToPaid) {
        paidDate = date;
      }

      const effectiveDate = date;

      const payload: any = {
        date: effectiveDate,
        amount: parsedAmount,
        description,
        account_id: accountId || undefined,
        category_id: categoryId || undefined,
        client_id: clientId || null,
        status: isPaid ? 'paid' : 'pending',
        paid_date: paidDate,
        tags: selectedTags,
        auto_confirm: isCreditCard ? false : autoConfirm,
      };

      // If recurrent and no scope selected yet, ask (unless we are just confirming, which is always 'this')
      if (isRecurring && !scope && !isConfirming) {
        setPendingPayload(payload);
        setScopeAction('edit');
        setIsScopeModalOpen(true);
        setLoading(false);
        return;
      }

      const finalScope = scope || 'this';

      // Handle virtual instances: insert physical child
      if (transaction.isVirtual && finalScope === 'this') {
        const { tags: _tags, ...dbPayload } = payload;
        const chosenDate = payload.date;

        const newChildPayload = {
          ...dbPayload,
          date: chosenDate, // Save the actual date chosen by the user
          user_id: user!.id,
          type: transaction.type,
          parent_id: transaction.parent_id || transaction.id,
          modalidade: 'unica',
          is_customized: true,
          installment_current: transaction.installment_current || 1,
          recurrence_enabled: false,
        };
        const { data: newChild, error } = await supabase
          .from('financial_transactions')
          .insert(newChildPayload)
          .select('id')
          .single();
        if (error) throw error;

        if (selectedTags.length > 0 && newChild) {
          const junctionRows = selectedTags.map((tagId) => ({
            transaction_id: newChild.id,
            tag_id: tagId,
          }));
          await supabase.from('transaction_tags').insert(junctionRows);
        }
      } else {
        const { error } = await editarTransacaoFinanceira(transaction.id, payload, finalScope);
        if (error) throw error;
      }

      toast.success(isConfirming ? 'Lançamento confirmado!' : 'Lançamento atualizado!');
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (scope?: 'this' | 'following' | 'all') => {
    // If recurrent and no scope, ask
    if (isRecurring && !scope) {
      setScopeAction('delete');
      setIsScopeModalOpen(true);
      return;
    }

    // If unique and no confirmation yet, ask
    if (!isRecurring && !isDeleteConfirmOpen && !scope) {
      setIsDeleteConfirmOpen(true);
      return;
    }

    try {
      setLoading(true);
      const { error } = await deletarTransacao({
        transactionId: transaction.id,
        scope: scope || 'this',
        instanceDate: transaction.originalInstanceDate || transaction.instanceDate || transaction.date,
        installmentCurrent: transaction.installment_current,
      });
      if (error) throw error;
      toast.success('Excluído!');
      onSuccess();
      onClose();
    } catch {
      toast.error('Erro ao excluir.');
    } finally {
      setLoading(false);
      setIsDeleteConfirmOpen(false);
    }
  };

  const handleScopeSelect = (scope: 'this' | 'following' | 'all') => {
    setIsScopeModalOpen(false);
    if (scopeAction === 'edit') {
      handleSave(scope);
    } else {
      handleDelete(scope);
    }
  };

  if (!isOpen || !transaction) return null;

  const typeColors = {
    income: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', label: '🟢 Receita' },
    expense: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', label: '🔴 Despesa' },
    transfer: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', label: '🔵 Transferência' },
  };
  const tc = typeColors[transaction.type as keyof typeof typeColors] || typeColors.expense;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          onClick={onClose}
        />

        <div className="relative w-full max-w-lg bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in duration-200 max-h-[90vh] flex flex-col">
          {/* Header */}
          <header className="px-5 py-2.5 flex justify-between items-center border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white shrink-0">
            <div className="flex items-center gap-3">
              <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X size={18} className="text-slate-500" />
              </button>
              <div>
                <h2 className="text-base font-black text-slate-900 font-manrope">
                  {isConfirming ? 'Confirmar Lançamento' : 'Editar Lançamento'}
                </h2>
                <span className={`text-[10px] font-extrabold uppercase tracking-widest ${tc.text}`}>
                  {tc.label}
                </span>
              </div>
            </div>
            {isRecurring && (
              <span className="text-[9px] font-extrabold uppercase tracking-wider text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                {(transaction as any).modalidade === 'parcelada' ? 'Parcelado' : 'Recorrente'}
              </span>
            )}
          </header>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5 custom-scrollbar">
            {/* Valor e Data lado a lado */}
            <div className="grid grid-cols-2 gap-3">
              {/* Valor */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5 block">Valor (R$)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={amount}
                  onChange={handleAmountChange}
                  className={`w-full text-lg font-black py-2 px-3.5 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 ${tc.border} ${tc.bg} ${tc.text} focus:ring-offset-1`}
                  placeholder="0,00"
                />
              </div>

              {/* Data */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5 block">Data</label>
                <div className="relative">
                  <CalendarIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full py-2 pl-9 pr-4 rounded-xl border border-slate-200 focus:border-teal-400 focus:ring-2 focus:ring-teal-100 outline-none text-xs font-semibold text-slate-800 transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Descrição */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5 block">Descrição</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full py-2 px-3.5 rounded-xl border border-slate-200 focus:border-teal-400 focus:ring-2 focus:ring-teal-100 outline-none text-xs font-semibold text-slate-800 transition-all"
                placeholder="Ex: Aluguel, Salário..."
              />
            </div>

            {/* Conta, Categoria e Cliente lado a lado */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Conta */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5 block">Conta</label>
                <div ref={accountRef} className={`relative ${isAccountDropdownOpen ? 'z-40' : 'z-10'}`}>
                  <button 
                    type="button"
                    onClick={() => setIsAccountDropdownOpen(!isAccountDropdownOpen)}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border-none focus:ring-2 focus:ring-teal-500/20 text-xs text-left flex items-center justify-between text-slate-700"
                  >
                    {accountId ? (
                      <div className="flex items-center gap-2">
                        <AccountIcon account={accounts.find(a => a.id === accountId)} />
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-slate-700 text-xs leading-tight truncate">{accounts.find(a => a.id === accountId)?.name}</span>
                          <span className="text-[8px] text-slate-400 font-medium leading-none">{getAccountTypeLabel(accounts.find(a => a.id === accountId)?.type || '')}</span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-400">Selecione a conta</span>
                    )}
                    <ChevronDown size={14} className="text-slate-400 shrink-0 ml-1" />
                  </button>

                  {isAccountDropdownOpen && (
                    <div 
                      className={`absolute z-30 ${openAccountUpward ? 'bottom-full mb-1' : 'top-full mt-1'} w-full bg-white rounded-xl shadow-xl border border-slate-100 overflow-y-auto`}
                      style={{ maxHeight: `${accountMaxHeight}px` }}
                    >
                      {accounts.map(a => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            setAccountId(a.id);
                            setIsAccountDropdownOpen(false);
                          }}
                          className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
                        >
                          <AccountIcon account={a} />
                          <div className="flex flex-col min-w-0">
                            <span className="font-bold text-slate-700 text-xs leading-tight truncate">{a.name}</span>
                            <span className="text-[9px] text-slate-400 font-medium leading-none">{getAccountTypeLabel(a.type)}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Categoria */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5 block">Categoria</label>
                <div ref={categoryRef} className={`relative ${isCategoryDropdownOpen ? 'z-40' : 'z-10'}`}>
                  <button 
                    type="button"
                    onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border-none focus:ring-2 focus:ring-teal-500/20 text-xs text-left flex items-center justify-between text-slate-700"
                  >
                    {categoryId ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm shrink-0">{categories.find(c => c.id === categoryId)?.icon || '📁'}</span>
                        <span className="font-bold text-slate-700 text-xs leading-tight truncate">{categories.find(c => c.id === categoryId)?.name}</span>
                      </div>
                    ) : (
                      <span className="text-slate-400">Selecione a categoria</span>
                    )}
                    <ChevronDown size={14} className="text-slate-400 shrink-0 ml-1" />
                  </button>

                  {isCategoryDropdownOpen && (
                    <div 
                      className={`absolute z-30 ${openCategoryUpward ? 'bottom-full mb-1' : 'top-full mt-1'} w-full bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden flex flex-col`}
                      style={{ maxHeight: `${categoryMaxHeight}px` }}
                    >
                      <div className="p-2 border-b border-slate-100 bg-slate-50/80 flex items-center gap-2 sticky top-0 z-10">
                        <Search size={14} className="text-slate-400 shrink-0 ml-2" />
                        <input
                          type="text"
                          value={categorySearch}
                          onChange={(e) => setCategorySearch(e.target.value)}
                          placeholder="Buscar categoria..."
                          autoFocus
                          className="w-full bg-transparent border-none focus:ring-0 text-xs py-1 placeholder:text-slate-400 text-slate-700 focus:outline-none focus:border-none font-bold"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.preventDefault();
                          }}
                        />
                        {categorySearch && (
                          <button
                            type="button"
                            onClick={() => setCategorySearch('')}
                            className="p-1 rounded-full hover:bg-slate-200 text-slate-400 transition-colors shrink-0"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>

                      <div className="overflow-y-auto flex-1">
                        {filteredCategories.parentCategories.length === 0 ? (
                          <div className="px-4 py-6 text-center text-xs text-slate-400 font-medium">
                            Nenhuma categoria encontrada
                          </div>
                        ) : (
                          filteredCategories.parentCategories.map(parent => {
                            const children = filteredCategories.getChildren(parent.id);
                            return (
                              <div key={parent.id} className="border-b border-slate-50 last:border-0 last:mb-0 mb-1 pb-1">
                                <button
                                  type="button"
                                  onClick={(e) => { 
                                    e.preventDefault();
                                    setCategoryId(parent.id); 
                                    setIsCategoryDropdownOpen(false); 
                                    setCategorySearch(''); 
                                  }}
                                  className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
                                >
                                  <span className="text-lg shrink-0">{parent.icon || '📁'}</span>
                                  <div className="flex flex-col min-w-0">
                                    <span className="font-bold text-slate-700 text-xs leading-tight truncate">{parent.name}</span>
                                    {children.length > 0 && (
                                      <span className="text-[8px] text-slate-400 font-medium leading-none">Possui subcategorias</span>
                                    )}
                                  </div>
                                </button>
                                {children.map(child => (
                                  <button
                                    key={child.id}
                                    type="button"
                                    onClick={(e) => { 
                                      e.preventDefault();
                                      setCategoryId(child.id); 
                                      setIsCategoryDropdownOpen(false); 
                                      setCategorySearch(''); 
                                    }}
                                    className="flex items-center gap-2.5 w-full pl-8 pr-3 py-2 text-left hover:bg-slate-50 transition-colors border-t border-slate-50/50"
                                  >
                                    <span className="text-md opacity-80 shrink-0">{child.icon || '↘️'}</span>
                                    <span className="text-xs font-bold text-slate-600 truncate">{child.name}</span>
                                  </button>
                                ))}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Cliente */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5 block">Cliente (Opcional)</label>
                <div className="relative group">
                  <select
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 rounded-xl border-none focus:ring-2 focus:ring-teal-500/20 text-xs !appearance-none bg-none cursor-pointer text-slate-700 font-bold"
                    style={{ appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none' }}
                  >
                    <option value="">Nenhum cliente</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                    <ChevronDown size={14} />
                  </div>
                </div>
              </div>
            </div>

            {/* Tags */}
            <div ref={tagRef} className="relative">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5 block">Tags</label>
              <button
                type="button"
                onClick={() => setIsTagDropdownOpen(!isTagDropdownOpen)}
                className="w-full py-2 px-3.5 rounded-xl border border-slate-200 focus:border-teal-400 text-xs font-semibold text-slate-800 text-left flex items-center justify-between bg-white hover:bg-slate-50 transition-all"
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  <TagIcon size={12} className="text-slate-400 shrink-0" />
                  {selectedTags.length > 0 ? (
                    selectedTags.map((tagId) => {
                      const tag = tags.find((t) => t.id === tagId);
                      return tag ? (
                        <span
                          key={tagId}
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded border"
                          style={{
                            backgroundColor: (tag.color || '#94a3b8') + '15',
                            borderColor: (tag.color || '#94a3b8') + '40',
                            color: tag.color || '#475569',
                          }}
                        >
                          {tag.name}
                        </span>
                      ) : null;
                    })
                  ) : (
                    <span className="text-slate-400">Nenhuma tag</span>
                  )}
                </div>
                <ChevronDown size={14} className={`text-slate-400 transition-transform ${isTagDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isTagDropdownOpen && (
                <div 
                  className={`absolute z-20 ${openTagUpward ? 'bottom-full mb-1' : 'top-full mt-1'} w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-y-auto`}
                  style={{ maxHeight: `${tagMaxHeight}px` }}
                >
                  {tags.length === 0 ? (
                    <p className="p-2 text-xs text-slate-400 text-center">Nenhuma tag cadastrada</p>
                  ) : (
                    tags.map((tag) => {
                      const isSelected = selectedTags.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => {
                            setSelectedTags((prev) =>
                              isSelected ? prev.filter((id) => id !== tag.id) : [...prev, tag.id]
                            );
                          }}
                          className={`w-full px-2.5 py-1.5 text-left text-xs font-bold flex items-center gap-2 hover:bg-slate-50 transition-colors ${isSelected ? 'bg-slate-50' : ''}`}
                        >
                          {isSelected ? (
                            <CheckSquare size={12} className="text-teal-600 shrink-0" />
                          ) : (
                            <Square size={12} className="text-slate-300 shrink-0" />
                          )}
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: tag.color || '#94a3b8' }}
                          />
                          {tag.name}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Checkboxes de Status e Confirmação */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              {/* Checkbox Pago */}
              <div
                onClick={() => {
                  const newPaid = !isPaid;
                  setIsPaid(newPaid);
                  if (newPaid) setAutoConfirm(false);
                }}
                className={`flex items-center gap-2 px-2 rounded-xl border-2 cursor-pointer transition-all ${
                  isPaid
                    ? 'bg-emerald-50 border-emerald-300 shadow-sm shadow-emerald-100'
                    : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                }`}
              >
                {isPaid ? (
                  <CheckSquare size={16} className="text-emerald-600 shrink-0" />
                ) : (
                  <Square size={16} className="text-slate-400 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className={`text-xs font-black ${isPaid ? 'text-emerald-700' : 'text-slate-600'} leading-tight`}>
                    {isPaid ? 'Pago' : 'Pendente'}
                  </p>
                  <p className="text-[8px] text-slate-400 font-medium leading-none mt-0.5">
                    {isPaid ? 'Confirmado.' : 'Marcar pago.'}
                  </p>
                </div>
              </div>

              {/* Auto Confirm Toggle */}
              {!isPaid && !isCreditCard && (date >= format(new Date(), 'yyyy-MM-dd')) && (
                <div
                  onClick={() => setAutoConfirm(!autoConfirm)}
                  className={`flex items-center gap-2 px-2 rounded-xl border-2 cursor-pointer transition-all ${
                    autoConfirm
                      ? 'bg-indigo-50 border-indigo-300 shadow-sm shadow-indigo-100'
                      : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {autoConfirm ? (
                    <CheckSquare size={16} className="text-indigo-600 shrink-0" />
                  ) : (
                    <Square size={16} className="text-slate-400 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold text-slate-900 truncate leading-tight flex items-center gap-1">
                      Auto Confirmar
                      <div className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-slate-200 text-slate-500 cursor-help" title="Na data de vencimento, o sistema marcará esta transação como paga automaticamente durante a madrugada.">
                        <span className="text-[9px] font-black">?</span>
                      </div>
                    </h3>
                    <p className="text-[8px] text-slate-400 uppercase tracking-wider font-extrabold truncate leading-none mt-0.5">
                      No vencimento
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <footer className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              onClick={() => handleDelete()}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors border border-rose-200"
            >
              <Trash2 size={14} />
              Excluir
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleSave()}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-black rounded-xl shadow-lg shadow-teal-500/30 transition-all disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                {isConfirming ? 'Confirmar' : 'Salvar'}
              </button>
            </div>
          </footer>
        </div>
      </div>

      {/* Scope modal for recurrent */}
      <ModalOpcaoRecorrente
        isOpen={isScopeModalOpen}
        onClose={() => setIsScopeModalOpen(false)}
        onSelect={handleScopeSelect}
        type={scopeAction}
        modalidade={transaction?.modalidade === 'parcelada' ? 'parcelada' : 'recorrente'}
      />

      {/* Delete confirmation for unique */}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[999] animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden flex flex-col p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-rose-600 mb-4">
              <div className="p-3 bg-rose-50 rounded-2xl">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-lg font-black tracking-tight text-slate-900">Excluir Lançamento</h3>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed font-medium mb-6">
              Tem certeza que deseja excluir{' '}
              <strong className="text-slate-800 font-extrabold">"{transaction?.description}"</strong> de valor{' '}
              <strong className="text-rose-600 font-extrabold">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(transaction?.amount || 0)}
              </strong>
              ? Esta ação não pode ser desfeita.
            </p>

            <div className="flex justify-end gap-3 border-t border-slate-50 pt-4">
              <button
                onClick={() => setIsDeleteConfirmOpen(false)}
                className="px-5 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-2xl font-bold hover:bg-slate-50 transition-colors text-xs"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete('this')}
                disabled={loading}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-bold shadow-lg shadow-rose-500/30 transition-colors text-xs disabled:opacity-50"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : 'Sim, Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default QuickEditTransactionModal;
