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
import { useEscapeKey } from '../../hooks/useEscapeKey';
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
  const [startInstallment, setStartInstallment] = useState<string>('1');
  const [isTotalValue, setIsTotalValue] = useState(false);
  const [recurrenceInterval, setRecurrenceInterval] = useState<string>('1');
  const [isRecurrenceWarningOpen, setIsRecurrenceWarningOpen] = useState(false);

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
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [isModalidadeDropdownOpen, setIsModalidadeDropdownOpen] = useState(false);
  const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState(false);
  const [isDestAccountDropdownOpen, setIsDestAccountDropdownOpen] = useState(false);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [isQuickAddAccountOpen, setIsQuickAddAccountOpen] = useState(false);
  const [isQuickAddCategoryOpen, setIsQuickAddCategoryOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [pendingAccountType, setPendingAccountType] = useState<'origin' | 'destination'>('origin');

  const [isMobile, setIsMobile] = useState(false);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLDivElement>(null);
  const tagRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const destAccountRef = useRef<HTMLDivElement>(null);
  const modalidadeRef = useRef<HTMLDivElement>(null);
  
  const [openCategoryUpward, setOpenCategoryUpward] = useState(false);
  const [openTagUpward, setOpenTagUpward] = useState(false);
  const [openAccountUpward, setOpenAccountUpward] = useState(false);
  const [openDestAccountUpward, setOpenDestAccountUpward] = useState(false);
  const [openModalidadeUpward, setOpenModalidadeUpward] = useState(false);
  const [categoryMaxHeight, setCategoryMaxHeight] = useState(260);
  const [accountMaxHeight, setAccountMaxHeight] = useState(280);
  const [destAccountMaxHeight, setDestAccountMaxHeight] = useState(280);
  const [tagMaxHeight, setTagMaxHeight] = useState(210);
  const [accountSearch, setAccountSearch] = useState('');
  const [destAccountSearch, setDestAccountSearch] = useState('');

  // Rastrear dispositivo mobile vs desktop
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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
      // Abre para cima apenas em casos extremos de falta de espaço inferior
      const shouldOpenUpward = bottomSpace < 120 && topSpace > 300;
      setOpenCategoryUpward(shouldOpenUpward);
      setCategoryMaxHeight(Math.max(150, Math.min(260, (shouldOpenUpward ? topSpace : bottomSpace) - 16)));
    }
  }, [isCategoryDropdownOpen]);

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
      // Abre para cima apenas em casos extremos de falta de espaço inferior
      const shouldOpenUpward = bottomSpace < 100 && topSpace > 250;
      setOpenTagUpward(shouldOpenUpward);
      setTagMaxHeight(Math.max(120, Math.min(210, (shouldOpenUpward ? topSpace : bottomSpace) - 16)));
    }
  }, [isTagDropdownOpen]);

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
      // Abre para cima apenas em casos extremos de falta de espaço inferior
      const shouldOpenUpward = bottomSpace < 120 && topSpace > 300;
      setOpenAccountUpward(shouldOpenUpward);
      setAccountMaxHeight(Math.max(150, Math.min(280, (shouldOpenUpward ? topSpace : bottomSpace) - 16)));
    }
  }, [isAccountDropdownOpen]);

  useEffect(() => {
    if (isDestAccountDropdownOpen && destAccountRef.current) {
      const rect = destAccountRef.current.getBoundingClientRect();
      const scrollContainer = destAccountRef.current.closest('.overflow-y-auto');
      const bottomSpace = scrollContainer 
        ? scrollContainer.getBoundingClientRect().bottom - rect.bottom 
        : window.innerHeight - rect.bottom;
      const topSpace = scrollContainer
        ? rect.top - scrollContainer.getBoundingClientRect().top
        : rect.top;
      // Abre para cima apenas em casos extremos de falta de espaço inferior
      const shouldOpenUpward = bottomSpace < 120 && topSpace > 300;
      setOpenDestAccountUpward(shouldOpenUpward);
      setDestAccountMaxHeight(Math.max(150, Math.min(280, (shouldOpenUpward ? topSpace : bottomSpace) - 16)));
    }
  }, [isDestAccountDropdownOpen]);

  useEffect(() => {
    if (isModalidadeDropdownOpen && modalidadeRef.current) {
      const rect = modalidadeRef.current.getBoundingClientRect();
      const scrollContainer = modalidadeRef.current.closest('.overflow-y-auto');
      const bottomSpace = scrollContainer 
        ? scrollContainer.getBoundingClientRect().bottom - rect.bottom 
        : window.innerHeight - rect.bottom;
      const topSpace = scrollContainer
        ? rect.top - scrollContainer.getBoundingClientRect().top
        : rect.top;
      const shouldOpenUpward = bottomSpace < 140 && topSpace > 140;
      setOpenModalidadeUpward(shouldOpenUpward);
    }
  }, [isModalidadeDropdownOpen]);

  // Auto-focus amount field when modal opens for a new transaction
  useEffect(() => {
    if (isOpen && !transaction) {
      setTimeout(() => amountInputRef.current?.focus(), 100);
    }
  }, [isOpen, transaction]);

  useEscapeKey(() => {
    // Só fecha o modal principal se nenhum sub-dropdown ou sub-modal estiver aberto
    if (isCategoryDropdownOpen || isAccountDropdownOpen || isDestAccountDropdownOpen || isTagDropdownOpen || isClientModalOpen || isTagModalOpen || isQuickAddAccountOpen || isQuickAddCategoryOpen || isScopeModalOpen) {
      return;
    }
    onClose();
  }, isOpen);

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
      setIsTotalValue((transaction as any).is_total_value || false);
      if ((transaction as any).installment_total) {
        setInstallmentTotal(String((transaction as any).installment_total));
      }
      if ((transaction as any).start_installment) {
        setStartInstallment(String((transaction as any).start_installment));
      }
      if ((transaction as any).recurrence_interval) {
        setRecurrenceInterval(String((transaction as any).recurrence_interval));
      }
      if ((transaction as any).recurrence_period) {
        const period = (transaction as any).recurrence_period;
        setPeriodicidade(period === 'daily' ? 'diaria' : period === 'weekly' ? 'semanal' : period === 'yearly' ? 'anual' : 'mensal');
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
      setStartInstallment('1');
      setIsTotalValue(false);
      setRecurrenceInterval('1');
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

  // Adjust toggles based on date
  useEffect(() => {
    if (!isOpen) return;
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    if (date < todayStr) {
      setAutoConfirm(false);
    } else if (date > todayStr) {
      setStatus('pending');
    }
  }, [date, isOpen]);

  const fetchClients = async () => {
    const { data } = await supabase
      .from('clients')
      .select('id, name')
      .eq('user_id', user?.id || '')
      .is('deleted_at', null)
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
      if (fallbackData) {
        setAccounts(fallbackData as unknown as Account[]);
        if (fallbackData.length === 1 && !transaction && !initialAccountId) {
          setAccountId(fallbackData[0].id);
        }
      }
    } else if (data) {
      setAccounts(data as unknown as Account[]);
      if (data.length === 1 && !transaction && !initialAccountId) {
        setAccountId(data[0].id);
      }
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
    if (!description || description.trim() === '') {
      toast.error('Informe a descrição do lançamento');
      return;
    }
    if (!accountId) {
      toast.error('Informe a conta de origem do lançamento');
      return;
    }
    if (type === 'transfer' && !destinationAccountId) {
      toast.error('Informe a conta de destino para a transferência');
      return;
    }
    if (!categoryId) {
      toast.error('Informe a categoria do lançamento');
      return;
    }
    if (!date) {
      toast.error('Informe a data do lançamento');
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
        installment_total: modalidade === 'parcelada' ? (parseInt(installmentTotal) || 2) : undefined,
        recurrence_period: (modalidade === 'parcelada' || modalidade === 'recorrente') ? mappedRecurrencePeriod : undefined,
        start_installment: modalidade === 'parcelada' ? (parseInt(startInstallment) || 1) : undefined,
        is_total_value: modalidade === 'parcelada' ? isTotalValue : undefined,
        due_day: modalidade === 'recorrente' ? dueDay : undefined,
        recurrence_interval: modalidade === 'recorrente' ? (parseInt(recurrenceInterval) || 1) : undefined,
        auto_confirm: isCreditCard ? false : autoConfirm,
        invoice_month: isCreditCard ? invoiceMonth : undefined,
        card_holder_name: isCreditCard && cardHolderName ? cardHolderName : undefined,
        tags: selectedTags,
      };

      payload.status = isConfirming ? 'paid' : (isCreditCard ? 'pending' : status);

      const isStatusChangedToPaid = payload.status === 'paid' && (!isEditing || transaction?.status !== 'paid');
      payload.paid_date = payload.status === 'paid'
        ? (isStatusChangedToPaid ? new Date().toISOString() : transaction?.paid_date)
        : null;

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
          const { tags: virtualTags, ...dbPayload } = payload;
          const chosenDate = payload.date;

          const newChildPayload = {
            ...dbPayload,
            date: chosenDate, // Salva a data real escolhida pelo usuário
            user_id: user.id,
            parent_id: transaction!.parent_id || transaction!.id,
            modalidade: 'unica', // a instância filha não carrega as regras de recorrência do pai
            is_customized: true,
            installment_current: (transaction as any).installment_current || 1,
            recurrence_enabled: false
          };
          const { data: newChild, error } = await supabase
            .from('financial_transactions')
            .insert(newChildPayload)
            .select()
            .single();
          if (error) throw error;

          // Salvar as tags físicas na junção para o novo filho físico virtualizado
          if (selectedTags.length > 0 && newChild) {
            const junctionRows = selectedTags.map(tagId => ({
              transaction_id: newChild.id,
              tag_id: tagId
            }));
            const { error: tagError } = await supabase.from('transaction_tags').insert(junctionRows);
            if (tagError) console.error('Erro ao salvar tags da transação virtual física:', tagError);
          }
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
      handleClose();
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedTags([]);
    setTagSearch('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
        onClick={handleClose}
      />
      
      <div className="relative w-full max-w-5xl bg-white/90 backdrop-blur-2xl rounded-[2rem] shadow-2xl overflow-hidden border border-white/20 animate-in fade-in zoom-in duration-300 max-h-[90vh] flex flex-col">
        <header className="px-4 py-3 md:px-6 md:py-4 flex justify-between items-center border-b border-slate-100 bg-white/50 shrink-0">
          <div className="flex items-center gap-3">
            <button 
              onClick={handleClose}
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
          <form onSubmit={handleSubmit} className="p-4 md:p-6 pb-24 md:pb-32 flex flex-col">
            {/* Linha 1: Seletor de Tipo (Despesa / Receita / Transferência) */}
            <div className="w-full space-y-2 mb-6">
              <div className="h-5 flex items-center px-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Tipo de Transação</label>
              </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setType('expense');
                      setTimeout(() => amountInputRef.current?.focus(), 50);
                    }}
                    className={`py-3 px-2 rounded-2xl border text-xs md:text-sm font-extrabold flex items-center justify-center gap-1.5 transition-all ${
                      type === 'expense'
                        ? 'bg-rose-50 text-rose-700 border-rose-200 ring-2 ring-rose-500/20'
                        : 'bg-slate-50 text-slate-600 border-slate-100 hover:bg-slate-100'
                    }`}
                  >
                    🔴 Despesa
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setType('income');
                      setTimeout(() => amountInputRef.current?.focus(), 50);
                    }}
                    className={`py-3 px-2 rounded-2xl border text-xs md:text-sm font-extrabold flex items-center justify-center gap-1.5 transition-all ${
                      type === 'income'
                        ? 'bg-teal-50 text-teal-700 border-teal-200 ring-2 ring-teal-500/20'
                        : 'bg-slate-50 text-slate-600 border-slate-100 hover:bg-slate-100'
                    }`}
                  >
                    🟢 Receita
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setType('transfer');
                      setTimeout(() => amountInputRef.current?.focus(), 50);
                    }}
                    className={`py-3 px-2 rounded-2xl border text-xs md:text-sm font-extrabold flex items-center justify-center gap-1.5 transition-all ${
                      type === 'transfer'
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200 ring-2 ring-indigo-500/20'
                        : 'bg-slate-50 text-slate-600 border-slate-100 hover:bg-slate-100'
                    }`}
                  >
                    🔵 Transf.
                  </button>
              </div>
            </div>

            {/* Restante do Formulário */}
            <div className="flex flex-col lg:flex-row gap-6 space-y-4 lg:space-y-0">
              {/* Coluna Esquerda: Informações Básicas e Modalidade */}
              <div className="flex-1 space-y-4">
                {/* Linha 2: Valor, Data, Modalidade, Descrição */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* 1. Valor */}
                  <div className="space-y-2">
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

                {/* 2. Data Efetiva */}
                <div className="space-y-2">
                  <div className="h-5 flex items-center px-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Data Efetiva</label>
                  </div>
                  <div 
                    className="relative group cursor-pointer"
                    onClick={() => {
                      if (isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica') {
                        setIsRecurrenceWarningOpen(true);
                      }
                    }}
                  >
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-teal-500 transition-colors">
                      <CalendarIcon size={16} />
                    </div>
                    <input 
                      type="date"
                      value={date}
                      onChange={(e) => {
                        if (isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica') {
                          return;
                        }
                        setDate(e.target.value);
                      }}
                      readOnly={isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica'}
                      className={`w-full pl-12 pr-4 py-2.5 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-teal-500/20 text-sm ${
                        isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica'
                          ? 'opacity-70 cursor-not-allowed select-none'
                          : ''
                      }`}
                    />
                  </div>
                </div>

                {/* 3. Modalidade (Repetição) */}
                <div className="space-y-2">
                  <div className="h-5 flex items-center px-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Modalidade</label>
                  </div>
                  <div ref={modalidadeRef} className={`relative ${isModalidadeDropdownOpen ? 'z-40' : 'z-10'}`}>
                    <button
                      type="button"
                      onClick={() => {
                        if (isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica') {
                          setIsRecurrenceWarningOpen(true);
                          return;
                        }
                        setIsModalidadeDropdownOpen(!isModalidadeDropdownOpen);
                      }}
                      className={`w-full px-4 py-2.5 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-slate-500/20 text-sm font-extrabold flex items-center justify-between text-slate-700 transition-all ${
                        isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica'
                          ? 'opacity-70 cursor-not-allowed'
                          : 'hover:bg-slate-100/75'
                      }`}
                    >
                      <span>
                        {modalidade === 'unica' && '📅 Única'}
                        {modalidade === 'parcelada' && '💳 Parcelada'}
                        {modalidade === 'recorrente' && '🔄 Recorrente'}
                      </span>
                      <ChevronDown size={16} className={`transition-transform duration-200 ${isModalidadeDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isModalidadeDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-20" onClick={() => setIsModalidadeDropdownOpen(false)} />
                        <div className={`absolute z-30 ${openModalidadeUpward ? 'bottom-full mb-1' : 'top-full mt-1'} w-full bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 duration-200`}>
                          <button
                            type="button"
                            onClick={() => {
                              setModalidade('unica');
                              setIsModalidadeDropdownOpen(false);
                            }}
                            className={`flex items-center w-full px-4 py-3 text-left hover:bg-slate-50 text-sm font-bold text-slate-700 transition-colors ${modalidade === 'unica' ? 'bg-slate-50/50' : ''}`}
                          >
                            📅 Única
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setModalidade('parcelada');
                              setIsModalidadeDropdownOpen(false);
                            }}
                            className={`flex items-center w-full px-4 py-3 text-left hover:bg-slate-50 text-sm font-bold text-slate-700 transition-colors ${modalidade === 'parcelada' ? 'bg-slate-50/50' : ''}`}
                          >
                            💳 Parcelada
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setModalidade('recorrente');
                              setIsModalidadeDropdownOpen(false);
                            }}
                            className={`flex items-center w-full px-4 py-3 text-left hover:bg-slate-50 text-sm font-bold text-slate-700 transition-colors ${modalidade === 'recorrente' ? 'bg-slate-50/50' : ''}`}
                          >
                            🔄 Recorrente
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* 4. Descrição */}
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
              </div>

              {/* Painel Condicional de Modalidade (Parcelada / Recorrente) */}
              {modalidade !== 'unica' && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100/80 space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
                  {modalidade === 'parcelada' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-3">
                        <div 
                          className="space-y-1.5 cursor-pointer"
                          onClick={() => {
                            if (isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica') {
                              setIsRecurrenceWarningOpen(true);
                            }
                          }}
                        >
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Periodicidade</label>
                          <div className="relative">
                            <select
                              value={periodicidade}
                              disabled={isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica'}
                              onChange={(e) => setPeriodicidade(e.target.value as 'diaria' | 'semanal' | 'mensal' | 'anual')}
                              className={`w-full px-3 py-2 bg-white rounded-xl border border-slate-200 text-xs font-bold appearance-none pr-8 text-slate-700 focus:ring-2 focus:ring-teal-500/20 focus:outline-none ${
                                isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica'
                                  ? 'cursor-not-allowed opacity-70'
                                  : 'cursor-pointer'
                              }`}
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

                        <div 
                          className="space-y-1.5 cursor-pointer"
                          onClick={() => {
                            if (isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica') {
                              setIsRecurrenceWarningOpen(true);
                            }
                          }}
                        >
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center block">Total Parcelas</label>
                          <div className={`flex items-center justify-between bg-white rounded-xl border border-slate-200 p-1 ${
                            isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica'
                              ? 'opacity-70'
                              : ''
                          }`}>
                            <button
                              type="button"
                              disabled={isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica'}
                              onClick={() => {
                                if (isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica') {
                                  setIsRecurrenceWarningOpen(true);
                                  return;
                                }
                                const val = parseInt(installmentTotal) || 2;
                                if (val > 2) {
                                  setInstallmentTotal(String(val - 1));
                                }
                              }}
                              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 font-bold active:scale-90 transition-all text-sm select-none"
                            >
                              -
                            </button>
                            <input 
                              type="number"
                              min="2"
                              disabled={isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica'}
                              value={installmentTotal}
                              onChange={(e) => {
                                if (isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica') {
                                  return;
                                }
                                setInstallmentTotal(e.target.value);
                              }}
                              onBlur={() => {
                                if (isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica') {
                                  return;
                                }
                                const val = parseInt(installmentTotal);
                                if (isNaN(val) || val < 2) {
                                  setInstallmentTotal('2');
                                } else {
                                  setInstallmentTotal(String(val));
                                }
                              }}
                              placeholder="Ex: 12"
                              className={`w-10 text-center bg-transparent border-0 text-xs font-semibold focus:ring-0 focus:outline-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                                isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica'
                                  ? 'cursor-not-allowed'
                                  : ''
                              }`}
                            />
                            <button
                              type="button"
                              disabled={isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica'}
                              onClick={() => {
                                if (isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica') {
                                  setIsRecurrenceWarningOpen(true);
                                  return;
                                }
                                const val = parseInt(installmentTotal) || 2;
                                setInstallmentTotal(String(val + 1));
                              }}
                              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 font-bold active:scale-90 transition-all text-sm select-none"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        <div 
                          className="space-y-1.5 cursor-pointer"
                          onClick={() => {
                            if (isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica') {
                              setIsRecurrenceWarningOpen(true);
                            }
                          }}
                        >
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center block">Parc. Inicial</label>
                          <div className={`flex items-center justify-between bg-white rounded-xl border border-slate-200 p-1 ${
                            isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica'
                              ? 'opacity-70'
                              : ''
                          }`}>
                            <button
                              type="button"
                              disabled={isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica'}
                              onClick={() => {
                                if (isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica') {
                                  setIsRecurrenceWarningOpen(true);
                                  return;
                                }
                                const val = parseInt(startInstallment) || 1;
                                if (val > 1) {
                                  setStartInstallment(String(val - 1));
                                }
                              }}
                              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 font-bold active:scale-90 transition-all text-sm select-none"
                            >
                              -
                            </button>
                            <input 
                              type="number"
                              min="1"
                              disabled={isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica'}
                              max={parseInt(installmentTotal) || 1}
                              value={startInstallment}
                              onChange={(e) => {
                                if (isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica') {
                                  return;
                                }
                                setStartInstallment(e.target.value);
                              }}
                              onBlur={() => {
                                if (isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica') {
                                  return;
                                }
                                const val = parseInt(startInstallment);
                                const maxVal = parseInt(installmentTotal) || 1;
                                if (isNaN(val) || val < 1) {
                                  setStartInstallment('1');
                                } else if (val > maxVal) {
                                  setStartInstallment(String(maxVal));
                                } else {
                                  setStartInstallment(String(val));
                                }
                              }}
                              placeholder="Ex: 1"
                              className={`w-10 text-center bg-transparent border-0 text-xs font-semibold focus:ring-0 focus:outline-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                                isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica'
                                  ? 'cursor-not-allowed'
                                  : ''
                              }`}
                            />
                            <button
                              type="button"
                              disabled={isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica'}
                              onClick={() => {
                                if (isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica') {
                                  setIsRecurrenceWarningOpen(true);
                                  return;
                                }
                                const val = parseInt(startInstallment) || 1;
                                const maxVal = parseInt(installmentTotal) || 1;
                                if (val < maxVal) {
                                  setStartInstallment(String(val + 1));
                                }
                              }}
                              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 font-bold active:scale-90 transition-all text-sm select-none"
                            >
                              +
                            </button>
                          </div>
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
                              className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${isTotalValue ? 'bg-teal-600' : 'bg-slate-300'}`}
                            >
                              <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200 ${isTotalValue ? 'translate-x-5' : 'translate-x-0'}`} />
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
                      <div 
                        className="space-y-1.5 cursor-pointer"
                        onClick={() => {
                          if (isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica') {
                            setIsRecurrenceWarningOpen(true);
                          }
                        }}
                      >
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Periodicidade</label>
                        <div className="relative">
                          <select
                            value={periodicidade}
                            disabled={isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica'}
                            onChange={(e) => setPeriodicidade(e.target.value as 'diaria' | 'semanal' | 'mensal' | 'anual')}
                            className={`w-full px-3 py-2 bg-white rounded-xl border border-slate-200 text-xs font-bold appearance-none pr-8 text-slate-700 focus:ring-2 focus:ring-teal-500/20 focus:outline-none ${
                              isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica'
                                ? 'cursor-not-allowed opacity-70'
                                : 'cursor-pointer'
                            }`}
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

                      <div 
                        className="space-y-1.5 cursor-pointer"
                        onClick={() => {
                          if (isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica') {
                            setIsRecurrenceWarningOpen(true);
                          }
                        }}
                      >
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block text-center">
                          Repetir a cada
                        </label>
                        <div className={`flex items-center justify-between bg-white rounded-xl border border-slate-200 p-1 relative ${
                          isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica'
                            ? 'opacity-70'
                            : ''
                        }`}>
                          <button
                            type="button"
                            disabled={isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica'}
                            onClick={() => {
                              if (isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica') {
                                setIsRecurrenceWarningOpen(true);
                                return;
                              }
                              const val = parseInt(recurrenceInterval) || 1;
                              if (val > 1) {
                                setRecurrenceInterval(String(val - 1));
                              }
                            }}
                            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 font-bold active:scale-90 transition-all text-sm select-none"
                          >
                            -
                          </button>
                          <input 
                            type="number"
                            min="1"
                            disabled={isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica'}
                            value={recurrenceInterval}
                            onChange={(e) => {
                              if (isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica') {
                                return;
                              }
                              setRecurrenceInterval(e.target.value);
                            }}
                            onBlur={() => {
                              if (isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica') {
                                return;
                              }
                              const val = parseInt(recurrenceInterval);
                              if (isNaN(val) || val < 1) {
                                setRecurrenceInterval('1');
                              } else {
                                setRecurrenceInterval(String(val));
                              }
                            }}
                            placeholder="Ex: 1"
                            className={`w-10 text-center bg-transparent border-0 text-xs font-semibold focus:ring-0 focus:outline-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                              isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica'
                                ? 'cursor-not-allowed'
                                : ''
                            }`}
                          />
                          <button
                            type="button"
                            disabled={isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica'}
                            onClick={() => {
                              if (isEditing && (transaction as any)?.modalidade && (transaction as any).modalidade !== 'unica') {
                                setIsRecurrenceWarningOpen(true);
                                return;
                              }
                              const val = parseInt(recurrenceInterval) || 1;
                              setRecurrenceInterval(String(val + 1));
                            }}
                            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 font-bold active:scale-90 transition-all text-sm select-none mr-12"
                          >
                            +
                          </button>
                          <span className="absolute right-3 text-[9px] font-bold text-slate-400 pointer-events-none uppercase">
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
            <div className="hidden lg:block w-[1px] bg-slate-900 self-stretch shrink-0" />

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
                  <div ref={accountRef} className={`relative ${isAccountDropdownOpen ? 'z-40' : 'z-10'}`}>
                    <button 
                      type="button"
                      onClick={() => setIsAccountDropdownOpen(!isAccountDropdownOpen)}
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

                    {isAccountDropdownOpen && !isMobile && (
                      <>
                        <div 
                          className="fixed inset-0 z-20" 
                          onClick={() => setIsAccountDropdownOpen(false)} 
                        />
                        <div 
                          className={`absolute z-30 ${openAccountUpward ? 'bottom-full mb-1' : 'top-full mt-1'} w-full bg-white rounded-xl shadow-xl border border-slate-100 overflow-y-auto`}
                          style={{ maxHeight: `${accountMaxHeight}px` }}
                        >
                          {accounts.filter(a => a.id !== destinationAccountId).map(a => (
                            <button
                              key={a.id}
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
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
                              onClick={(e) => {
                                e.preventDefault();
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
                      </>
                    )}
                  </div>
                </div>

                {/* Destination Account Select (Transfer only) */}
                {type === 'transfer' && (
                  <div className="space-y-2 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="h-5 flex items-center px-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">Conta de Destino</label>
                    </div>
                    <div ref={destAccountRef} className={`relative ${isDestAccountDropdownOpen ? 'z-40' : 'z-10'}`}>
                      <button 
                        type="button"
                        onClick={() => setIsDestAccountDropdownOpen(!isDestAccountDropdownOpen)}
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

                      {isDestAccountDropdownOpen && !isMobile && (
                        <>
                          <div 
                            className="fixed inset-0 z-20" 
                            onClick={() => setIsDestAccountDropdownOpen(false)} 
                          />
                          <div 
                            className={`absolute z-30 ${openDestAccountUpward ? 'bottom-full mb-1' : 'top-full mt-1'} w-full bg-white rounded-xl shadow-xl border border-slate-100 overflow-y-auto`}
                            style={{ maxHeight: `${destAccountMaxHeight}px` }}
                          >
                            {accounts.filter(a => a.id !== accountId).map(a => (
                              <button
                                key={a.id}
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
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
                                onClick={(e) => {
                                  e.preventDefault();
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
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Category Select (Always visible, spans 2 columns if transfer) */}
                <div className={`space-y-2 ${type === 'transfer' ? 'md:col-span-2' : ''}`}>
                  <div className="h-5 flex items-center px-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Categoria</label>
                  </div>
                  <div ref={categoryRef} className={`relative ${isCategoryDropdownOpen ? 'z-40' : 'z-10'}`}>
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

                    {isCategoryDropdownOpen && !isMobile && (
                      <>
                        {/* Backdrop transparente para fechar ao clicar fora sem atrapalhar o foco do input */}
                        <div 
                          className="fixed inset-0 z-20" 
                          onClick={() => { setIsCategoryDropdownOpen(false); setCategorySearch(''); }} 
                        />
                        <div 
                          className={`absolute z-30 ${openCategoryUpward ? 'bottom-full mb-1' : 'top-full mt-1'} w-full bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden flex flex-col`}
                          style={{ maxHeight: `${categoryMaxHeight}px` }}
                        >
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
                                      onMouseDown={(e) => { 
                                        e.preventDefault();
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
                                        onMouseDown={(e) => { 
                                          e.preventDefault();
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
                                onMouseDown={(e) => {
                                  e.preventDefault();
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
                  <div ref={tagRef} className={`relative ${isTagDropdownOpen ? 'z-40' : 'z-10'}`}>
                    {isMobile ? (
                      <button
                        type="button"
                        onClick={() => setIsTagDropdownOpen(true)}
                        className="w-full px-4 py-2.5 bg-slate-50 rounded-2xl border-none text-left focus:ring-2 focus:ring-teal-500/20 text-xs pr-8 text-slate-400 flex items-center justify-between"
                      >
                        <span>Adicionar tags...</span>
                        <TagIcon size={12} className="text-slate-400" />
                      </button>
                    ) : (
                      <>
                        <input
                          type="text"
                          value={tagSearch}
                          onChange={e => { setTagSearch(e.target.value); setIsTagDropdownOpen(true); }}
                          onFocus={() => setIsTagDropdownOpen(true)}
                          placeholder="Adicionar tags..."
                          className="w-full px-4 py-2.5 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-teal-500/20 text-xs pr-8"
                        />
                        <TagIcon size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </>
                    )}
                    {/* Dropdown */}
                    {isTagDropdownOpen && !isMobile && (
                      <>
                        <div 
                          className="fixed inset-0 z-20" 
                          onClick={() => { setIsTagDropdownOpen(false); setTagSearch(''); }} 
                        />
                        <div 
                          className={`absolute z-30 ${openTagUpward ? 'bottom-full mb-1' : 'top-full mt-1'} w-full bg-white rounded-xl shadow-xl border border-slate-100 overflow-y-auto`}
                          style={{ maxHeight: `${tagMaxHeight}px` }}
                        >
                          {tags
                            .filter(t => !selectedTags.includes(t.id))
                            .filter(t => !tagSearch.trim() || t.name.toLowerCase().includes(tagSearch.toLowerCase()))
                            .map(tag => (
                              <button
                                key={tag.id}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
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
                              onMouseDown={async (e) => {
                                e.preventDefault();
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
                      </>
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
              {!isConfirming && !isCreditCard && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                  {/* Lançamento Pago/Recebido Toggle */}
                  {(date <= format(new Date(), 'yyyy-MM-dd')) && (
                    <div className="p-3 bg-slate-50 rounded-2xl flex items-center gap-2.5 border border-slate-100/50">
                      <button 
                        type="button"
                        onClick={() => setStatus(status === 'paid' ? 'pending' : 'paid')}
                        className={`p-0.5 rounded-md transition-all shrink-0 ${status === 'paid' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/10' : 'bg-white text-slate-300 border border-slate-200'}`}
                      >
                        {status === 'paid' ? <CheckSquare size={16} /> : <Square size={16} />}
                      </button>
                      <div className="min-w-0 flex-1 flex items-center gap-2">
                        <h3 className="text-xs font-bold text-slate-900 truncate">
                          {type === 'income' ? 'Recebido' : type === 'transfer' ? 'Efetuado' : 'Pago'}
                        </h3>
                        <div className="flex items-center justify-center w-4 h-4 rounded-full bg-slate-200 text-slate-500 cursor-help" title="Marca a transação como liquidada no extrato e atualiza o saldo da conta imediatamente.">
                          <span className="text-[10px] font-black">?</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Auto Confirm Toggle */}
                  {(date >= format(new Date(), 'yyyy-MM-dd')) && (
                    <div className="p-3 bg-slate-50 rounded-2xl flex items-center gap-2.5 border border-slate-100/50">
                      <button 
                        type="button"
                        onClick={() => setAutoConfirm(!autoConfirm)}
                        className={`p-0.5 rounded-md transition-all shrink-0 ${autoConfirm ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10' : 'bg-white text-slate-300 border border-slate-200'}`}
                      >
                        {autoConfirm ? <CheckSquare size={16} /> : <Square size={16} />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5">
                          Auto-confirmar
                          <div className="flex items-center justify-center w-4 h-4 rounded-full bg-slate-200 text-slate-500 cursor-help" title="Na data de vencimento, o sistema marcará esta transação como paga automaticamente durante a madrugada.">
                            <span className="text-[10px] font-black">?</span>
                          </div>
                        </h3>
                        <p className="text-[9px] text-slate-400 uppercase tracking-wider font-extrabold truncate">
                          No dia do vencimento
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
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

      {/* ====================================================================== */}
      {/* OVERLAYS FULL-SCREEN MOBILE */}
      {/* ====================================================================== */}
      
      {/* 1. Categoria (Mobile Full Screen) */}
      {isMobile && isCategoryDropdownOpen && (
        <div className="fixed inset-0 z-[60] bg-slate-50 flex flex-col animate-in slide-in-from-bottom duration-300">
          <header className="px-4 py-4 bg-white border-b border-slate-100 flex items-center justify-between sticky top-0 z-10">
            <div className="flex items-center gap-3">
              <button 
                type="button"
                onClick={() => { setIsCategoryDropdownOpen(false); setCategorySearch(''); }}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <ArrowRight size={20} className="text-slate-500 rotate-180" />
              </button>
              <span className="text-base font-bold text-slate-900 font-manrope">Pesquisar categoria</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsCategoryDropdownOpen(false);
                setCategorySearch('');
                setIsQuickAddCategoryOpen(true);
              }}
              className="p-2 bg-teal-50 text-teal-600 rounded-full hover:bg-teal-100 transition-colors"
            >
              <Plus size={20} />
            </button>
          </header>

          <div className="p-4 bg-white border-b border-slate-100">
            <div className="relative flex items-center bg-slate-50 rounded-2xl px-4 py-3 border border-slate-100">
              <Search size={18} className="text-slate-400 shrink-0 mr-3" />
              <input
                type="text"
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                placeholder="Digite o nome da categoria..."
                autoFocus
                className="w-full bg-transparent border-none focus:ring-0 text-sm py-0 placeholder:text-slate-400 text-slate-700 focus:outline-none"
              />
              {categorySearch && (
                <button
                  type="button"
                  onClick={() => setCategorySearch('')}
                  className="p-1 rounded-full hover:bg-slate-200 text-slate-400 transition-colors shrink-0"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {filteredCategories.parentCategories.length === 0 ? (
              <div className="text-center py-12 text-sm text-slate-400">
                Nenhuma categoria encontrada para "{categorySearch}"
              </div>
            ) : (
              filteredCategories.parentCategories.map(parent => {
                const children = filteredCategories.getChildren(parent.id);
                return (
                  <div key={parent.id} className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm space-y-2">
                    <button
                      type="button"
                      onClick={() => { 
                        setCategoryId(parent.id); 
                        setIsCategoryDropdownOpen(false); 
                        setCategorySearch(''); 
                      }}
                      className="flex items-center gap-3 w-full text-left p-1 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-xl border border-slate-100/50">
                        {parent.icon || '📁'}
                      </div>
                      <span className="font-bold text-slate-800 text-sm">{parent.name}</span>
                    </button>
                    {children.length > 0 && (
                      <div className="pl-4 pr-1 py-1 border-l-2 border-slate-100 space-y-2">
                        {children.map(child => (
                          <button
                            key={child.id}
                            type="button"
                            onClick={() => { 
                              setCategoryId(child.id); 
                              setIsCategoryDropdownOpen(false); 
                              setCategorySearch(''); 
                            }}
                            className="flex items-center gap-3 w-full text-left py-2 px-3 rounded-xl hover:bg-slate-50 transition-colors border border-transparent active:bg-slate-50"
                          >
                            <span className="text-base shrink-0">{child.icon || '↘️'}</span>
                            <span className="text-xs font-semibold text-slate-600 truncate">{child.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 2. Conta de Origem (Mobile Full Screen) */}
      {isMobile && isAccountDropdownOpen && (
        <div className="fixed inset-0 z-[60] bg-slate-50 flex flex-col animate-in slide-in-from-bottom duration-300">
          <header className="px-4 py-4 bg-white border-b border-slate-100 flex items-center justify-between sticky top-0 z-10">
            <div className="flex items-center gap-3">
              <button 
                type="button"
                onClick={() => { setIsAccountDropdownOpen(false); setAccountSearch(''); }}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <ArrowRight size={20} className="text-slate-500 rotate-180" />
              </button>
              <span className="text-base font-bold text-slate-900 font-manrope">
                {type === 'transfer' ? 'Pesquisar conta de origem' : 'Pesquisar conta'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsAccountDropdownOpen(false);
                setAccountSearch('');
                setPendingAccountType('origin');
                setIsQuickAddAccountOpen(true);
              }}
              className="p-2 bg-teal-50 text-teal-600 rounded-full hover:bg-teal-100 transition-colors"
            >
              <Plus size={20} />
            </button>
          </header>

          <div className="p-4 bg-white border-b border-slate-100">
            <div className="relative flex items-center bg-slate-50 rounded-2xl px-4 py-3 border border-slate-100">
              <Search size={18} className="text-slate-400 shrink-0 mr-3" />
              <input
                type="text"
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
                placeholder="Digite o nome da conta..."
                autoFocus
                className="w-full bg-transparent border-none focus:ring-0 text-sm py-0 placeholder:text-slate-400 text-slate-700 focus:outline-none"
              />
              {accountSearch && (
                <button
                  type="button"
                  onClick={() => setAccountSearch('')}
                  className="p-1 rounded-full hover:bg-slate-200 text-slate-400 transition-colors shrink-0"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {accounts
              .filter(a => !accountSearch.trim() || a.name.toLowerCase().includes(accountSearch.toLowerCase()))
              .length === 0 ? (
                <div className="text-center py-12 text-sm text-slate-400">
                  Nenhuma conta encontrada para "{accountSearch}"
                </div>
              ) : (
                accounts
                  .filter(a => !accountSearch.trim() || a.name.toLowerCase().includes(accountSearch.toLowerCase()))
                  .map(a => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        setAccountId(a.id);
                        setIsAccountDropdownOpen(false);
                        setAccountSearch('');
                      }}
                      className="flex items-center gap-4 w-full text-left p-3.5 bg-white rounded-2xl border border-slate-100 shadow-sm active:bg-slate-50 transition-colors"
                    >
                      <AccountIcon account={a} />
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-slate-800 text-sm block leading-tight">{a.name}</span>
                        <span className="text-xs text-slate-400 block mt-0.5">{getAccountTypeLabel(a.type)}</span>
                      </div>
                    </button>
                  ))
              )}
          </div>
        </div>
      )}

      {/* 3. Conta de Destino (Mobile Full Screen) */}
      {isMobile && isDestAccountDropdownOpen && (
        <div className="fixed inset-0 z-[60] bg-slate-50 flex flex-col animate-in slide-in-from-bottom duration-300">
          <header className="px-4 py-4 bg-white border-b border-slate-100 flex items-center justify-between sticky top-0 z-10">
            <div className="flex items-center gap-3">
              <button 
                type="button"
                onClick={() => { setIsDestAccountDropdownOpen(false); setDestAccountSearch(''); }}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <ArrowRight size={20} className="text-slate-500 rotate-180" />
              </button>
              <span className="text-base font-bold text-slate-900 font-manrope">Pesquisar conta de destino</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsDestAccountDropdownOpen(false);
                setDestAccountSearch('');
                setPendingAccountType('destination');
                setIsQuickAddAccountOpen(true);
              }}
              className="p-2 bg-indigo-50 text-indigo-600 rounded-full hover:bg-indigo-100 transition-colors"
            >
              <Plus size={20} />
            </button>
          </header>

          <div className="p-4 bg-white border-b border-slate-100">
            <div className="relative flex items-center bg-slate-50 rounded-2xl px-4 py-3 border border-slate-100">
              <Search size={18} className="text-slate-400 shrink-0 mr-3" />
              <input
                type="text"
                value={destAccountSearch}
                onChange={(e) => setDestAccountSearch(e.target.value)}
                placeholder="Digite o nome da conta..."
                autoFocus
                className="w-full bg-transparent border-none focus:ring-0 text-sm py-0 placeholder:text-slate-400 text-slate-700 focus:outline-none"
              />
              {destAccountSearch && (
                <button
                  type="button"
                  onClick={() => setDestAccountSearch('')}
                  className="p-1 rounded-full hover:bg-slate-200 text-slate-400 transition-colors shrink-0"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {accounts
              .filter(a => a.id !== accountId)
              .filter(a => !destAccountSearch.trim() || a.name.toLowerCase().includes(destAccountSearch.toLowerCase()))
              .length === 0 ? (
                <div className="text-center py-12 text-sm text-slate-400">
                  Nenhuma conta de destino encontrada para "{destAccountSearch}"
                </div>
              ) : (
                accounts
                  .filter(a => a.id !== accountId)
                  .filter(a => !destAccountSearch.trim() || a.name.toLowerCase().includes(destAccountSearch.toLowerCase()))
                  .map(a => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        setDestinationAccountId(a.id);
                        setIsDestAccountDropdownOpen(false);
                        setDestAccountSearch('');
                      }}
                      className="flex items-center gap-4 w-full text-left p-3.5 bg-white rounded-2xl border border-slate-100 shadow-sm active:bg-slate-50 transition-colors"
                    >
                      <AccountIcon account={a} />
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-slate-800 text-sm block leading-tight">{a.name}</span>
                        <span className="text-xs text-slate-400 block mt-0.5">{getAccountTypeLabel(a.type)}</span>
                      </div>
                    </button>
                  ))
              )}
          </div>
        </div>
      )}

      {/* 4. Tags (Mobile Full Screen) */}
      {isMobile && isTagDropdownOpen && (
        <div className="fixed inset-0 z-[60] bg-slate-50 flex flex-col animate-in slide-in-from-bottom duration-300">
          <header className="px-4 py-4 bg-white border-b border-slate-100 flex items-center justify-between sticky top-0 z-10">
            <div className="flex items-center gap-3">
              <button 
                type="button"
                onClick={() => { setIsTagDropdownOpen(false); setTagSearch(''); }}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <ArrowRight size={20} className="text-slate-500 rotate-180" />
              </button>
              <span className="text-base font-bold text-slate-900 font-manrope">Pesquisar tags</span>
            </div>
            <span className="text-xs text-slate-400 font-semibold">{selectedTags.length} selecionadas</span>
          </header>

          <div className="p-4 bg-white border-b border-slate-100 space-y-3">
            <div className="relative flex items-center bg-slate-50 rounded-2xl px-4 py-3 border border-slate-100">
              <Search size={18} className="text-slate-400 shrink-0 mr-3" />
              <input
                type="text"
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
                placeholder="Digite para buscar ou criar tag..."
                autoFocus
                className="w-full bg-transparent border-none focus:ring-0 text-sm py-0 placeholder:text-slate-400 text-slate-700 focus:outline-none"
              />
              {tagSearch && (
                <button
                  type="button"
                  onClick={() => setTagSearch('')}
                  className="p-1 rounded-full hover:bg-slate-200 text-slate-400 transition-colors shrink-0"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {selectedTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {selectedTags.map(tagId => {
                  const tag = tags.find(t => t.id === tagId);
                  if (!tag) return null;
                  return (
                    <span key={tag.id} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-900 text-white shadow-sm shrink-0">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color || '#64748b' }} />
                      {tag.name}
                      <button
                        type="button"
                        onClick={() => setSelectedTags(prev => prev.filter(id => id !== tagId))}
                        className="ml-1 hover:bg-white/20 rounded-full p-0.5 transition-colors"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
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
                  toast.success(`Tag "${data.name}" criada!`);
                }}
                className="flex items-center gap-3 w-full text-left p-3.5 bg-teal-50 border border-teal-100 rounded-2xl hover:bg-teal-100/70 transition-colors text-teal-600 font-bold"
              >
                <Plus size={18} />
                <span className="text-sm">Criar nova tag "{tagSearch.trim()}"</span>
              </button>
            )}

            {tags
              .filter(t => !tagSearch.trim() || t.name.toLowerCase().includes(tagSearch.toLowerCase()))
              .length === 0 && !tagSearch.trim() ? (
                <div className="text-center py-12 text-sm text-slate-400">
                  Nenhuma tag cadastrada.
                </div>
              ) : (
                tags
                  .filter(t => !tagSearch.trim() || t.name.toLowerCase().includes(tagSearch.toLowerCase()))
                  .map(tag => {
                    const isSelected = selectedTags.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setSelectedTags(prev => prev.filter(id => id !== tag.id));
                          } else {
                            setSelectedTags(prev => [...prev, tag.id]);
                          }
                        }}
                        className={`flex items-center justify-between w-full text-left p-3.5 bg-white rounded-2xl border transition-all ${
                          isSelected 
                            ? 'border-teal-500 bg-teal-50/20 shadow-sm' 
                            : 'border-slate-100 shadow-sm active:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-3.5">
                          <div className="w-3.5 h-3.5 rounded-full shrink-0 border" style={{ backgroundColor: tag.color || '#64748b', borderColor: isSelected ? 'transparent' : '#e2e8f0' }} />
                          <span className="font-bold text-slate-800 text-sm">{tag.name}</span>
                        </div>
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-teal-600 flex items-center justify-center text-white text-[10px]">
                            ✓
                          </div>
                        )}
                      </button>
                    );
                  })
              )}
          </div>

          <footer className="p-4 bg-white border-t border-slate-100 flex gap-3 sticky bottom-0 z-10">
            <button
              type="button"
              onClick={() => { setIsTagDropdownOpen(false); setTagSearch(''); }}
              className="w-full py-3.5 rounded-2xl bg-slate-900 text-white font-bold text-xs uppercase tracking-widest text-center shadow-lg shadow-slate-900/10 active:scale-[0.98] transition-transform"
            >
              Concluir
            </button>
          </footer>
        </div>
      )}

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

      {isRecurrenceWarningOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity animate-in fade-in duration-200"
            onClick={() => setIsRecurrenceWarningOpen(false)}
          />
          
          <div className="relative w-full max-w-md bg-white rounded-[2rem] shadow-2xl p-6 md:p-8 border border-slate-100/80 overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col items-center text-center">
            {/* Ícone moderno de Alerta com cor Laranja (harmônica, sem usar roxo) */}
            <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-500 mb-5">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            
            <h3 className="text-lg font-extrabold text-slate-900 font-manrope mb-3 leading-tight">
              Alteração de Recorrência Não Permitida
            </h3>
            
            <p className="text-sm text-slate-500 font-medium leading-relaxed mb-6 px-1">
              Por questões de segurança e integridade dos seus saldos futuros, não é possível alterar a modalidade, periodicidade, intervalo ou data de vencimento base de uma série recorrente já ativa. Para modificar estas informações, exclua a série atual e crie um novo lançamento com a frequência correta.
            </p>
            
            <button
              type="button"
              onClick={() => setIsRecurrenceWarningOpen(false)}
              className="w-full py-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs uppercase tracking-widest text-center shadow-lg shadow-slate-900/10 active:scale-[0.98] transition-all"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinancialTransactionModalV2;
