import { useState, useEffect, useRef } from 'react';
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

const BRAZILIAN_BANKS = [
  { name: 'Banco Inter', domain: 'inter.co', color: '#ff7a00' },
  { name: 'Nubank', domain: 'nubank.com.br', color: '#8a05be' },
  { name: 'Itaú', domain: 'itau.com.br', color: '#ec7000' },
  { name: 'Bradesco', domain: 'bradesco.com.br', color: '#cc092f' },
  { name: 'Santander', domain: 'santander.com.br', color: '#ec0000' },
  { name: 'Banco do Brasil', domain: 'bb.com.br', color: '#fcf200' },
  { name: 'Caixa Econômica', domain: 'caixa.gov.br', color: '#105291' },
  { name: 'XP Investimentos', domain: 'xpi.com.br', color: '#000000' },
  { name: 'BTG Pactual', domain: 'btgpactual.com', color: '#000000' },
  { name: 'C6 Bank', domain: 'c6.com.br', color: '#252525' },
  { name: 'PagBank', domain: 'pagseguro.uol.com.br', color: '#53d21e' },
  { name: 'Neon', domain: 'neon.com.br', color: '#00e5ff' },
  { name: 'Banco Pan', domain: 'bancopan.com.br', color: '#00aff0' },
  { name: 'Digio', domain: 'digio.com.br', color: '#001e32' },
  { name: 'Mercado Pago', domain: 'mercadopago.com.br', color: '#009ee3' },
  { name: 'Avenue', domain: 'avenue.us', color: '#000000' },
  { name: 'Nomad', domain: 'nomadglobal.com', color: '#000000' },
];

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

  // Agrupar categorias: pais e seus filhos
  const parentCategories = categories.filter(c => !c.parent_id);
  const getChildren = (parentId: string) => categories.filter(c => c.parent_id === parentId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
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
        category_id: categoryId || undefined,
        account_id: accountId || undefined,
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

      if (isConfirming) {
        payload.status = 'paid';
      }

      if (isEditing) {
        // Se estiver confirmando, o escopo é SEMPRE 'this' e não abre o modal de escopo
        if (!isConfirming && modalidade !== 'unica' && !isScopeModalOpen) {
          setTempFormData(payload);
          setScopeType('edit');
          setIsScopeModalOpen(true);
          setLoading(false);
          return;
        }

        const scope = isConfirming ? 'this' : (tempFormData?.scope || 'this');
        
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
      
      <div className="relative w-full max-w-2xl bg-white/90 backdrop-blur-2xl rounded-[2rem] shadow-2xl overflow-hidden border border-white/20 animate-in fade-in zoom-in duration-300 max-h-[90vh] flex flex-col">
        <header className="px-6 py-4 flex justify-between items-center border-b border-slate-100 bg-white/50 shrink-0">
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
          <form onSubmit={handleSubmit} className="p-6 md:p-10 space-y-8">
            {/* Toggle Type */}
            <div className="flex justify-center">
              <div className="bg-slate-100 p-1 rounded-2xl flex items-center w-full max-w-xs shadow-inner">
                <button 
                  type="button"
                  onClick={() => setType('income')}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${type === 'income' ? 'bg-teal-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-900'}`}
                >
                  Receita
                </button>
                <button 
                  type="button"
                  onClick={() => setType('expense')}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${type === 'expense' ? 'bg-rose-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-900'}`}
                >
                  Despesa
                </button>
                <button 
                  type="button"
                  onClick={() => setType('transfer')}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${type === 'transfer' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-900'}`}
                >
                  Transferência
                </button>
              </div>
            </div>

            {/* Amount Input */}
            <div className="text-center space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Valor do Lançamento</label>
              <div className="flex items-baseline justify-center gap-2">
                <span className={`text-2xl font-bold opacity-60 ${type === 'income' ? 'text-teal-600' : type === 'expense' ? 'text-rose-600' : 'text-indigo-600'}`}>R$</span>
                <input 
                  ref={amountInputRef}
                  type="text"
                  inputMode="numeric"
                  value={amount}
                  onChange={handleAmountChange}
                  placeholder="0,00"
                  className="bg-transparent border-none focus:ring-0 text-5xl md:text-6xl font-extrabold text-slate-900 text-center w-full max-w-md placeholder-slate-200"
                />
              </div>
            </div>

            {/* Modalidade de Lançamento */}
            <div className="p-6 bg-slate-50/50 rounded-3xl border border-slate-100 space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="flex items-center justify-between">
                <div className="w-full text-center">
                  <h3 className="text-sm font-bold text-slate-900">Modalidade do Lançamento</h3>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Única, Parcelada ou Recorrente</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {(['unica', 'parcelada', 'recorrente'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModalidade(m)}
                    className={`py-3 rounded-xl text-xs font-bold transition-all border ${
                      modalidade === m 
                        ? 'bg-slate-900 text-white border-slate-900 shadow-md scale-105' 
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {m === 'unica' ? 'Única' : m === 'parcelada' ? 'Parcelada' : 'Recorrente'}
                  </button>
                ))}
              </div>

              {modalidade === 'parcelada' && (
                <div className="pt-4 border-t border-slate-200/60 animate-in slide-in-from-top-2 duration-300 space-y-6">
                  {/* Periodicidade */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 text-center block w-full">Periodicidade</label>
                    <div className="grid grid-cols-4 gap-2">
                      {(['diaria', 'semanal', 'mensal', 'anual'] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPeriodicidade(p)}
                          className={`py-2 rounded-lg text-[10px] font-bold transition-all border ${
                            periodicidade === p 
                              ? 'bg-teal-600 text-white border-teal-600 shadow-sm' 
                              : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {p.charAt(0).toUpperCase() + p.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5 flex flex-col items-center">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Total de Parcelas</label>
                      <input 
                        type="number"
                        min="2"
                        value={installmentTotal}
                        onChange={(e) => setInstallmentTotal(e.target.value)}
                        placeholder="Ex: 12"
                        className="w-full px-4 py-3 bg-white rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-teal-500/20 text-center shadow-sm"
                      />
                    </div>
                    <div className="space-y-1.5 flex flex-col items-center">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Parcela Inicial</label>
                      <input 
                        type="number"
                        min="1"
                        max={parseInt(installmentTotal) || 1}
                        value={startInstallment}
                        onChange={(e) => setStartInstallment(parseInt(e.target.value) || 1)}
                        className="w-full px-4 py-3 bg-white rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-teal-500/20 text-center shadow-sm"
                      />
                    </div>
                  </div>

                  {/* Toggle Valor Total vs Unitário */}
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex items-center justify-center gap-4 bg-white/50 p-3 rounded-2xl border border-slate-100 w-full">
                      <span className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${!isTotalValue ? 'text-teal-600' : 'text-slate-400'}`}>Valor Unitário</span>
                      <button
                        type="button"
                        onClick={() => setIsTotalValue(!isTotalValue)}
                        className={`relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none ${isTotalValue ? 'bg-teal-600' : 'bg-slate-300'}`}
                      >
                        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${isTotalValue ? 'translate-x-6' : 'translate-x-0'}`} />
                      </button>
                      <span className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${isTotalValue ? 'text-teal-600' : 'text-slate-400'}`}>Valor Total</span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium bg-slate-50 px-4 py-2 rounded-lg border border-slate-100 w-full text-center">
                      As parcelas serão no valor de <span className="font-bold text-slate-700">{(() => {
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
                <div className="pt-4 border-t border-slate-200/60 animate-in slide-in-from-top-2 duration-300 space-y-6">
                  {/* Periodicidade */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 text-center block w-full">Periodicidade</label>
                    <div className="grid grid-cols-4 gap-2">
                      {(['diaria', 'semanal', 'mensal', 'anual'] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPeriodicidade(p)}
                          className={`py-2 rounded-lg text-[10px] font-bold transition-all border ${
                            periodicidade === p 
                              ? 'bg-teal-600 text-white border-teal-600 shadow-sm' 
                              : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {p.charAt(0).toUpperCase() + p.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Intervalo */}
                  <div className="space-y-1.5 flex flex-col items-center">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">
                      Repete-se a cada X {periodicidade === 'diaria' ? 'Dias' : periodicidade === 'semanal' ? 'Semanas' : periodicidade === 'anual' ? 'Anos' : 'Meses'}
                    </label>
                    <input 
                      type="number"
                      min="1"
                      value={recurrenceInterval}
                      onChange={(e) => setRecurrenceInterval(parseInt(e.target.value) || 1)}
                      className="w-full max-w-[200px] px-4 py-3 bg-white rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-teal-500/20 text-center shadow-sm"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Date Input */}
              <div className="space-y-2">
                <div className="h-5 flex items-center px-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Data Efetiva</label>
                </div>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-teal-500 transition-colors">
                    <CalendarIcon size={18} />
                  </div>
                  <input 
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-teal-500/20 text-sm"
                  />
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <div className="h-5 flex items-center px-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Descrição</label>
                </div>
                <input 
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-teal-500/20 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                    className="w-full px-4 py-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-teal-500/20 text-sm text-left flex items-center justify-between"
                  >
                    {accountId ? (
                      <div className="flex items-center gap-3">
                        <AccountIcon account={accounts.find(a => a.id === accountId)} />
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-700 leading-tight">{accounts.find(a => a.id === accountId)?.name}</span>
                          <span className="text-[10px] text-slate-400">{getAccountTypeLabel(accounts.find(a => a.id === accountId)?.type || '')}</span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-400">Selecione a conta</span>
                    )}
                    <ChevronDown size={16} className="text-slate-400" />
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
                      className="w-full px-4 py-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 focus:ring-2 focus:ring-indigo-500/20 text-sm text-left flex items-center justify-between"
                    >
                      {destinationAccountId ? (
                        <div className="flex items-center gap-3">
                          <AccountIcon account={accounts.find(a => a.id === destinationAccountId)} />
                          <div className="flex flex-col">
                            <span className="font-medium text-slate-700 leading-tight">{accounts.find(a => a.id === destinationAccountId)?.name}</span>
                            <span className="text-[10px] text-slate-400">{getAccountTypeLabel(accounts.find(a => a.id === destinationAccountId)?.type || '')}</span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">Selecione o destino</span>
                      )}
                      <ChevronDown size={16} className="text-indigo-400" />
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
                      onClick={() => setIsCategoryDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setIsCategoryDropdownOpen(false), 200)}
                      className="w-full px-4 py-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-teal-500/20 text-sm text-left flex items-center justify-between"
                    >
                      {categoryId ? (
                        <div className="flex items-center gap-3">
                          <span className="text-lg">{categories.find(c => c.id === categoryId)?.icon || '📁'}</span>
                          <span className="font-medium text-slate-700 leading-tight">{categories.find(c => c.id === categoryId)?.name}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">Selecione uma categoria</span>
                      )}
                      <ChevronDown size={16} className="text-slate-400" />
                    </button>

                    {isCategoryDropdownOpen && (
                      <div className="absolute z-30 mt-1 w-full bg-white rounded-xl shadow-xl border border-slate-100 max-h-60 overflow-y-auto">
                        {parentCategories.map(parent => {
                          const children = getChildren(parent.id);
                          return (
                            <div key={parent.id} className="border-b border-slate-50 last:border-0 last:mb-0 mb-1 pb-1">
                              <button
                                type="button"
                                onClick={() => { setCategoryId(parent.id); setIsCategoryDropdownOpen(false); }}
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
                                  onClick={() => { setCategoryId(child.id); setIsCategoryDropdownOpen(false); }}
                                  className="flex items-center gap-3 w-full pl-10 pr-4 py-2.5 text-left hover:bg-slate-50 transition-colors border-t border-slate-50/50"
                                >
                                  <span className="text-lg opacity-80">{child.icon || '↘️'}</span>
                                  <span className="text-sm font-medium text-slate-600">{child.name}</span>
                                </button>
                              ))}
                            </div>
                          );
                        })}
                        <div className="border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() => {
                              setIsCategoryDropdownOpen(false);
                              setIsQuickAddCategoryOpen(true);
                            }}
                            className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors text-teal-600 font-bold"
                          >
                            <Plus size={18} />
                            <span className="text-sm">Adicionar categoria</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Conditional Credit Card Details */}
            {isCreditCard && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="space-y-2">
                  <div className="h-5 flex items-center px-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Lançar na fatura de</label>
                  </div>
                  <input 
                    type="month"
                    value={invoiceMonth}
                    onChange={(e) => setInvoiceMonth(e.target.value)}
                    className="w-full px-4 py-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-teal-500/20 text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <div className="h-5 flex items-center px-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Cartão / Titular</label>
                  </div>
                  <div className="relative group">
                    <select 
                      value={cardHolderName}
                      onChange={(e) => setCardHolderName(e.target.value)}
                      className="w-full px-4 py-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-teal-500/20 text-sm !appearance-none bg-none cursor-pointer"
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
                      <ChevronDown size={16} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                    <Search size={18} />
                  </div>
                  <select 
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    className="w-full pl-12 pr-10 py-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-teal-500/20 text-sm !appearance-none bg-none cursor-pointer [&::-ms-expand]:hidden"
                    style={{ appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none' }}
                  >
                    <option value="">Nenhum cliente selecionado</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                    <ChevronDown size={16} />
                  </div>
                </div>
              </div>

              {/* Tags - Combobox */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 px-1">Tags</label>
                {/* Chips das tags selecionadas */}
                {selectedTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 px-1">
                    {selectedTags.map(tagId => {
                      const tag = tags.find(t => t.id === tagId);
                      if (!tag) return null;
                      return (
                        <span key={tag.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-900 text-white border border-slate-900">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color || '#64748b' }} />
                          {tag.name}
                          <button
                            type="button"
                            onClick={() => setSelectedTags(prev => prev.filter(id => id !== tagId))}
                            className="ml-0.5 hover:bg-white/20 rounded-full p-0.5 transition-colors"
                          >
                            <X size={10} />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
                {/* Campo de busca/criação */}
                <div className="relative">
                  <input
                    type="text"
                    value={tagSearch}
                    onChange={e => { setTagSearch(e.target.value); setIsTagDropdownOpen(true); }}
                    onFocus={() => setIsTagDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setIsTagDropdownOpen(false), 200)}
                    placeholder="Buscar ou criar tag..."
                    className="w-full px-4 py-3 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-teal-500/20 text-sm pr-10"
                  />
                  <TagIcon size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
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
                            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-left hover:bg-slate-50 transition-colors text-sm"
                          >
                            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tag.color || '#64748b' }} />
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
                          className="flex items-center gap-2.5 w-full px-4 py-2.5 text-left hover:bg-teal-50 transition-colors text-sm border-t border-slate-100"
                        >
                          <Plus size={14} className="text-teal-600" />
                          <span className="font-bold text-teal-600">Criar "{tagSearch.trim()}"</span>
                        </button>
                      )}
                      {tags.filter(t => !selectedTags.includes(t.id)).filter(t => !tagSearch.trim() || t.name.toLowerCase().includes(tagSearch.toLowerCase())).length === 0 && !tagSearch.trim() && (
                        <div className="px-4 py-3 text-xs text-slate-400 italic">Nenhuma tag disponível. Digite para criar.</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Auto Confirm Toggle */}
            <div className="p-6 bg-slate-50 rounded-3xl space-y-2">
              <div className="flex items-center gap-3">
                <button 
                  type="button"
                  onClick={() => setAutoConfirm(!autoConfirm)}
                  className={`p-1 rounded-lg transition-all ${autoConfirm ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-white text-slate-300 border border-slate-200'}`}
                >
                  {autoConfirm ? <CheckSquare size={20} /> : <Square size={20} />}
                </button>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Confirmação Automática</h3>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Confirmar ao atingir a data</p>
                </div>
              </div>
            </div>
          </form>
        </div>

        <footer className="p-6 bg-slate-50/80 backdrop-blur-md border-t border-slate-100 flex flex-col md:flex-row gap-4 items-center justify-between shrink-0">
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
          setTempFormData({ ...tempFormData, scope });
          // Re-disparar o submit com o escopo definido
          setTimeout(() => {
            const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
            handleSubmit(fakeEvent);
          }, 0);
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
