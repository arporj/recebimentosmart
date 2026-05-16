import { useState, useEffect, useRef, useMemo } from 'react';
import { 
  X, 
  Search, 
  Calendar as CalendarIcon, 
  CheckSquare, 
  Square, 
  ArrowRight,
  ChevronDown,
  Plus,
  Tag as TagIcon,
  CreditCard,
  TrendingUp,
  Landmark,
  PiggyBank
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { usePlanLimits } from '../../hooks/usePlanLimits';
import { format } from 'date-fns';
import { calcularMesFatura } from '../../lib/financeiro/faturaUtils';
import toast from 'react-hot-toast';
import { ClientFormV2 } from './ClientFormV2';
import { TagModalV2 } from './FinancialTransactionModalV2/TagModalV2';
import { criarTransacao as criarTransacaoFinanceira } from '../../lib/financeiro/criarTransacao';
import { editarTransacao as editarTransacaoFinanceira } from '../../lib/financeiro/editarTransacao';
import { ModalOpcaoRecorrente } from '../financeiro/ModalOpcaoRecorrente';
import QuickAddAccountModal from './QuickAddAccountModal';
import QuickAddCategoryModal from './QuickAddCategoryModal';
import { BRAZILIAN_BANKS } from '../../constants/banks';

interface Tag {
  id: string;
  name: string;
  color: string | null;
}

interface Client {
  id: string;
  name: string;
}

interface Account {
  id: string;
  name: string;
  type: string;
  secondary_cards?: string[] | { name: string }[];
  main_card_name?: string;
  closing_days_before?: number | null;
  due_day?: number | null;
  bank_name?: string | null;
  bank_icon?: string | null;
  card_brand?: string | null;
}



interface Category {
  id: string;
  name: string;
  icon: string | null;
  parent_id: string | null;
}

interface TransactionData {
  id: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  date: string;
  description: string;
  status: 'pending' | 'paid' | 'partial';
  recurrence_enabled?: boolean;
  recurrence_period?: string;
  recurrence_interval?: number;
  client_id?: string;
  account_id?: string;
  category_id?: string;
  client?: { name: string };
  destination_account_id?: string;
  auto_confirm?: boolean;
  tags?: { tag: { id: string; name: string; color: string } }[];
  invoice_month?: string | null;
  card_holder_name?: string | null;
}

interface FinancialTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialType?: 'income' | 'expense' | 'transfer';
  initialAccountId?: string;
  initialDestinationAccountId?: string;
  initialDescription?: string;
  initialAmount?: string | number;
  initialDate?: string;
  transaction?: TransactionData | null;
  isConfirming?: boolean;
}

const FinancialTransactionModalV2 = ({ 
  isOpen, 
  onClose, 
  onSuccess,
  initialType = 'income',
  initialAccountId = '',
  initialDestinationAccountId = '',
  initialDescription = '',
  initialAmount = '',
  initialDate,
  transaction = null,
  isConfirming = false
}: FinancialTransactionModalProps) => {
  const { user } = useAuth();
  const { checkLimit } = usePlanLimits();
  const isEditing = !!transaction;

  const [type, setType] = useState<'income' | 'expense' | 'transfer'>(initialType);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [description, setDescription] = useState('');
  const [clientId, setClientId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [destinationAccountId, setDestinationAccountId] = useState('');
  // Credit Card specific fields
  const [invoiceMonth, setInvoiceMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [cardHolderName, setCardHolderName] = useState('');
  const [installmentTotal, setInstallmentTotal] = useState('1');
  
  // Novos campos para Módulo Financeiro Avançado
  const [modalidade, setModalidade] = useState<'unica' | 'parcelada' | 'recorrente'>('unica');
  const [dueDay, setDueDay] = useState(new Date().getDate());
  const [isScopeModalOpen, setIsScopeModalOpen] = useState(false);
  const [scopeType, setScopeType] = useState<'edit' | 'delete'>('edit');
  const [tempFormData, setTempFormData] = useState<any>(null);
  const [periodicidade, setPeriodicidade] = useState<'diaria' | 'semanal' | 'mensal' | 'anual'>('mensal');
  const [startInstallment, setStartInstallment] = useState(1);
  const [isTotalValue, setIsTotalValue] = useState(false);
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);

  const [clients, setClients] = useState<Client[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [autoConfirm, setAutoConfirm] = useState(false);
  const [status, setStatus] = useState<'pending' | 'paid'>('pending');

  const isCreditCard = accounts.find(a => a.id === accountId)?.type === 'credit_card';
  const [loading, setLoading] = useState(false);
  
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState('');
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
  const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState(false);
  const [isDestAccountDropdownOpen, setIsDestAccountDropdownOpen] = useState(false);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [isQuickAddAccountOpen, setIsQuickAddAccountOpen] = useState(false);
  const [isQuickAddCategoryOpen, setIsQuickAddCategoryOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [pendingAccountType, setPendingAccountType] = useState<'origin' | 'destination'>('origin');

  const amountInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus amount field when modal opens for a new transaction
  useEffect(() => {
    if (isOpen && !transaction) {
      setTimeout(() => amountInputRef.current?.focus(), 100);
    }
  }, [isOpen, transaction]);

  const formatCurrency = (value: string) => {
    const cleanValue = value.replace(/\D/g, "");
    const cents = parseInt(cleanValue || "0");
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(cents / 100);
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const formattedValue = formatCurrency(rawValue);
    setAmount(formattedValue);
  };

  const handleCombinedChange = (value: string) => {
    const [newType, newModalidade] = value.split('_') as [
      'income' | 'expense' | 'transfer',
      'unica' | 'parcelada' | 'recorrente'
    ];
    setType(newType);
    setModalidade(newModalidade);
    setTimeout(() => amountInputRef.current?.focus(), 50);
  };

  // Popular campos ao editar
  useEffect(() => {
    if (isOpen && transaction) {
      setType(transaction.type);
      setDescription(transaction.description || '');
      setDate(transaction.date);
      setClientId(transaction.client_id || '');
      setAccountId(transaction.account_id || '');
      setDestinationAccountId(transaction.destination_account_id || '');
      setCategoryId(transaction.category_id || '');
      setAutoConfirm(transaction.auto_confirm || false);
      setStatus(transaction.status === 'paid' ? 'paid' : 'pending');
      
      // Formatar o valor para exibição
      const amountCents = Math.round(transaction.amount * 100);
      setAmount(new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amountCents / 100));

      // Tags existentes
      if (transaction.tags) {
        setSelectedTags(transaction.tags.map(t => t.tag.id));
      }

      // Novos campos
      setModalidade((transaction as any).modalidade || 'unica');
      setDueDay((transaction as any).due_day || new Date().getDate());
      if (transaction.invoice_month) {
        setInvoiceMonth(transaction.invoice_month);
      }
      if (transaction.card_holder_name) {
        setCardHolderName(transaction.card_holder_name);
      }
    } else if (isOpen && !transaction) {
      // Reset para novo lançamento
      setType(initialType);
      setDescription(initialDescription || '');
      
      if (initialAmount) {
        const amountStr = String(initialAmount);
        // Ensure it's formatted properly if it's passed
        const amountCents = Math.round(parseFloat(amountStr) * 100);
        if (!isNaN(amountCents)) {
           setAmount(new Intl.NumberFormat('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          }).format(amountCents / 100));
        } else {
           setAmount(amountStr);
        }
      } else {
        setAmount('');
      }

      setDate(initialDate || format(new Date(), 'yyyy-MM-dd'));
      setInvoiceMonth(format(new Date(), 'yyyy-MM'));
      setCardHolderName('');
      setInstallmentTotal('1');
      setAutoConfirm(false);
      setStatus('pending');
      setClientId('');
      setAccountId(initialAccountId || '');
      setCategoryId('');
      setDestinationAccountId(initialDestinationAccountId || '');
      setSelectedTags([]);
      
      // Novos campos
      setModalidade('unica');
      setDueDay(new Date().getDate());
      setPeriodicidade('mensal');
      setStartInstallment(1);
      setIsTotalValue(false);
      setRecurrenceInterval(1);
    }
  }, [isOpen, transaction, initialType, initialAccountId, initialDestinationAccountId, initialDescription, initialAmount, initialDate]);


  useEffect(() => {
    if (isOpen && user) {
      fetchClients();
      fetchTags();
      fetchAccounts();
      fetchCategories();
    }
  }, [isOpen, user]);

  const fetchClients = async () => {
    const { data } = await supabase
      .from('clients')
      .select('id, name')
      .eq('user_id', user?.id || '')
      .order('name');
    if (data) setClients(data);
  };

  const fetchTags = async () => {
    const { data } = await supabase
      .from('financial_tags')
      .select('*')
      .eq('user_id', user?.id || '')
      .order('name');
    if (data) setTags(data);
  };

  const fetchAccounts = async () => {
    const { data, error } = await supabase
      .from('financial_accounts')
      .select('id, name, type, secondary_cards, main_card_name, due_day, closing_days_before, bank_name, bank_icon, card_brand')
      .eq('user_id', user?.id || '')
      .eq('is_active', true)
      .order('name');
    
    // Fallback if columns don't exist yet (migration not run)
    if (error) {
      const { data: fallbackData } = await supabase
        .from('financial_accounts')
        .select('id, name, type')
        .eq('user_id', user?.id || '')
        .eq('is_active', true)
        .order('name');
      if (fallbackData) setAccounts(fallbackData as unknown as Account[]);
    } else if (data) {
      setAccounts(data as unknown as Account[]);
    }
  };

  const fetchCategories = async () => {
    const { data } = await supabase
      .from('financial_categories')
      .select('id, name, icon, parent_id')
      .eq('user_id', user?.id || '')
      .order('name');
    if (data) setCategories(data);
  };

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

  const AccountIcon = ({ account }: { account: Account | undefined }) => {
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
        {account.bank_icon ? (
          <div className="w-full h-full relative">
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
            <div className="hidden absolute inset-0 flex items-center justify-center font-bold text-[10px] text-white" style={{ backgroundColor: BRAZILIAN_BANKS.find(b => b.domain === account.bank_icon)?.color || '#94a3b8' }}>
              {account.bank_name?.charAt(0) || getAccountTypeIcon(account.type)}
            </div>
          </div>
        ) : (
          <div className="text-current scale-[0.8] flex items-center justify-center">{getAccountTypeIcon(account.type)}</div>
        )}
      </div>
    );
  };

  // Calcular fatura correta ao mudar data ou cartao selecionado
  useEffect(() => {
    if (!accountId || !date || !accounts.length) return;
    
    const account = accounts.find(a => a.id === accountId);
    if (account?.type === 'credit_card' && account.due_day && account.closing_days_before) {
      const result = calcularMesFatura(date, {
        type: account.type,
        due_day: account.due_day,
        closing_days_before: account.closing_days_before,
      });
      if (result) {
        setInvoiceMonth(result);
      }
    }
  }, [date, accountId, accounts]);

  useEffect(() => {
    if (isCreditCard && accountId && accounts.length > 0) {
      const account = accounts.find(a => a.id === accountId);
      if (account) {
        const holders: string[] = [];
        if (account.main_card_name) holders.push(account.main_card_name);
        if (Array.isArray(account.secondary_cards)) {
          (account.secondary_cards as any[]).forEach((c) => {
            const name = typeof c === 'string' ? c : (c && typeof c === 'object' && 'name' in c ? c.name : '');
            if (name) holders.push(name);
          });
        }
        if (holders.length === 1 && !cardHolderName) {
          setCardHolderName(holders[0]);
        }
      }
    }
  }, [isCreditCard, accountId, accounts, cardHolderName]);

  // Filtragem de categorias baseada no termo de busca
  const filteredCategories = useMemo(() => {
    const search = categorySearch.trim().toLowerCase();
    if (!search) {
      return {
        parentCategories: categories.filter(c => !c.parent_id),
        getChildren: (parentId: string) => categories.filter(c => c.parent_id === parentId)
      };
    }

    // Achar as categorias e subcategorias cujos nomes batem com a pesquisa
    const matchingCats = categories.filter(c => c.name.toLowerCase().includes(search));
    const matchingIds = new Set(matchingCats.map(c => c.id));
    
    // Pais cujas subcategorias deram match
    const parentIdsFromChildren = new Set<string>();
    matchingCats.forEach(c => {
      if (c.parent_id) {
        parentIdsFromChildren.add(c.parent_id);
      }
    });

    // Filtrar pais que batem com a busca OU que possuem filhos que batem
    const parentCats = categories.filter(c => !c.parent_id && (matchingIds.has(c.id) || parentIdsFromChildren.has(c.id)));

    // Função getChildren adaptada para retornar apenas os filhos que dão match (ou todos se o pai for o match principal)
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
  }, [categories, categorySearch]);

  const handleSubmit = async (e?: React.FormEvent, selectedScope?: 'this' | 'following' | 'all') => {
    e?.preventDefault();
    if (!user) return;
    
    if (!checkLimit('transactions')) {
      return;
    }
    
    const parsedAmount = parseFloat(amount.replace(/\./g, '').replace(',', '.'));
    if (!amount || parsedAmount <= 0) {
      toast.error('Informe um valor válido');
      return;
    }

    try {
      setLoading(true);

      const mappedRecurrencePeriod = periodicidade === 'diaria' ? 'daily' : periodicidade === 'semanal' ? 'weekly' : periodicidade === 'anual' ? 'yearly' : 'monthly';

      const payload: any = {
        description,
        amount: parsedAmount,
        type,
        date,
        client_id: clientId || undefined,
        category_id: categoryId || undefined,
        account_id: accountId || undefined,
        destination_account_id: type === 'transfer' ? (destinationAccountId || undefined) : undefined,
        modalidade,
        installment_total: modalidade === 'parcelada' ? parseInt(installmentTotal) : undefined,
        recurrence_period: (modalidade === 'parcelada' || modalidade === 'recorrente') ? mappedRecurrencePeriod : undefined,
        start_installment: modalidade === 'parcelada' ? startInstallment : undefined,
        is_total_value: modalidade === 'parcelada' ? isTotalValue : undefined,
        due_day: modalidade === 'recorrente' ? dueDay : undefined,
        recurrence_interval: modalidade === 'recorrente' ? recurrenceInterval : undefined,
        auto_confirm: autoConfirm,
        invoice_month: isCreditCard ? invoiceMonth : undefined,
        card_holder_name: isCreditCard && cardHolderName ? cardHolderName : undefined,
      };

      payload.status = isConfirming ? 'paid' : status;

      if (isEditing) {
        // Se estiver confirmando, o escopo é SEMPRE 'this' e não abre o modal de escopo
        if (!isConfirming && modalidade !== 'unica' && !isScopeModalOpen && !selectedScope) {
          setTempFormData(payload);
          setScopeType('edit');
          setIsScopeModalOpen(true);
          setLoading(false);
          return;
        }

        const scope = isConfirming ? 'this' : (selectedScope || 'this');
        
        // Se for uma instância virtual (gerada pela recorrência mas que não existe no BD) 
        // e o escopo for 'this', precisamos INSERIR um novo registro físico (filho)
        if ((transaction as any).isVirtual && scope === 'this') {
          const newChildPayload = {
            ...payload,
            user_id: user.id,
            parent_id: transaction!.parent_id || transaction!.id,
            modalidade: 'unica', // a instância filha não carrega as regras de recorrência do pai
            is_customized: true,
            installment_current: (transaction as any).installment_current || 1,
            recurrence_enabled: false
          };
          const { error } = await supabase.from('financial_transactions').insert(newChildPayload);
          if (error) throw error;
        } else {
          // Edição normal de registro existente físico ou atualização do pai
          const { error } = await editarTransacaoFinanceira(transaction!.id, payload, scope);
          if (error) throw error;
        }
      } else {
        const { error } = await criarTransacaoFinanceira(payload);
        if (error) throw error;
      }

      toast.success(isEditing ? 'Lançamento atualizado!' : 'Lançamento criado!');
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-5xl bg-white/90 backdrop-blur-2xl rounded-[2rem] shadow-2xl overflow-hidden border border-white/20 animate-in fade-in zoom-in duration-300 max-h-[90vh] flex flex-col">
        <header className="px-4 py-3 md:px-6 md:py-4 flex justify-between items-center border-b border-slate-100 bg-white/50 shrink-0">
          <div className="flex items-center gap-3">
            <button 
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors"
            >
              <X size={20} className="text-slate-500" />
            </button>
            <h2 className="text-lg font-bold text-slate-900 font-manrope">
              {isEditing ? `Editar ${description || 'Lançamento'}` : 'Nova Transação'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-extrabold text-teal-600 tracking-widest uppercase opacity-60">Recebimento $mart</span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <form onSubmit={handleSubmit} className="p-4 md:p-6 flex flex-col lg:flex-row gap-6 space-y-4 lg:space-y-0">
            {/* Coluna Esquerda: Informações Básicas e Modalidade */}
            <div className="flex-1 space-y-4">
              {/* Linha 1: Valor e Seletor Unificado de Lançamento */}
              <div className="grid grid-cols-12 gap-4">
                {/* Valor */}
                <div className="col-span-4 space-y-2">
                  <div className="h-5 flex items-center px-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Valor (R$)</label>
                  </div>
                  <div className="relative flex items-center">
                    <span className={`absolute left-3 text-xs font-extrabold ${type === 'income' ? 'text-teal-600' : type === 'expense' ? 'text-rose-600' : 'text-indigo-600'}`}>R$</span>
                    <input 
                      ref={amountInputRef}
                      type="text"
                      inputMode="numeric"
                      value={amount}
                      onChange={handleAmountChange}
                      placeholder="0,00"
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-teal-500/20 text-sm font-extrabold text-slate-900 placeholder-slate-300"
                    />
                  </div>
                </div>

                {/* Tipo de Lançamento Combinado */}
                <div className="col-span-8 space-y-2">
                  <div className="h-5 flex items-center px-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Tipo de Lançamento</label>
                  </div>
                  <div className="relative">
                    <select
                      value={`${type}_${modalidade}`}
                      onChange={(e) => handleCombinedChange(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-teal-500/20 text-xs font-bold cursor-pointer appearance-none pr-8 text-slate-700 focus:outline-none"
                    >
                      <optgroup label="🟢 Receitas" className="font-bold text-teal-600 bg-white">
                        <option value="income_unica" className="text-slate-700 bg-white">🟢 Receita - Única</option>
                        <option value="income_parcelada" className="text-slate-700 bg-white">🟢 Receita - Parcelada</option>
                        <option value="income_recorrente" className="text-slate-700 bg-white">🟢 Receita - Recorrente</option>
                      </optgroup>
                      <optgroup label="🔴 Despesas" className="font-bold text-rose-600 bg-white">
                        <option value="expense_unica" className="text-slate-700 bg-white">🔴 Despesa - Única</option>
                        <option value="expense_parcelada" className="text-slate-700 bg-white">🔴 Despesa - Parcelada</option>
                        <option value="expense_recorrente" className="text-slate-700 bg-white">🔴 Despesa - Recorrente</option>
                      </optgroup>
                      <optgroup label="🔵 Transferências" className="font-bold text-indigo-600 bg-white">
                        <option value="transfer_unica" className="text-slate-700 bg-white">🔵 Transferência - Única</option>
                        <option value="transfer_parcelada" className="text-slate-700 bg-white">🔵 Transferência - Parcelada</option>
                        <option value="transfer_recorrente" className="text-slate-700 bg-white">🔵 Transferência - Recorrente</option>
                      </optgroup>
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                      <ChevronDown size={14} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Linha 2: Descrição e Data */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Descrição */}
                <div className="space-y-2">
                  <div className="h-5 flex items-center px-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Descrição</label>
                  </div>
                  <input 
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Descrição do lançamento"
                    className="w-full px-4 py-2.5 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-teal-500/20 text-sm placeholder-slate-400"
                  />
                </div>

                {/* Date Input */}
                <div className="space-y-2">
                  <div className="h-5 flex items-center px-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Data Efetiva</label>
                  </div>
                  <div className="relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-teal-500 transition-colors">
                      <CalendarIcon size={16} />
                    </div>
                    <input 
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full pl-12 pr-4 py-2.5 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-teal-500/20 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Painel Condicional de Modalidade (Parcelada / Recorrente) */}
              {modalidade !== 'unica' && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100/80 space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
                  {modalidade === 'parcelada' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Periodicidade</label>
                          <div className="relative">
                            <select
                              value={periodicidade}
                              onChange={(e) => setPeriodicidade(e.target.value as 'diaria' | 'semanal' | 'mensal' | 'anual')}
                              className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 text-xs font-bold cursor-pointer appearance-none pr-8 text-slate-700 focus:ring-2 focus:ring-teal-500/20 focus:outline-none"
                            >
                              <option value="diaria">Diária</option>
                              <option value="semanal">Semanal</option>
                              <option value="mensal">Mensal</option>
                              <option value="anual">Anual</option>
                            </select>
                            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                              <ChevronDown size={14} />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Parcelas</label>
                          <input 
                            type="number"
                            min="2"
                            value={installmentTotal}
                            onChange={(e) => setInstallmentTotal(e.target.value)}
                            placeholder="Ex: 12"
                            className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-teal-500/20 focus:outline-none text-center"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Parc. Inicial</label>
                          <input 
                            type="number"
                            min="1"
                            max={parseInt(installmentTotal) || 1}
                            value={startInstallment}
                            onChange={(e) => setStartInstallment(parseInt(e.target.value) || 1)}
                            className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-teal-500/20 focus:outline-none text-center"
                          />
                        </div>
                      </div>

                      {/* Toggle Valor Total vs Unitário */}
                      <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
                        <div className="flex items-center justify-between bg-white p-2 rounded-xl border border-slate-100">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Tipo de Valor</span>
                          <div className="flex items-center gap-3">
                            <span className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${!isTotalValue ? 'text-teal-600' : 'text-slate-400'}`}>Unitário</span>
                            <button
                              type="button"
                              onClick={() => setIsTotalValue(!isTotalValue)}
                              className={`relative w-10 h-5.5 rounded-full transition-colors duration-200 focus:outline-none ${isTotalValue ? 'bg-teal-600' : 'bg-slate-300'}`}
                            >
                              <div className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 rounded-full bg-white transition-transform duration-200 ${isTotalValue ? 'translate-x-4.5' : 'translate-x-0'}`} />
                            </button>
                            <span className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${isTotalValue ? 'text-teal-600' : 'text-slate-400'}`}>Total</span>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium bg-white px-3 py-2 rounded-xl border border-slate-100 text-center">
                          Parcelas no valor de <span className="font-bold text-slate-700">{(() => {
                            const parsedAmount = parseFloat(amount.replace(/\./g, '').replace(',', '.')) || 0;
                            const numInstallments = parseInt(installmentTotal) || 1;
                            const value = isTotalValue ? parsedAmount / numInstallments : parsedAmount;
                            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
                          })()}</span>
                        </p>
                      </div>
                    </div>
                  )}

                  {modalidade === 'recorrente' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Periodicidade</label>
                        <div className="relative">
                          <select
                            value={periodicidade}
                            onChange={(e) => setPeriodicidade(e.target.value as 'diaria' | 'semanal' | 'mensal' | 'anual')}
                            className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 text-xs font-bold cursor-pointer appearance-none pr-8 text-slate-700 focus:ring-2 focus:ring-teal-500/20 focus:outline-none"
                          >
                            <option value="diaria">Diária</option>
                            <option value="semanal">Semanal</option>
                            <option value="mensal">Mensal</option>
                            <option value="anual">Anual</option>
                          </select>
                          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                            <ChevronDown size={14} />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          Repetir a cada
                        </label>
                        <div className="relative flex items-center">
                          <input 
                            type="number"
                            min="1"
                            value={recurrenceInterval}
                            onChange={(e) => setRecurrenceInterval(parseInt(e.target.value) || 1)}
                            className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-teal-500/20 focus:outline-none text-center pr-12"
                          />
                          <span className="absolute right-3 text-[10px] font-bold text-slate-400 pointer-events-none uppercase">
                            {periodicidade === 'diaria' ? 'Dias' : periodicidade === 'semanal' ? 'Sem' : periodicidade === 'anual' ? 'Anos' : 'Meses'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Divisor vertical em telas grandes */}
            <div className="hidden lg:block w-[1px] bg-slate-100 self-stretch shrink-0" />

            {/* Coluna Direita: Destinos, Categorias e Classificação */}
            <div className="flex-1 space-y-4">
              {/* Contas, Destinos ou Categorias */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Account Select */}
                <div className="space-y-2">
                  <div className="h-5 flex items-center px-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      {type === 'transfer' ? 'Conta de Origem' : 'Conta'}
                    </label>
                  </div>
                  <div className="relative">
                    <button 
                      type="button"
                      onClick={() => setIsAccountDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setIsAccountDropdownOpen(false), 200)}
                      className="w-full px-4 py-2.5 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-teal-500/20 text-sm text-left flex items-center justify-between"
                    >
                      {accountId ? (
                        <div className="flex items-center gap-3">
                          <AccountIcon account={accounts.find(a => a.id === accountId)} />
                          <div className="flex flex-col">
                            <span className="font-medium text-slate-700 text-xs leading-tight">{accounts.find(a => a.id === accountId)?.name}</span>
                            <span className="text-[9px] text-slate-400">{getAccountTypeLabel(accounts.find(a => a.id === accountId)?.type || '')}</span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">Selecione a conta</span>
                      )}
                      <ChevronDown size={14} className="text-slate-400" />
                    </button>

                    {isAccountDropdownOpen && (
                      <div className="absolute z-30 mt-1 w-full bg-white rounded-xl shadow-xl border border-slate-100 max-h-60 overflow-y-auto">
                        {accounts.map(a => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => {
                              setAccountId(a.id);
                              setIsAccountDropdownOpen(false);
                            }}
                            className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                          >
                            <AccountIcon account={a} />
                            <div className="flex flex-col">
                              <span className="font-medium text-slate-700 text-sm leading-tight">{a.name}</span>
                              <span className="text-[10px] text-slate-400">{getAccountTypeLabel(a.type)}</span>
                            </div>
                          </button>
                        ))}
                        <div className="border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() => {
                              setIsAccountDropdownOpen(false);
                              setPendingAccountType('origin');
                              setIsQuickAddAccountOpen(true);
                            }}
                            className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors text-teal-600 font-bold"
                          >
                            <Plus size={18} />
                            <span className="text-sm">Adicionar conta</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Destination Account Select (Transfer only) or Category Select */}
                {type === 'transfer' ? (
                  <div className="space-y-2 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="h-5 flex items-center px-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">Conta de Destino</label>
                    </div>
                    <div className="relative">
                      <button 
                        type="button"
                        onClick={() => setIsDestAccountDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setIsDestAccountDropdownOpen(false), 200)}
                        className="w-full px-4 py-2.5 bg-indigo-50/50 rounded-2xl border border-indigo-100 focus:ring-2 focus:ring-indigo-500/20 text-sm text-left flex items-center justify-between"
                      >
                        {destinationAccountId ? (
                          <div className="flex items-center gap-3">
                            <AccountIcon account={accounts.find(a => a.id === destinationAccountId)} />
                            <div className="flex flex-col">
                              <span className="font-medium text-slate-700 text-xs leading-tight">{accounts.find(a => a.id === destinationAccountId)?.name}</span>
                              <span className="text-[9px] text-slate-400">{getAccountTypeLabel(accounts.find(a => a.id === destinationAccountId)?.type || '')}</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">Selecione o destino</span>
                        )}
                        <ChevronDown size={14} className="text-indigo-400" />
                      </button>

                      {isDestAccountDropdownOpen && (
                        <div className="absolute z-30 mt-1 w-full bg-white rounded-xl shadow-xl border border-slate-100 max-h-60 overflow-y-auto">
                          {accounts.filter(a => a.id !== accountId).map(a => (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => {
                                setDestinationAccountId(a.id);
                                setIsDestAccountDropdownOpen(false);
                              }}
                              className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                            >
                              <AccountIcon account={a} />
                              <div className="flex flex-col">
                                <span className="font-medium text-slate-700 text-sm leading-tight">{a.name}</span>
                                <span className="text-[10px] text-slate-400">{getAccountTypeLabel(a.type)}</span>
                              </div>
                            </button>
                          ))}
                          <div className="border-t border-slate-100">
                            <button
                              type="button"
                              onClick={() => {
                                setIsDestAccountDropdownOpen(false);
                                setPendingAccountType('destination');
                                setIsQuickAddAccountOpen(true);
                              }}
                              className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors text-indigo-600 font-bold"
                            >
                              <Plus size={18} />
                              <span className="text-sm">Adicionar conta</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="h-5 flex items-center px-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Categoria</label>
                    </div>
                    <div className="relative">
                      <button 
                        type="button"
                        onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                        className="w-full px-4 py-2.5 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-teal-500/20 text-sm text-left flex items-center justify-between"
                      >
                        {categoryId ? (
                          <div className="flex items-center gap-3">
                            <span className="text-base">{categories.find(c => c.id === categoryId)?.icon || '📁'}</span>
                            <span className="font-medium text-slate-700 text-xs leading-tight truncate">{categories.find(c => c.id === categoryId)?.name}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">Selecione uma categoria</span>
                        )}
                        <ChevronDown size={14} className="text-slate-400" />
                      </button>

                      {isCategoryDropdownOpen && (
                        <>
                          {/* Backdrop transparente para fechar ao clicar fora sem atrapalhar o foco do input */}
                          <div 
                            className="fixed inset-0 z-20" 
                            onClick={() => { setIsCategoryDropdownOpen(false); setCategorySearch(''); }} 
                          />
                          <div className="absolute z-30 mt-1 w-full bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden flex flex-col max-h-[260px]">
                            {/* Campo de busca de categoria */}
                            <div className="p-2 border-b border-slate-100 bg-slate-50/80 flex items-center gap-2 sticky top-0 z-10">
                              <Search size={14} className="text-slate-400 shrink-0 ml-2" />
                              <input
                                type="text"
                                value={categorySearch}
                                onChange={(e) => setCategorySearch(e.target.value)}
                                placeholder="Buscar categoria..."
                                autoFocus
                                className="w-full bg-transparent border-none focus:ring-0 text-xs py-1 placeholder:text-slate-400 text-slate-700 focus:outline-none focus:border-none"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                  }
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

                            {/* Container com rolagem */}
                            <div className="overflow-y-auto flex-1">
                              {filteredCategories.parentCategories.length === 0 ? (
                                <div className="px-4 py-6 text-center text-xs text-slate-400">
                                  Nenhuma categoria encontrada para "{categorySearch}"
                                </div>
                              ) : (
                                filteredCategories.parentCategories.map(parent => {
                                  const children = filteredCategories.getChildren(parent.id);
                                  return (
                                    <div key={parent.id} className="border-b border-slate-50 last:border-0 last:mb-0 mb-1 pb-1">
                                      <button
                                        type="button"
                                        onClick={() => { 
                                          setCategoryId(parent.id); 
                                          setIsCategoryDropdownOpen(false); 
                                          setCategorySearch(''); 
                                        }}
                                        className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                                      >
                                        <span className="text-xl">{parent.icon || '📁'}</span>
                                        <div className="flex flex-col">
                                          <span className="font-bold text-slate-700 text-sm leading-tight">{parent.name}</span>
                                          {children.length > 0 && (
                                            <span className="text-[10px] text-slate-400">Possui subcategorias</span>
                                          )}
                                        </div>
                                      </button>
                                      {children.map(child => (
                                        <button
                                          key={child.id}
                                          type="button"
                                          onClick={() => { 
                                            setCategoryId(child.id); 
                                            setIsCategoryDropdownOpen(false); 
                                            setCategorySearch(''); 
                                          }}
                                          className="flex items-center gap-3 w-full pl-10 pr-4 py-2.5 text-left hover:bg-slate-50 transition-colors border-t border-slate-50/50"
                                        >
                                          <span className="text-lg opacity-80">{child.icon || '↘️'}</span>
                                          <span className="text-sm font-medium text-slate-600">{child.name}</span>
                                        </button>
                                      ))}
                                    </div>
                                  );
                                })
                              )}
                              <div className="border-t border-slate-100 bg-white sticky bottom-0 z-10">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsCategoryDropdownOpen(false);
                                    setCategorySearch('');
                                    setIsQuickAddCategoryOpen(true);
                                  }}
                                  className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors text-teal-600 font-bold"
                                >
                                  <Plus size={18} />
                                  <span className="text-sm">Adicionar categoria</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Conditional Credit Card Details */}
              {isCreditCard && (
                <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="space-y-2">
                    <div className="h-5 flex items-center px-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Fatura de</label>
                    </div>
                    <input 
                      type="month"
                      value={invoiceMonth}
                      onChange={(e) => setInvoiceMonth(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-teal-500/20 text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="h-5 flex items-center px-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Titular</label>
                    </div>
                    <div className="relative group">
                      <select 
                        value={cardHolderName || ''}
                        onChange={(e) => setCardHolderName(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-teal-500/20 text-sm !appearance-none bg-none cursor-pointer text-slate-700"
                        style={{ appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none' }}
                      >
                        <option value="">Selecione o titular</option>
                        {(() => {
                          const account = accounts.find(a => a.id === accountId);
                          if (!account) return null;
                          const holders = [];
                          if (account.main_card_name) holders.push(account.main_card_name);
                          if (Array.isArray(account.secondary_cards)) {
                            (account.secondary_cards as any[]).forEach((c) => {
                              const name = typeof c === 'string' ? c : (c && typeof c === 'object' && 'name' in c ? c.name : '');
                              if (name) holders.push(name);
                            });
                          }
                          return holders.map(h => (
                            <option key={h} value={h}>{h}</option>
                          ));
                        })()}
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                        <ChevronDown size={14} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Cliente e Tags */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Client Select */}
                <div className="space-y-2">
                  <div className="h-5 flex justify-between items-center px-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Cliente (Opcional)</label>
                    <button 
                      type="button" 
                      onClick={() => setIsClientModalOpen(true)}
                      className="text-[10px] font-bold uppercase tracking-widest text-teal-600 hover:underline"
                    >
                      + Novo
                    </button>
                  </div>
                  <div className="relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-teal-500 transition-colors">
                      <Search size={16} />
                    </div>
                    <select 
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      className="w-full pl-10 pr-8 py-2.5 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-teal-500/20 text-xs !appearance-none bg-none cursor-pointer text-slate-700"
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

                {/* Tags */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 px-1">Tags</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={tagSearch}
                      onChange={e => { setTagSearch(e.target.value); setIsTagDropdownOpen(true); }}
                      onFocus={() => setIsTagDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setIsTagDropdownOpen(false), 200)}
                      placeholder="Adicionar tags..."
                      className="w-full px-4 py-2.5 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-teal-500/20 text-xs pr-8"
                    />
                    <TagIcon size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    {/* Dropdown */}
                    {isTagDropdownOpen && (
                      <div className="absolute z-30 mt-1 w-full bg-white rounded-xl shadow-xl border border-slate-100 max-h-48 overflow-y-auto">
                        {tags
                          .filter(t => !selectedTags.includes(t.id))
                          .filter(t => !tagSearch.trim() || t.name.toLowerCase().includes(tagSearch.toLowerCase()))
                          .map(tag => (
                            <button
                              key={tag.id}
                              type="button"
                              onClick={() => {
                                setSelectedTags(prev => [...prev, tag.id]);
                                setTagSearch('');
                                setIsTagDropdownOpen(false);
                              }}
                              className="flex items-center gap-2.5 w-full px-4 py-2 text-left hover:bg-slate-50 transition-colors text-xs"
                            >
                              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color || '#64748b' }} />
                              <span className="font-medium text-slate-700">{tag.name}</span>
                            </button>
                          ))
                        }
                        {tagSearch.trim() && !tags.some(t => t.name.toLowerCase() === tagSearch.toLowerCase()) && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (!user) return;
                              const { data, error } = await supabase
                                .from('financial_tags')
                                .insert({ user_id: user.id, name: tagSearch.trim(), color: '#14b8a6' })
                                .select()
                                .single();
                              if (error) { toast.error('Erro ao criar tag: ' + error.message); return; }
                              setTags(prev => [...prev, data]);
                              setSelectedTags(prev => [...prev, data.id]);
                              setTagSearch('');
                              setIsTagDropdownOpen(false);
                              toast.success(`Tag "${data.name}" criada!`);
                            }}
                            className="flex items-center gap-2.5 w-full px-4 py-2 text-left hover:bg-teal-50 transition-colors text-xs border-t border-slate-100 font-semibold"
                          >
                            <Plus size={12} className="text-teal-600" />
                            <span className="text-teal-600">Criar "{tagSearch.trim()}"</span>
                          </button>
                        )}
                        {tags.filter(t => !selectedTags.includes(t.id)).filter(t => !tagSearch.trim() || t.name.toLowerCase().includes(tagSearch.toLowerCase())).length === 0 && !tagSearch.trim() && (
                          <div className="px-4 py-2.5 text-[10px] text-slate-400 italic">Nenhuma tag disponível.</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Chips das tags selecionadas */}
                  {selectedTags.length > 0 && (
                    <div className="flex flex-wrap gap-1 px-1 pt-1.5">
                      {selectedTags.map(tagId => {
                        const tag = tags.find(t => t.id === tagId);
                        if (!tag) return null;
                        return (
                          <span key={tag.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-900 text-white border border-slate-900 shadow-sm shrink-0">
                            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: tag.color || '#64748b' }} />
                            {tag.name}
                            <button
                              type="button"
                              onClick={() => setSelectedTags(prev => prev.filter(id => id !== tagId))}
                              className="ml-1 hover:bg-white/20 rounded-full p-0.5 transition-colors"
                            >
                              <X size={8} />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Toggles de Status e Confirmação */}
              {!isConfirming && (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  {/* Lançamento Pago/Recebido Toggle */}
                  <div className="p-3 bg-slate-50 rounded-2xl flex items-center gap-2.5 border border-slate-100/50">
                    <button 
                      type="button"
                      onClick={() => setStatus(status === 'paid' ? 'pending' : 'paid')}
                      className={`p-0.5 rounded-md transition-all ${status === 'paid' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/10' : 'bg-white text-slate-300 border border-slate-200'}`}
                    >
                      {status === 'paid' ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>
                    <div className="min-w-0">
                      <h3 className="text-xs font-bold text-slate-900 truncate">
                        {type === 'income' ? 'Recebido' : type === 'transfer' ? 'Efetuado' : 'Pago'}
                      </h3>
                      <p className="text-[9px] text-slate-400 uppercase tracking-wider font-extrabold truncate">
                        Marcar como {status === 'paid' ? 'sim' : 'não'}
                      </p>
                    </div>
                  </div>

                  {/* Auto Confirm Toggle */}
                  <div className="p-3 bg-slate-50 rounded-2xl flex items-center gap-2.5 border border-slate-100/50">
                    <button 
                      type="button"
                      onClick={() => setAutoConfirm(!autoConfirm)}
                      className={`p-0.5 rounded-md transition-all ${autoConfirm ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10' : 'bg-white text-slate-300 border border-slate-200'}`}
                    >
                      {autoConfirm ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>
                    <div className="min-w-0">
                      <h3 className="text-xs font-bold text-slate-900 truncate">Confirmar Auto</h3>
                      <p className="text-[9px] text-slate-400 uppercase tracking-wider font-extrabold truncate">
                        No dia do vencimento
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </form>
        </div>

        <footer className="p-4 md:px-6 md:py-4 bg-slate-50/80 backdrop-blur-md border-t border-slate-100 flex flex-col md:flex-row gap-4 items-center justify-between shrink-0">
          <button 
            type="button"
            onClick={onClose}
            className="w-full md:w-auto px-8 py-3.5 text-xs font-extrabold text-slate-400 hover:text-slate-900 transition-all uppercase tracking-widest"
          >
            Cancelar
          </button>
          <button 
            onClick={handleSubmit}
            disabled={loading}
            className={`w-full md:w-auto px-10 py-3.5 rounded-2xl flex items-center justify-center gap-2 text-white text-xs font-extrabold transition-all shadow-xl uppercase tracking-widest ${
              isConfirming
                ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
                : type === 'income' 
                  ? 'bg-teal-600 hover:bg-teal-700 shadow-teal-600/20' 
                  : type === 'expense' 
                    ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                    : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20'
            }`}
          >
            {loading ? 'Salvando...' : (isConfirming ? 'Confirmar Lançamento' : (isEditing ? 'Salvar Alterações' : 'Criar Lançamento'))}
            <ArrowRight size={18} />
          </button>
        </footer>
      </div>

      <ModalOpcaoRecorrente
        isOpen={isScopeModalOpen}
        onClose={() => setIsScopeModalOpen(false)}
        onSelect={(scope) => {
          setIsScopeModalOpen(false);
          // Re-disparar o submit passando o escopo selecionado como argumento para evitar closures estáticas com estado assíncrono
          handleSubmit(undefined, scope as any);
        }}
        type={scopeType}
        modalidade={modalidade === 'parcelada' ? 'parcelada' : 'recorrente'}
      />

      {isClientModalOpen && (
        <ClientFormV2 
          onClose={() => {
            setIsClientModalOpen(false);
            fetchClients();
          }} 
          onSuccess={(newClientId) => {
            fetchClients().then(() => {
              setClientId(newClientId);
            });
            setIsClientModalOpen(false);
          }}
        />
      )}

      {isTagModalOpen && (
        <TagModalV2 
          onClose={() => setIsTagModalOpen(false)}
          onSuccess={(newTag) => {
            setTags(prev => [...prev, newTag]);
            setSelectedTags(prev => [...prev, newTag.id]);
          }}
        />
      )}

      <QuickAddAccountModal 
        isOpen={isQuickAddAccountOpen}
        onClose={() => setIsQuickAddAccountOpen(false)}
        onSuccess={(newId) => {
          fetchAccounts();
          if (pendingAccountType === 'origin') {
            setAccountId(newId);
          } else {
            setDestinationAccountId(newId);
          }
        }}
      />

      <QuickAddCategoryModal 
        isOpen={isQuickAddCategoryOpen}
        onClose={() => setIsQuickAddCategoryOpen(false)}
        onSuccess={(newId) => {
          fetchCategories();
          setCategoryId(newId);
        }}
        categories={categories}
      />
    </div>
  );
};

export default FinancialTransactionModalV2;
