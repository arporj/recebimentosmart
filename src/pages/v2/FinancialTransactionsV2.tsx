import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, X,
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
  CreditCard,
  User,
  Wallet,
  Share2,
  Loader2,
  XCircle
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { format, startOfMonth, endOfMonth, addMonths, subMonths, isAfter, isBefore, isSameMonth, parseISO, addDays, addWeeks, addYears, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'react-hot-toast';
import FinancialTransactionModalV2 from '../../components/v2/FinancialTransactionModalV2';
import QuickEditTransactionModal from '../../components/v2/QuickEditTransactionModal';
import { ModalOpcaoRecorrente } from '../../components/financeiro/ModalOpcaoRecorrente';
import { deletarTransacao } from '../../lib/financeiro/deletarTransacao';
import { TransactionSummaryModal } from '../../components/v2/TransactionSummaryModal';
import { ShareTransactionsModalV2 } from '../../components/v2/ShareTransactionsModalV2';

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
  originalInstanceDate?: string;
  isVirtual: boolean;
  isInvoiceSummary?: boolean;
  invoiceData?: {
    cardId: string;
    cardName: string;
    linkedAccountName: string | null;
    invoicePaymentAccountId: string | null;
    total: number;
  };
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
  const [modalType, setModalType] = useState<'income' | 'expense' | 'transfer'>('expense');
  const [editingTransaction, setEditingTransaction] = useState<FinancialTransaction | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [dropdownDirection, setDropdownDirection] = useState<'up' | 'down'>('down');

  const handleDropdownClick = (e: React.MouseEvent<HTMLButtonElement>, dropdownKey: string) => {
    e.stopPropagation();
    if (openDropdown === dropdownKey) {
      setOpenDropdown(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < 180) {
      setDropdownDirection('up');
    } else {
      setDropdownDirection('down');
    }
    setOpenDropdown(dropdownKey);
  };
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const touchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);
  const navigate = useNavigate();

  const [layoutPreference, setLayoutPreference] = useState<'default' | 'value_first' | 'value_right_desc'>('default');
  const [showCurrencySymbol, setShowCurrencySymbol] = useState(true);
  const [showNegativeSign, setShowNegativeSign] = useState(true);
  const [valueAlignment, setValueAlignment] = useState<'left' | 'right'>('right');

  const formatTransactionAmount = (amount: number, type: 'income' | 'expense' | 'transfer') => {
    let result = '';
    if (type === 'expense' && showNegativeSign) {
      result += '-';
    }
    if (showCurrencySymbol) {
      result += 'R$ ';
    }
    result += amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return result;
  };

  // Estados para exclusão em cadeia
  const [isDeleteScopeModalOpen, setIsDeleteScopeModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<FinancialTransaction | null>(null);

  // Estados para o modal de resumo
  const [selectedSummaryTransaction, setSelectedSummaryTransaction] = useState<any | null>(null);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);

  // Estado para o modal de compartilhamento
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  // Estado para o modal de edição rápida
  const [isQuickEditOpen, setIsQuickEditOpen] = useState(false);
  const [quickEditTransaction, setQuickEditTransaction] = useState<TransactionInstance | null>(null);
  const [quickEditIsConfirming, setQuickEditIsConfirming] = useState(false);

  // Estado para confirmação de exclusão de lançamentos únicos
  const [deleteConfirmModalConfig, setDeleteConfirmModalConfig] = useState<{
    isOpen: boolean;
    transaction: TransactionInstance | null;
  }>({
    isOpen: false,
    transaction: null,
  });

  // Estados para seleção e confirmação em lote
  const [selectedTransactionKeys, setSelectedTransactionKeys] = useState<Set<string>>(new Set());
  const [isBulkConfirmOpen, setIsBulkConfirmOpen] = useState(false);
  const [bulkConfirmDateMode, setBulkConfirmDateMode] = useState<'original' | 'specific'>('original');
  const [bulkConfirmSpecificDate, setBulkConfirmSpecificDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [bulkConfirmLoading, setBulkConfirmLoading] = useState(false);
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);

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
        .in('type', ['checking', 'investment', 'savings'])
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      const fetchedAccounts = data || [];
      setAccounts(fetchedAccounts);

      const saved = localStorage.getItem(`recebimento_smart_selected_accounts_${user.id}`);
      let usedSaved = false;
      if (saved) {
        try {
          const ids = JSON.parse(saved);
          // Garante que os IDs salvos pertencem ao usuário atual (essencial para o Impersonate)
          const validAccountIds = new Set(fetchedAccounts.map(a => a.id));
          const validSavedIds = ids.filter((id: string) => validAccountIds.has(id));
          
          if (validSavedIds.length > 0) {
            setSelectedAccountIds(new Set(validSavedIds));
            usedSaved = true;
          }
        } catch (e) {
          console.error('Erro ao carregar contas salvas:', e);
        }
      } 
      
      if (!usedSaved && fetchedAccounts.length > 0) {
        setSelectedAccountIds(new Set(fetchedAccounts.map(a => a.id)));
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
        .select('id, name, type, due_day, invoice_payment_account_id')
        .eq('type', 'credit_card')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;

      // Resolve linked account names
      const linkedIds = (data || []).map(c => c.invoice_payment_account_id).filter(Boolean);
      let linkedMap = new Map<string, string>();
      if (linkedIds.length > 0) {
        const { data: linkedAccounts } = await supabase
          .from('financial_accounts')
          .select('id, name')
          .in('id', linkedIds);
        linkedMap = new Map((linkedAccounts || []).map(a => [a.id, a.name]));
      }

      setCreditCardAccounts((data || []).map(c => ({
        ...c,
        linkedAccountName: c.invoice_payment_account_id ? linkedMap.get(c.invoice_payment_account_id) || null : null,
      })));
    } catch (err) {
      console.error('Erro ao buscar cartões:', err);
    }
  };

  useEffect(() => {
    setSelectedAccountIds(new Set());
    setAccounts([]);
    setTransactions([]);
    setCreditCardAccounts([]);
    fetchTransactions();
    fetchAccounts();
    fetchCreditCardAccounts();
    
    // Recuperar preferência de layout do usuário
    const savedPref = localStorage.getItem('transaction_layout_preference') as 'default' | 'value_first' | 'value_right_desc';
    if (savedPref) {
      setLayoutPreference(savedPref);
    } else {
      setLayoutPreference('default');
    }

    const savedShowCurrency = localStorage.getItem('transaction_show_currency_symbol');
    const savedShowNegative = localStorage.getItem('transaction_show_negative_sign');
    const savedValAlign = localStorage.getItem('transaction_value_alignment') as 'left' | 'right';
    
    setShowCurrencySymbol(savedShowCurrency !== 'false');
    setShowNegativeSign(savedShowNegative !== 'false');
    setValueAlignment(savedValAlign || 'right');
  }, [user]);

  useEffect(() => {
    if (user && (selectedAccountIds.size > 0 || accounts.length > 0)) {
      localStorage.setItem(`recebimento_smart_selected_accounts_${user.id}`, JSON.stringify(Array.from(selectedAccountIds)));
    }
  }, [selectedAccountIds, accounts.length, user]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const allInstancesUpToMonth = useMemo((): TransactionInstance[] => {
    const instances: TransactionInstance[] = [];

    // 1. Identificar registros físicos daquela cadeia para evitar sobreposição
    const physicalDatesByParent = new Map<string, Set<string>>();
    const physicalIndicesByParent = new Map<string, Set<number>>();
    for (const t of transactions) {
      const parentId = t.parent_id || t.id;
      if (!physicalDatesByParent.has(parentId)) {
        physicalDatesByParent.set(parentId, new Set());
      }
      physicalDatesByParent.get(parentId)!.add(t.date);

      // CRUCIAL: Adicionamos ao índice de parcelas físicas APENAS se for um filho físico (t.parent_id !== null).
      // Isso nos permite detectar quando uma ocorrência específica (inclusive a primeira/mãe)
      // foi desmembrada em um filho físico separado por edição de escopo 'somente este'.
      if (t.parent_id && t.installment_current !== null && t.installment_current !== undefined) {
        if (!physicalIndicesByParent.has(parentId)) {
          physicalIndicesByParent.set(parentId, new Set());
        }
        physicalIndicesByParent.get(parentId)!.add(t.installment_current);
      }
    }

    const maxDate = endOfMonth(currentMonth);
    const todayStr = format(today, 'yyyy-MM-dd');

    for (const t of transactions) {
      // Skip cancelled records entirely — they are blockers, not displayable items
      if (t.status === 'cancelled') continue;

      const tDate = parseISO(t.date);

      if (!t.recurrence_enabled) {
        if (isBefore(tDate, maxDate) || isSameDay(tDate, maxDate)) {
          let finalInstanceDate = t.date;
          const isUnpaid = t.status !== 'paid';
          
          // Se estiver pendente e no passado (atrasado), empurra visualmente para hoje
          if (isUnpaid && t.date < todayStr) {
            finalInstanceDate = todayStr;
          }
          
          instances.push({ ...t, instanceDate: finalInstanceDate, originalInstanceDate: t.date, isVirtual: false });
        }
        continue;
      }

      const interval = t.recurrence_interval || 1;
      const period = t.recurrence_period || 'monthly';
      const recEndDate = t.recurrence_end_date ? parseISO(t.recurrence_end_date) : null;
      
      let cursor = new Date(tDate);
      const parentId = t.id; // Se tem recurrence_enabled é o pai
      let occurrenceIndex = 0;
      
      while (isBefore(cursor, maxDate) || isSameDay(cursor, maxDate)) {
        // Respect recurrence_end_date: stop generating after this date
        if (recEndDate && isAfter(cursor, recEndDate)) break;

        const dateStr = format(cursor, 'yyyy-MM-dd');
        const currentInst = (t.installment_current || 1) + occurrenceIndex;

        // Checar por índice sequencial e por data (fallback)
        const hasPhysicalByIndex = physicalIndicesByParent.get(parentId)?.has(currentInst);
        const hasPhysicalByDate = physicalDatesByParent.get(parentId)?.has(dateStr);
        const alreadyHasPhysical = hasPhysicalByIndex || hasPhysicalByDate;

        // Se for a data original do pai (e não houver filho físico desmembrado para esse mesmo índice)
        // ou uma virtual que não existe fisicamente.
        if (!alreadyHasPhysical || (dateStr === t.date && !hasPhysicalByIndex)) {
          // Compute correct invoice_month for virtual credit card transactions
          let newInvoiceMonth = t.invoice_month;
          if (t.account_type === 'credit_card' && t.invoice_month) {
             const [y, m] = t.invoice_month.split('-');
             const origInvoiceDate = new Date(Number(y), Number(m) - 1, 1);
             const diffMonths = (cursor.getFullYear() - tDate.getFullYear()) * 12 + (cursor.getMonth() - tDate.getMonth());
             const newDate = addMonths(origInvoiceDate, diffMonths);
             newInvoiceMonth = format(newDate, 'yyyy-MM');
          }

          const status = dateStr !== t.date ? 'pending' : t.status;
          let finalInstanceDate = dateStr;
          const isUnpaid = status !== 'paid';
          
          // Se estiver pendente e no passado (atrasado), empurra visualmente para hoje
          if (isUnpaid && dateStr < todayStr) {
             finalInstanceDate = todayStr;
          }

          instances.push({
            ...t,
            instanceDate: finalInstanceDate,
            originalInstanceDate: dateStr,
            isVirtual: dateStr !== t.date,
            status,
            installment_current: currentInst,
            invoice_month: newInvoiceMonth,
          });
        }
        
        occurrenceIndex++;
        switch (period) {
          case 'daily': cursor = addDays(cursor, interval); break;
          case 'weekly': cursor = addWeeks(cursor, interval); break;
          case 'monthly': cursor = addMonths(cursor, interval); break;
          case 'yearly': cursor = addYears(cursor, interval); break;
          default: cursor = addMonths(cursor, interval);
        }
      }
    }

    return instances.sort((a, b) => {
      const dateCompare = a.instanceDate.localeCompare(b.instanceDate);
      if (dateCompare !== 0) return dateCompare;
      return (a.id ?? '').localeCompare(b.id ?? '');
    });
  }, [transactions, currentMonth]);

  const monthInstances = useMemo(() => {
    return allInstancesUpToMonth.filter(t => isSameMonth(parseISO(t.instanceDate), currentMonth));
  }, [allInstancesUpToMonth, currentMonth]);

  const getVisualStatus = (t: TransactionInstance): 'paid' | 'pending' | 'overdue' | 'partial' => {
    if (t.status === 'paid') return 'paid';
    if (t.status === 'partial') return 'partial';
    const dueDate = parseISO(t.originalInstanceDate || t.instanceDate);
    
    // Apenas atrasado se for antes de hoje (hoje é amarelo/pendente)
    if (isBefore(dueDate, startOfMonth(today)) || (isBefore(dueDate, today) && !isSameDay(dueDate, today))) {
      return 'overdue';
    }
    return 'pending';
  };

  const handleEdit = (t: TransactionInstance) => {
    // Abre o modal de edição rápida com a data da instância original
    const transactionToEdit = { ...t, date: t.originalInstanceDate || t.instanceDate || t.date };
    setQuickEditTransaction(transactionToEdit);
    setQuickEditIsConfirming(false);
    setIsQuickEditOpen(true);
    setOpenDropdown(null);
  };

  const handleConfirmAction = (t: TransactionInstance) => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const originalDate = t.originalInstanceDate || t.instanceDate || t.date;
    // Se a data original for maior que hoje (futuro), força data de hoje, senão mantém original
    const dateToSet = originalDate > todayStr ? todayStr : originalDate;

    const transactionToEdit = { ...t, date: dateToSet };
    setQuickEditTransaction(transactionToEdit);
    setQuickEditIsConfirming(true);
    setIsQuickEditOpen(true);
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

  const handleDelete = async (t: TransactionInstance, scope: 'this' | 'following' | 'all' = 'this', confirmOverride = false) => {
    const isRecurring = t.modalidade === 'recorrente' || t.modalidade === 'parcelada' || !!t.parent_id || t.recurrence_enabled;
    
    if (isRecurring && !isDeleteScopeModalOpen && scope === 'this') {
      setItemToDelete(t);
      setIsDeleteScopeModalOpen(true);
      setOpenDropdown(null);
      return;
    }

    if (!isRecurring && !confirmOverride) {
      setDeleteConfirmModalConfig({
        isOpen: true,
        transaction: t
      });
      setOpenDropdown(null);
      return;
    }

    try {
      const { error } = await deletarTransacao({
        transactionId: t.id,
        scope,
        instanceDate: t.originalInstanceDate || t.instanceDate || t.date,
        installmentCurrent: t.installment_current,
      });
      if (error) throw error;
      toast.success('Excluído!');
      fetchTransactions();
    } catch {
      toast.error('Erro ao excluir.');
    } finally {
      setIsDeleteScopeModalOpen(false);
      setItemToDelete(null);
      setOpenDropdown(null);
      setDeleteConfirmModalConfig({ isOpen: false, transaction: null });
    }
  };



  const accountsData = useMemo(() => {
    return accounts.map(acc => {
      const monthStart = startOfMonth(currentMonth);
      const allAccInstances = allInstancesUpToMonth.filter(t => t.account_id === acc.id || t.destination_account_id === acc.id);
      
      const previousTotal = allAccInstances
        .filter(t => isBefore(parseISO(t.instanceDate), monthStart) && t.status === 'paid')
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

      const monthConfirmed = allAccInstances
        .filter(t => isSameMonth(parseISO(t.instanceDate), currentMonth) && t.status === 'paid')
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

      let previousProjectedTotal = allAccInstances
        .filter(t => isBefore(parseISO(t.instanceDate), monthStart))
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

      let monthProjected = allAccInstances
        .filter(t => isSameMonth(parseISO(t.instanceDate), currentMonth))
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

      // Deduct pending credit card invoices linked to this account
      const linkedCards = creditCardAccounts.filter(c => c.invoice_payment_account_id === acc.id);
      
      let pendingInvoiceDeduction = 0;
      let previousPendingInvoiceDeduction = 0;

      for (const card of linkedCards) {
         // Get all transactions for this card
         const cardTrans = allInstancesUpToMonth.filter(t => t.account_id === card.id && (t.type === 'expense' || t.type === 'income') && t.status !== 'cancelled');
         
         // Group by invoice_month
         const byMonth = new Map<string, number>();
         for (const ct of cardTrans) {
            const m = ct.invoice_month;
            if (m) {
               const valValue = Number(ct.amount) || 0;
               const adjustedVal = ct.type === 'expense' ? valValue : -valValue;
               byMonth.set(m, (byMonth.get(m) || 0) + adjustedVal);
            }
         }

         // Check which ones are paid
         for (const [m, total] of byMonth.entries()) {
             const isPaid = transactions.some(t => 
                 t.destination_account_id === card.id && 
                 t.type === 'transfer' && 
                 t.invoice_month === m &&
                 t.status !== 'cancelled'
             );
             if (!isPaid) {
                 const [y, mo] = m.split('-');
                 const dueDay = card.due_day || 1;
                 const invoiceDate = new Date(Number(y), Number(mo) - 1, dueDay, 12, 0, 0);
                 
                 if (isSameMonth(invoiceDate, currentMonth)) {
                    pendingInvoiceDeduction += total;
                 } else if (isBefore(invoiceDate, monthStart)) {
                    previousPendingInvoiceDeduction += total;
                 }
             }
         }
      }

      previousProjectedTotal -= previousPendingInvoiceDeduction;
      monthProjected -= pendingInvoiceDeduction;

      return { 
        ...acc, 
        confirmed: previousTotal + monthConfirmed, 
        projected: previousProjectedTotal + monthProjected,
        previousProjected: previousProjectedTotal
      };
    });
  }, [accounts, allInstancesUpToMonth, currentMonth, creditCardAccounts, transactions]);

  // Generate credit card invoice summary lines as TransactionInstance items
  const invoiceInstances = useMemo((): TransactionInstance[] => {
    const currentMonthStr = format(currentMonth, 'yyyy-MM');
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    const invoiceMap = new Map<string, { cardName: string; linkedAccountName: string | null; invoicePaymentAccountId: string | null; total: number; dueDay: number | null }>();
    
    for (const t of allInstancesUpToMonth) {
      if (t.account_type !== 'credit_card' || t.invoice_month !== currentMonthStr || t.status === 'cancelled') continue;
      
      const existing = invoiceMap.get(t.account_id!);
      const amount = Number(t.amount) || 0;
      const adjustedAmount = t.type === 'expense' ? amount : -amount;
      
      if (existing) {
        existing.total += adjustedAmount;
      } else {
        const card = creditCardAccounts.find(c => c.id === t.account_id);
        invoiceMap.set(t.account_id!, {
          cardName: card?.name || t.account?.name || 'Cartão',
          linkedAccountName: card?.linkedAccountName || null,
          invoicePaymentAccountId: card?.invoice_payment_account_id || null,
          total: adjustedAmount,
          dueDay: card?.due_day || null,
        });
      }
    }

    return Array.from(invoiceMap.entries()).map(([accountId, data]) => {
      const dueDay = data.dueDay || 1;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const safeDay = Math.min(dueDay, lastDay);
      const originalDueDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;

      // Check if bill is paid (only when the transfer is actually confirmed as paid)
      const billTransfer = transactions.find(t => 
        t.destination_account_id === accountId && 
        t.type === 'transfer' && 
        t.invoice_month === currentMonthStr &&
        t.status !== 'cancelled'
      );
      const isPaid = billTransfer?.status === 'paid';
      const autoConfirm = billTransfer?.auto_confirm || false;
      const finalDate = billTransfer ? billTransfer.date : originalDueDate;

      return {
        id: `invoice-${accountId}-${currentMonthStr}`,
        type: 'expense' as const,
        amount: data.total,
        date: finalDate,
        description: `Fatura ${data.cardName}`,
        status: isPaid ? ('paid' as const) : ('pending' as const),
        account_id: accountId,
        instanceDate: finalDate,
        isVirtual: true,
        isInvoiceSummary: true,
        auto_confirm: autoConfirm,
        invoiceData: {
          cardId: accountId,
          cardName: data.cardName,
          linkedAccountName: data.linkedAccountName,
          invoicePaymentAccountId: data.invoicePaymentAccountId,
          total: data.total,
          isPaid,
          autoConfirm,
          originalDueDate,
        },
      };
    });
  }, [allInstancesUpToMonth, transactions, creditCardAccounts, currentMonth]);

  const totals = useMemo(() => {
    const selected = accountsData.filter(a => selectedAccountIds.has(a.id));
    const confirmed = selected.reduce((sum, a) => sum + a.confirmed, 0);
    const projected = selected.reduce((sum, a) => sum + a.projected, 0);
    const previousProjected = selected.reduce((sum, a) => sum + a.previousProjected, 0);

    const monthTrans = monthInstances.filter(t => 
      (t.account_id && selectedAccountIds.has(t.account_id)) || 
      (t.destination_account_id && selectedAccountIds.has(t.destination_account_id))
    );

    // Credit card IDs set to recognize bill payments and exclude them from standard transfers out
    const creditCardIds = new Set(creditCardAccounts.map(c => c.id));

    const totalIncome = monthTrans.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    
    // Standard expense transactions (excludes credit cards, since their IDs aren't in selectedAccountIds)
    const standardExpenses = monthTrans.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);

    // Include relevant Credit Card invoice totals linked to selected payment accounts
    const invoicesExpense = invoiceInstances
      .filter(inv => inv.invoiceData?.invoicePaymentAccountId && selectedAccountIds.has(inv.invoiceData.invoicePaymentAccountId))
      .reduce((sum, inv) => sum + inv.amount, 0);

    const totalExpense = standardExpenses + invoicesExpense;

    const transfersIn = monthTrans.filter(t => t.type === 'transfer' && t.destination_account_id && selectedAccountIds.has(t.destination_account_id)).reduce((sum, t) => sum + t.amount, 0);
    
    // Transfers out, EXCEPT those sent to a credit card account (which are already counted as invoicesExpense)
    const transfersOut = monthTrans
      .filter(t => 
        t.type === 'transfer' && 
        t.account_id && 
        selectedAccountIds.has(t.account_id) &&
        !(t.destination_account_id && creditCardIds.has(t.destination_account_id))
      )
      .reduce((sum, t) => sum + t.amount, 0);

    return { 
      confirmed, projected, previousProjected, income: totalIncome, expense: totalExpense, transfersIn, transfersOut,
      result: totalIncome - totalExpense + (transfersIn - transfersOut)
    };
  }, [accountsData, selectedAccountIds, monthInstances, creditCardAccounts, invoiceInstances]);

  const displayInstances = useMemo(() => {
    const creditCardIds = new Set(creditCardAccounts.map(c => c.id));

    const filtered = monthInstances.filter(t => {
      // Ocultar transferências que pagam a fatura de cartão de crédito para evitar duplicidade visual
      if (t.type === 'transfer' && t.destination_account_id && creditCardIds.has(t.destination_account_id)) {
        return false;
      }

      const isSelected = (t.account_id && selectedAccountIds.has(t.account_id)) || (t.destination_account_id && selectedAccountIds.has(t.destination_account_id));
      const matchesFilter = filter === 'all' || t.type === filter;
      const search = searchTerm.toLowerCase();
      const matchesSearch = searchTerm === '' || 
        t.description?.toLowerCase().includes(search) ||
        t.client?.name?.toLowerCase().includes(search) ||
        t.account?.name?.toLowerCase().includes(search) ||
        t.destination_account?.name?.toLowerCase().includes(search) ||
        t.category?.name?.toLowerCase().includes(search) ||
        t.amount?.toString().includes(search);
      return isSelected && matchesFilter && matchesSearch;
    });

    // Inject invoice instances into the list, sorted by date
    const filteredInvoices = invoiceInstances.filter(inv => {
      // Hide if linked account is not selected
      if (inv.invoiceData?.invoicePaymentAccountId && !selectedAccountIds.has(inv.invoiceData.invoicePaymentAccountId)) {
        return false;
      }
      const matchesFilter = filter === 'all' || filter === 'expense';
      const search = searchTerm.toLowerCase();
      const matchesSearch = searchTerm === '' || 
        inv.description?.toLowerCase().includes(search) ||
        inv.invoiceData?.cardName?.toLowerCase().includes(search) ||
        inv.invoiceData?.total?.toString().includes(search);
      return matchesFilter && matchesSearch;
    });

    // Combine and sort ALL transactions BEFORE calculating running balance
    const combined = [...filtered, ...filteredInvoices].sort((a, b) => {
      // Ordenação cronológica normal das instâncias
      const dateCompare = a.instanceDate.localeCompare(b.instanceDate);
      if (dateCompare !== 0) return dateCompare;

      // Se ambos estiverem pagos na mesma data (hoje ou qualquer outro dia), ordena pelo momento exato do pagamento (paid_date)
      if (a.status === 'paid' && b.status === 'paid') {
        const aPaid = a.paid_date || '';
        const bPaid = b.paid_date || '';
        const paidCompare = aPaid.localeCompare(bPaid);
        if (paidCompare !== 0) return paidCompare;
      }

      // Se a data for hoje, aplica a ordenação especial: pagos -> em atraso -> pendentes
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      if (a.instanceDate === todayStr) {
        const getHojeCategory = (t: TransactionInstance) => {
          if (t.status === 'paid') return 0;
          if (t.status !== 'paid' && !!t.originalInstanceDate && t.originalInstanceDate < todayStr) return 1;
          return 2;
        };
        const aCat = getHojeCategory(a);
        const bCat = getHojeCategory(b);
        if (aCat !== bCat) return aCat - bCat;
      }

      const aIsRolled = !!a.originalInstanceDate && a.originalInstanceDate < a.instanceDate;
      const bIsRolled = !!b.originalInstanceDate && b.originalInstanceDate < b.instanceDate;

      if (aIsRolled && !bIsRolled) return 1;
      if (!aIsRolled && bIsRolled) return -1;
      
      if (aIsRolled && bIsRolled) {
         const origCompare = a.originalInstanceDate!.localeCompare(b.originalInstanceDate!);
         if (origCompare !== 0) return origCompare;
      }

      return (a.id ?? '').localeCompare(b.id ?? '');
    });

    // Início do saldo acumulado para as contas selecionadas no início do mês (usando saldo previsto)
    const openingBalance = totals.previousProjected;

    let runningBalance = openingBalance;

    const sortedList = combined.map(t => {
      if (t.isInvoiceSummary) {
         // Fatura de cartão sempre diminui o saldo acumulado na visualização da listagem,
         // já que a transferência correspondente é ocultada visualmente.
         runningBalance -= t.amount;
      } else if (t.type === 'income') {
         runningBalance += t.amount;
      } else if (t.type === 'expense') {
         runningBalance -= t.amount;
      } else if (t.type === 'transfer') {
        const isOut = t.account_id && selectedAccountIds.has(t.account_id);
        const isIn = t.destination_account_id && selectedAccountIds.has(t.destination_account_id);
        if (isIn && !isOut) runningBalance += t.amount;
        else if (isOut && !isIn) runningBalance -= t.amount;
      }
      return { ...t, runningBalance };
    });

    // Inject opening balance if no search filter is active
    if (searchTerm === '') {
      const lastDayPrevMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 0);
      const openingBalanceInstance = {
        id: `opening-balance-${format(currentMonth, 'yyyy-MM')}`,
        type: 'income',
        amount: 0,
        date: format(lastDayPrevMonth, 'yyyy-MM-dd'),
        description: 'Saldo do mês anterior',
        status: 'paid',
        instanceDate: format(lastDayPrevMonth, 'yyyy-MM-dd'),
        isVirtual: true,
        isOpeningBalance: true,
        runningBalance: openingBalance,
      } as any;
      return [openingBalanceInstance, ...sortedList];
    }

    return sortedList;
  }, [monthInstances, selectedAccountIds, filter, searchTerm, totals.confirmed, currentMonth, invoiceInstances, creditCardAccounts]);

  const toggleSelectTransaction = (key: string, e?: React.MouseEvent | React.ChangeEvent) => {
    if (e) e.stopPropagation();
    setSelectedTransactionKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleTouchStart = (key: string) => {
    isLongPressRef.current = false;
    if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
    
    touchTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      toggleSelectTransaction(key);
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, 600);
  };

  const handleTouchEnd = () => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
    if (isLongPressRef.current) {
      setTimeout(() => {
        isLongPressRef.current = false;
      }, 100);
    }
  };

  const handleTouchMove = () => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  };

  const selectableInstances = useMemo(() => {
    return displayInstances.filter(t => !t.isOpeningBalance && !t.isInvoiceSummary);
  }, [displayInstances]);

  const isAllSelected = useMemo(() => {
    return selectableInstances.length > 0 && selectableInstances.every(t => selectedTransactionKeys.has(`${t.id}-${t.instanceDate}`));
  }, [selectableInstances, selectedTransactionKeys]);

  const handleSelectAll = () => {
    if (isAllSelected) {
      setSelectedTransactionKeys(prev => {
        const next = new Set(prev);
        selectableInstances.forEach(t => next.delete(`${t.id}-${t.instanceDate}`));
        return next;
      });
    } else {
      setSelectedTransactionKeys(prev => {
        const next = new Set(prev);
        selectableInstances.forEach(t => next.add(`${t.id}-${t.instanceDate}`));
        return next;
      });
    }
  };

  const handleBulkConfirmClick = () => {
    setBulkConfirmDateMode('original');
    setBulkConfirmSpecificDate(format(new Date(), 'yyyy-MM-dd'));
    setIsBulkConfirmOpen(true);
  };

  const handleBulkConfirmSubmit = async () => {
    if (!user) return;
    try {
      setBulkConfirmLoading(true);
      
      const selectedInstances = displayInstances.filter(t => 
        selectedTransactionKeys.has(`${t.id}-${t.instanceDate}`) && !t.isOpeningBalance && !t.isInvoiceSummary
      );

      const promises = selectedInstances.map(async (t) => {
        const origDate = t.originalInstanceDate || t.instanceDate || t.date;
        const targetDate = bulkConfirmDateMode === 'original' ? origDate : bulkConfirmSpecificDate;
        const paidDate = targetDate;

        if (t.isVirtual) {
          // Materializar transação virtual
          const newChildPayload = {
            user_id: user.id,
            type: t.type,
            amount: t.amount,
            date: targetDate,
            description: t.description,
            account_id: t.account_id || null,
            category_id: t.category_id || null,
            client_id: t.client_id || null,
            status: 'paid',
            paid_date: paidDate,
            parent_id: t.parent_id || t.id,
            modalidade: 'unica',
            is_customized: true,
            installment_current: t.installment_current || 1,
            recurrence_enabled: false,
            auto_confirm: false
          };

          const { data: newChild, error: insertError } = await supabase
            .from('financial_transactions')
            .insert(newChildPayload)
            .select('id')
            .single();

          if (insertError) throw insertError;

          // Copiar tags se houver
          if (t.tags && t.tags.length > 0 && newChild) {
            const tagIds = t.tags.map((tagObj: any) => tagObj.tag?.id || tagObj.id).filter(Boolean);
            if (tagIds.length > 0) {
              const junctionRows = tagIds.map((tagId: string) => ({
                transaction_id: newChild.id,
                tag_id: tagId
              }));
              await supabase.from('transaction_tags').insert(junctionRows);
            }
          }
        } else {
          // Atualizar transação física existente
          const updatePayload: any = {
            status: 'paid',
            paid_date: paidDate,
            date: targetDate // AQUI: atualiza a data de cadastro para a data do pagamento!
          };
          
          const { error: updateError } = await supabase
            .from('financial_transactions')
            .update(updatePayload)
            .eq('id', t.id);

          if (updateError) throw updateError;
        }
      });

      await Promise.all(promises);
      toast.success(`${selectedInstances.length} lançamentos confirmados!`);
      setSelectedTransactionKeys(new Set());
      setIsBulkConfirmOpen(false);
      fetchTransactions();
    } catch (err: any) {
      console.error('Erro na confirmação em lote:', err);
      toast.error('Erro ao confirmar lançamentos: ' + err.message);
    } finally {
      setBulkConfirmLoading(false);
    }
  };

  const handleBulkUnconfirm = async () => {
    if (!user) return;
    try {
      const selectedInstances = displayInstances.filter(t => 
        selectedTransactionKeys.has(`${t.id}-${t.instanceDate}`) && !t.isOpeningBalance && !t.isInvoiceSummary
      );

      const physicalPaid = selectedInstances.filter(t => !t.isVirtual && t.status === 'paid');

      if (physicalPaid.length === 0) {
        toast.error('Nenhum lançamento físico pago selecionado para desconfirmar');
        return;
      }

      const promises = physicalPaid.map(async (t) => {
        const originalDate = calcularDataVencimentoOriginal(t, transactions);
        const { error } = await supabase
          .from('financial_transactions')
          .update({
            status: 'pending',
            paid_date: null,
            date: originalDate // Restaura a data original!
          })
          .eq('id', t.id);
        if (error) throw error;
      });

      await Promise.all(promises);
      toast.success(`${physicalPaid.length} lançamentos desconfirmados!`);
      setSelectedTransactionKeys(new Set());
      fetchTransactions();
    } catch (err: any) {
      console.error('Erro ao desconfirmar em lote:', err);
      toast.error('Erro ao desconfirmar lançamentos: ' + err.message);
    }
  };

  const handleBulkDeleteClick = () => {
    setIsBulkDeleteConfirmOpen(true);
  };

  const handleBulkDeleteSubmit = async () => {
    if (!user) return;
    try {
      setBulkDeleteLoading(true);
      
      const selectedInstances = displayInstances.filter(t => 
        selectedTransactionKeys.has(`${t.id}-${t.instanceDate}`) && !t.isOpeningBalance && !t.isInvoiceSummary
      );

      const physicalIds = selectedInstances.filter(t => !t.isVirtual).map(t => t.id);

      if (physicalIds.length === 0) {
        toast.error('Nenhum lançamento físico selecionado para exclusão');
        setIsBulkDeleteConfirmOpen(false);
        return;
      }

      const { error } = await supabase
        .from('financial_transactions')
        .delete()
        .in('id', physicalIds);

      if (error) throw error;

      toast.success(`${physicalIds.length} lançamentos excluídos!`);
      setSelectedTransactionKeys(new Set());
      setIsBulkDeleteConfirmOpen(false);
      fetchTransactions();
    } catch (err: any) {
      console.error('Erro ao excluir em lote:', err);
      toast.error('Erro ao excluir lançamentos: ' + err.message);
    } finally {
      setBulkDeleteLoading(false);
    }
  };

  const calcularDataVencimentoOriginal = (t: TransactionInstance, transactionsList: FinancialTransaction[]): string => {
    if (!t.parent_id) return t.originalInstanceDate || t.instanceDate || t.date;
    const mother = transactionsList.find(m => m.id === t.parent_id);
    if (!mother) return t.originalInstanceDate || t.instanceDate || t.date;
    const interval = mother.recurrence_interval || 1;
    const period = mother.recurrence_period || 'monthly';
    const motherDate = parseISO(mother.date);
    const diff = (t.installment_current || 1) - (mother.installment_current || 1);
    if (diff <= 0) return mother.date;
    let cursor = new Date(motherDate);
    const steps = diff * interval;
    switch (period) {
      case 'daily': cursor = addDays(cursor, steps); break;
      case 'weekly': cursor = addWeeks(cursor, steps); break;
      case 'monthly': cursor = addMonths(cursor, steps); break;
      case 'yearly': cursor = addYears(cursor, steps); break;
      default: cursor = addMonths(cursor, steps);
    }
    return format(cursor, 'yyyy-MM-dd');
  };

  const handleUnconfirmAction = async (t: TransactionInstance) => {
    try {
      const originalDate = calcularDataVencimentoOriginal(t, transactions);
      const { error } = await supabase
        .from('financial_transactions')
        .update({
          status: 'pending',
          paid_date: null,
          date: originalDate
        })
        .eq('id', t.id);
      if (error) throw error;
      toast.success('Lançamento desconfirmado!');
      fetchTransactions();
    } catch (err: unknown) {
      console.error('Erro ao desconfirmar:', err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      toast.error('Erro ao desconfirmar lançamento: ' + errorMsg);
    }
  };

  const dynamicTotals = useMemo(() => {
    let income = 0;
    let expense = 0;
    let transfersIn = 0;
    let transfersOut = 0;

    const creditCardIds = new Set(creditCardAccounts.map(c => c.id));

    for (const t of displayInstances) {
      if (t.isOpeningBalance) continue;

      if (t.isInvoiceSummary) {
        expense += t.amount;
        continue;
      }

      if (t.type === 'income') {
        income += t.amount;
      } else if (t.type === 'expense') {
        expense += t.amount;
      } else if (t.type === 'transfer') {
        const isOut = t.account_id && selectedAccountIds.has(t.account_id);
        const isIn = t.destination_account_id && selectedAccountIds.has(t.destination_account_id);
        const isToCreditCard = t.destination_account_id && creditCardIds.has(t.destination_account_id);

        if (isIn && !isOut) {
          transfersIn += t.amount;
        } else if (isOut && !isIn) {
          if (!isToCreditCard) {
            transfersOut += t.amount;
          }
        }
      }
    }

    const result = income - expense + (transfersIn - transfersOut);

    return {
      confirmed: totals.confirmed,
      projected: totals.projected,
      previousProjected: totals.previousProjected,
      income,
      expense,
      transfersIn,
      transfersOut,
      result
    };
  }, [displayInstances, selectedAccountIds, creditCardAccounts, totals.confirmed, totals.projected, totals.previousProjected]);

  const monthLabel = format(currentMonth, "MMMM 'de' yyyy", { locale: ptBR });

  const SidebarContent = () => (
    <div className="space-y-2 h-full pb-2">
      {/* Mês de Referência */}
      <div className="bg-white py-1.5 px-3 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between">
        <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1 hover:bg-slate-100 rounded-lg transition-all active:scale-90">
          <ChevronLeft size={16} className="text-slate-600" />
        </button>
        <div className="text-center">
          <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-0.5">Mês de Referência</span>
          <h2 className="text-base font-black text-slate-800 capitalize font-manrope">{monthLabel}</h2>
        </div>
        <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1 hover:bg-slate-100 rounded-lg transition-all active:scale-90">
          <ChevronRight size={16} className="text-slate-600" />
        </button>
      </div>

      {/* Seção de Contas */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="py-1.5 px-3 border-b border-teal-700/10 bg-teal-950/25 flex justify-between items-center text-[9px] font-extrabold uppercase tracking-widest text-teal-900">
          <span>Contas</span>
          <span>Saldo</span>
        </div>
        <div className="divide-y divide-slate-50 max-h-[160px] overflow-y-auto no-scrollbar">
          {accountsData.map((acc) => (
            <div key={acc.id} className="py-1 px-3 flex items-center gap-2 hover:bg-slate-50 transition-colors">
              <input 
                type="checkbox"
                checked={selectedAccountIds.has(acc.id)}
                onChange={() => {
                  const next = new Set(selectedAccountIds);
                  if (next.has(acc.id)) next.delete(acc.id); else next.add(acc.id);
                  setSelectedAccountIds(next);
                }}
                className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 cursor-pointer"
              />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-slate-700 truncate">{acc.name}</p>
                <p className="text-[8px] text-slate-400">{acc.type === 'checking' ? 'Corrente' : acc.type === 'savings' ? 'Poupança' : 'Inv.'}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-black text-emerald-600">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(acc.confirmed)}</p>
                <p className={`text-[8px] font-bold ${acc.projected >= 0 ? 'text-emerald-600/75' : 'text-rose-500/75'}`}>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(acc.projected)}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="py-2 px-3 bg-gradient-to-br from-[#0d9488] to-[#0f766e] text-white flex justify-between items-center border-t border-teal-700/40">
          <div className="flex flex-col">
            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-teal-100">Total</span>
          </div>
          <div className="bg-white px-3 py-1 rounded-xl shadow-md text-right">
            <p className="text-xs font-black text-[#0d9488] leading-tight">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.confirmed)}
            </p>
            <p className="text-[7px] font-bold text-slate-500 mt-0.5 leading-none">
              Proj: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.projected)}
            </p>
          </div>
        </div>
      </div>

      {/* Resumo Mensal */}
      <div className="bg-gradient-to-br from-[#0d9488] to-[#0f766e] p-3 rounded-xl text-white space-y-3 relative overflow-hidden group border border-[#0d9488]/30 shadow-xl">
        <div className="absolute -right-10 -top-10 w-24 h-24 bg-white/10 rounded-full blur-2xl pointer-events-none group-hover:bg-white/15 transition-all duration-500" />
        <div className="absolute -left-10 -bottom-10 w-24 h-24 bg-white/5 rounded-full blur-2xl pointer-events-none" />

        <div className="space-y-2 relative z-10">
          <div className="flex items-center justify-between border-b border-teal-700/40 pb-1.5">
            <span className="text-[8px] font-black uppercase tracking-[0.25em] text-teal-100">Resumo Mensal</span>
            <Filter size={10} className="text-teal-200" />
          </div>
          
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between bg-teal-950/25 py-1.5 px-2.5 rounded-lg border border-teal-700/30 transition-colors">
              <span className="text-[8px] uppercase font-black text-teal-100 tracking-wider">Ganhos</span>
              <span className="bg-white px-2 py-0.5 rounded-lg font-black text-[11px] text-emerald-600 shadow-sm">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(dynamicTotals.income + dynamicTotals.transfersIn)}
              </span>
            </div>
            <div className="flex items-center justify-between bg-teal-950/25 py-1.5 px-2.5 rounded-lg border border-teal-700/30 transition-colors">
              <span className="text-[8px] uppercase font-black text-teal-100 tracking-wider">Gastos</span>
              <span className="bg-white px-2 py-0.5 rounded-lg font-black text-[11px] text-rose-600 shadow-sm">
                -{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(dynamicTotals.expense + dynamicTotals.transfersOut)}
              </span>
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-teal-700/40 flex flex-col gap-1 relative z-10">
          <span className="text-[8px] font-black uppercase text-teal-200 tracking-wider">Resultado Líquido</span>
          <div className="flex items-center justify-between gap-1.5 flex-wrap">
            <span className={`text-base font-black tracking-tight bg-white px-3 py-1 rounded-xl shadow-md ${dynamicTotals.result >= 0 ? 'text-[#0d9488]' : 'text-rose-600'}`}>
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(dynamicTotals.result)}
            </span>
            <span className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded-md ${dynamicTotals.result >= 0 ? 'bg-white/20 text-white border border-white/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'}`}>
              {dynamicTotals.result >= 0 ? 'Superávit' : 'Déficit'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="bg-slate-50 min-h-screen flex flex-col">
      {/* ===== MOBILE LAYOUT ===== */}
      <div className="xl:hidden flex flex-col min-h-screen">
        {/* Mobile Header: Resumo + Busca + Criar */}
        <div className="sticky top-[57px] z-20 bg-white border-b border-slate-100 px-3 pt-3 pb-2 space-y-2">
          {/* Top Row for Sm and Above / Standard mobile rows */}
          {/* Mobile view only: < sm */}
          <div className="flex sm:hidden items-center justify-between w-full gap-2">
            <button onClick={() => setIsSidebarOpen(true)} className="flex items-center gap-1.5 shrink-0">
              <div className="flex flex-col gap-[3px] w-4.5"><div className="h-[2px] w-full bg-slate-600" /><div className="h-[2px] w-full bg-slate-600" /><div className="h-[2px] w-full bg-slate-600" /></div>
              <span className="text-[10px] font-black text-slate-800">Resumo</span>
            </button>
            
            {/* Saldos Divididos no Mobile */}
            <div className="flex items-center gap-2 px-2.5 py-1 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-bold shadow-sm shrink-0">
              <div className="flex flex-col items-center leading-none">
                <span className="text-[6px] font-black text-slate-400 uppercase tracking-wider mb-0.5">Saldo</span>
                <span className="text-slate-800 font-extrabold">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.confirmed)}
                </span>
              </div>
              <div className="w-px h-4 bg-slate-200" />
              <div className="flex flex-col items-center leading-none">
                <span className="text-[6px] font-black text-slate-400 uppercase tracking-wider mb-0.5">Previsto</span>
                <span className="text-slate-500 font-extrabold">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.projected)}
                </span>
              </div>
            </div>

            <button
              onClick={() => { setModalType('expense'); setEditingTransaction(null); setIsModalOpen(true); }}
              className="flex items-center gap-1 bg-[#0d9488] text-white px-2 py-1.5 rounded-xl text-[9px] font-black shadow-md hover:bg-[#0f766e] transition-all uppercase tracking-wider shrink-0"
            >
              <Plus size={10} /> Criar
            </button>
          </div>

          {/* Month Navigation (ONLY on mobile) */}
          <div className="flex sm:hidden items-center justify-between bg-slate-50 rounded-xl px-1 py-1 w-full">
            <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1.5 hover:bg-white rounded-lg transition-all active:scale-90">
              <ChevronLeft size={18} className="text-slate-600" />
            </button>
            <span className="text-xs font-black text-slate-700 capitalize">{monthLabel}</span>
            <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1.5 hover:bg-white rounded-lg transition-all active:scale-90">
              <ChevronRight size={18} className="text-slate-600" />
            </button>
          </div>

          {/* Tablet/Medium view: sm to xl - Month filter and balance occupying all middle space */}
          <div className="hidden sm:flex items-center justify-between w-full gap-4">
             {/* 1. Resumo button (Far Left) */}
             <button onClick={() => setIsSidebarOpen(true)} className="flex items-center gap-2 shrink-0">
               <div className="flex flex-col gap-[3px] w-4"><div className="h-[2px] w-full bg-slate-600" /><div className="h-[2px] w-full bg-slate-600" /><div className="h-[2px] w-full bg-slate-600" /></div>
               <span className="text-xs font-black text-slate-800">Resumo</span>
             </button>

             {/* 2. Central Area: Month Filter and Balance occupying all space */}
             <div className="flex-1 flex justify-around items-center max-w-xl mx-auto gap-4">
               {/* Month filter */}
               <div className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl px-2.5 py-1 min-w-[170px] shadow-sm shrink-0">
                 <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1 hover:bg-white rounded-lg transition-all active:scale-90">
                   <ChevronLeft size={14} className="text-slate-600" />
                 </button>
                 <span className="text-xs font-black text-slate-700 capitalize select-none">{monthLabel}</span>
                 <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1 hover:bg-white rounded-lg transition-all active:scale-90">
                   <ChevronRight size={14} className="text-slate-600" />
                 </button>
               </div>

               {/* Balance com Saldo Atual e Previsto Divididos */}
               <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl px-3.5 py-1 shadow-sm shrink-0 text-xs font-black">
                 <div className="flex flex-col items-start leading-none">
                   <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider mb-0.5">Saldo</span>
                   <span className="text-slate-800">
                     {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.confirmed)}
                   </span>
                 </div>
                 <div className="w-px h-5 bg-slate-200" />
                 <div className="flex flex-col items-start leading-none">
                   <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider mb-0.5">Previsto</span>
                   <span className="text-slate-600">
                     {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.projected)}
                   </span>
                 </div>
               </div>
             </div>

             {/* 3. Button Criar (Far Right) */}
             <button
               onClick={() => { setModalType('expense'); setEditingTransaction(null); setIsModalOpen(true); }}
               className="flex items-center gap-1.5 bg-[#0d9488] text-white px-4 py-2 rounded-xl text-[10px] font-black shadow-md hover:bg-[#0f766e] transition-all uppercase tracking-wider shrink-0"
             >
               <Plus size={14} /> Criar
             </button>
          </div>
          {/* Linha 2: Busca + Refresh */}
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text" placeholder="Filtrar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button onClick={fetchTransactions} disabled={loading} className={`p-2 bg-slate-50 border border-slate-200 rounded-xl ${loading ? 'animate-spin' : ''}`}><RefreshCcw size={16} /></button>
            <button onClick={() => setIsShareModalOpen(true)} className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-[#0d9488] hover:bg-slate-100/80 transition-all flex items-center justify-center" title="Compartilhar Lançamentos"><Share2 size={16} /></button>
          </div>
          {/* Linha 3: Filtros */}
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {['all', 'income', 'expense', 'transfer'].map(f => (
              <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 rounded-lg text-[9px] font-black transition-all shrink-0 ${filter === f ? 'bg-slate-900 text-white shadow' : 'text-slate-400 bg-slate-50'}`}>
                {f === 'all' ? 'TUDO' : f === 'income' ? 'ENTRADAS' : f === 'expense' ? 'SAÍDAS' : 'TRANSF.'}
              </button>
            ))}
          </div>
          {/* Mobile Selecionar Todos */}
          {selectableInstances.length > 0 && (
            <div className="flex justify-between items-center pt-2 px-1 border-t border-slate-100 mt-2">
              <button 
                onClick={handleSelectAll} 
                className="flex items-center gap-1.5 text-[9px] font-extrabold text-slate-500 uppercase tracking-wider bg-slate-50 hover:bg-slate-100 px-2 py-1 rounded-lg border border-slate-200/40 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  readOnly
                  className="w-3.5 h-3.5 rounded border-slate-300 text-teal-600 pointer-events-none"
                />
                <span>{isAllSelected ? 'Desmarcar Todos' : 'Selecionar Todos'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Mobile Transaction List - Layout tabular compacto */}
        <div className="flex-1 bg-white pb-20">
          {displayInstances.length === 0 ? (
            <div className="py-20 text-center"><p className="text-slate-400 font-bold">Nenhum lançamento.</p></div>
          ) : (
            displayInstances.map((t, index) => {
              const dropdownKey = `${t.id}-${t.instanceDate}`;
              const isEven = index % 2 === 0;

              if (t.isOpeningBalance) {
                return (
                  <div key={dropdownKey} className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-100 bg-slate-50/80">
                    <div className="w-6 flex items-center justify-center shrink-0">
                      <div className="w-2 h-2 rounded-full bg-slate-300" />
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 shrink-0 w-[52px]">
                      {t.instanceDate === format(new Date(), 'yyyy-MM-dd') ? 'Hoje' : format(parseISO(t.instanceDate), 'dd/MM/yy')}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Wallet size={12} className="text-slate-500 shrink-0" />
                        <span className="font-black text-xs text-slate-700 truncate">{t.description}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-medium text-xs ${t.runningBalance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.runningBalance)}
                      </p>
                    </div>
                    <div className="relative shrink-0 w-6"></div>
                  </div>
                );
              }

              if (t.isInvoiceSummary) {
                return (
                  <div 
                    key={dropdownKey} 
                    onClick={() => { setSelectedSummaryTransaction(t); setIsSummaryModalOpen(true); }}
                    className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-100 bg-gradient-to-r from-amber-50/60 to-orange-50/40 cursor-pointer transition-colors"
                  >
                    <div className="w-6 flex items-center justify-center shrink-0">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${t.invoiceData?.isPaid ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 shrink-0 w-[52px]">
                      {t.instanceDate === format(new Date(), 'yyyy-MM-dd') ? 'Hoje' : format(parseISO(t.instanceDate), 'dd/MM/yy')}
                    </span>

                    {/* CASO: layoutPreference === 'value_first' OU 'value_right_desc' -> VALOR VEM PRIMEIRO À ESQUERDA */}
                    {(layoutPreference === 'value_first' || layoutPreference === 'value_right_desc') && (
                      <div className={`shrink-0 w-[90px] ${valueAlignment === 'left' ? 'text-left' : 'text-right'} pr-1.5`}>
                        <p className="font-extrabold text-xs text-amber-700">
                          {formatTransactionAmount(t.amount, 'expense')}
                        </p>
                        {(t as any).runningBalance && !isNaN((t as any).runningBalance) && (
                          <p className="text-[8px] font-bold text-slate-500 bg-slate-100 px-1 py-0.5 rounded border border-slate-200/50 inline-block mt-0.5 leading-none">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((t as any).runningBalance)}
                          </p>
                        )}
                      </div>
                    )}

                    <div className={`flex-1 min-w-0 ${layoutPreference === 'value_right_desc' ? 'text-right flex flex-col items-end' : ''}`}>
                      <div className={`flex items-center gap-1.5 ${layoutPreference === 'value_right_desc' ? 'justify-end' : ''}`}>
                        {layoutPreference === 'value_right_desc' && t.auto_confirm && (
                          <Zap size={10} className="text-amber-500 fill-amber-500 shrink-0 mr-1" />
                        )}
                        <CreditCard size={12} className="text-amber-600 shrink-0" />
                        <span className="font-black text-xs text-slate-800 truncate">{t.description}</span>
                        {layoutPreference !== 'value_right_desc' && t.auto_confirm && (
                          <Zap size={10} className="text-amber-500 fill-amber-500 shrink-0 ml-1" />
                        )}
                      </div>
                      {t.invoiceData?.linkedAccountName && (
                        <div className={`flex items-center gap-1.5 mt-0.5 ${layoutPreference === 'value_right_desc' ? 'justify-end' : ''}`}>
                          <span className="text-[8px] font-black text-slate-400 uppercase">{t.invoiceData.linkedAccountName}</span>
                        </div>
                      )}
                    </div>

                    {/* CASO: layoutPreference === 'default' -> VALOR VEM POR ÚLTIMO (DIREITA) */}
                    {layoutPreference === 'default' && (
                      <div className={`shrink-0 w-[90px] ${valueAlignment === 'left' ? 'text-left' : 'text-right'} pl-1.5`}>
                        <p className="font-medium text-xs text-amber-700">
                          {formatTransactionAmount(t.amount, 'expense')}
                        </p>
                        {(t as any).runningBalance && !isNaN((t as any).runningBalance) && (
                          <p className="text-[9px] font-medium text-slate-900 bg-slate-100 px-1 py-0.5 rounded border border-slate-200/50 inline-block mt-0.5">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((t as any).runningBalance)}
                          </p>
                        )}
                      </div>
                    )}
                    <div className="relative shrink-0" ref={openDropdown === dropdownKey ? dropdownRef : null} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                      <button onClick={(e) => handleDropdownClick(e, dropdownKey)} className="p-1 text-slate-600 hover:text-slate-800 transition-colors"><MoreVertical size={16} /></button>
                      {openDropdown === dropdownKey && (
                        <div className={`absolute right-0 w-44 bg-white rounded-xl shadow-2xl border border-slate-100 py-1.5 z-[300] ${dropdownDirection === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                          <button onClick={() => {
                            setOpenDropdown(null);
                            const cardId = t.invoiceData?.cardId;
                            const currentMonthStr = format(currentMonth, 'yyyy-MM');
                            if (cardId) navigate(`/v2/financeiro/cartoes?cardId=${cardId}&month=${currentMonthStr}`);
                          }} className="w-full px-3 py-1.5 text-left text-[11px] font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                            <CreditCard size={12} className="text-purple-600" /> Visualizar Fatura
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              const status = getVisualStatus(t);
              return (
                <div 
                  key={dropdownKey} 
                  onTouchStart={() => handleTouchStart(`${t.id}-${t.instanceDate}`)}
                  onTouchEnd={handleTouchEnd}
                  onTouchMove={handleTouchMove}
                  onClick={() => {
                    if (!isLongPressRef.current) {
                      setSelectedSummaryTransaction(t);
                      setIsSummaryModalOpen(true);
                    }
                  }}
                  className={`flex items-center gap-2 px-3 py-2 border-b border-slate-50 cursor-pointer hover:bg-slate-100/50 transition-colors group ${isEven ? 'bg-white' : 'bg-slate-100/40'}`}
                >
                  {/* Indicador de Status ou Checkbox */}
                  <div className="w-6 flex items-center justify-center shrink-0" onClick={(e) => e.stopPropagation()}>
                    {/* Checkbox visível se houver itens selecionados OU hover */}
                    <div className={selectedTransactionKeys.size > 0 ? 'block' : 'hidden group-hover:block'}>
                      <input 
                        type="checkbox"
                        checked={selectedTransactionKeys.has(`${t.id}-${t.instanceDate}`)}
                        onChange={(e) => toggleSelectTransaction(`${t.id}-${t.instanceDate}`, e)}
                        className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500/30 cursor-pointer transition-all"
                      />
                    </div>
                    {/* Bolinha de status visível por padrão (esconde se selecionados) */}
                    <div 
                      className={selectedTransactionKeys.size > 0 ? 'hidden' : 'block group-hover:hidden cursor-pointer p-1'}
                      onClick={(e) => toggleSelectTransaction(`${t.id}-${t.instanceDate}`, e)}
                    >
                      <div className={`w-2 h-2 rounded-full shrink-0 ${status === 'paid' ? 'bg-emerald-500' : status === 'overdue' ? 'bg-rose-500' : 'bg-amber-400'}`} />
                    </div>
                  </div>
                  {/* Data */}
                  <span className="text-[10px] font-bold text-slate-400 shrink-0 w-[52px]">
                    {t.instanceDate === format(new Date(), 'yyyy-MM-dd') ? 'Hoje' : format(parseISO(t.instanceDate), 'dd/MM/yy')}
                  </span>

                  {/* CASO: layoutPreference === 'value_first' OU 'value_right_desc' -> VALOR VEM PRIMEIRO À ESQUERDA */}
                  {(layoutPreference === 'value_first' || layoutPreference === 'value_right_desc') && (
                    <div className={`shrink-0 w-[90px] ${valueAlignment === 'left' ? 'text-left' : 'text-right'} pr-1.5`}>
                      <p className={`font-extrabold text-xs ${t.type === 'expense' ? 'text-rose-600' : t.type === 'income' ? 'text-emerald-600' : 'text-indigo-600'}`}>
                        {formatTransactionAmount(t.amount, t.type)}
                      </p>
                      {(t as any).runningBalance && !isNaN((t as any).runningBalance) && (
                        <p className="text-[8px] font-bold text-slate-500 bg-slate-100 px-1 py-0.5 rounded border border-slate-200/50 inline-block mt-0.5 leading-none">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((t as any).runningBalance)}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Descrição + badges */}
                  <div className={`flex-1 min-w-0 ${layoutPreference === 'value_right_desc' ? 'text-right flex flex-col items-end' : ''}`}>
                    <div className={`flex items-center gap-1 ${layoutPreference === 'value_right_desc' ? 'justify-end' : ''}`}>
                      {layoutPreference === 'value_right_desc' && (
                        <div className="flex items-center gap-1 shrink-0 mr-1">
                          {t.status === 'paid' && <CheckCircle2 size={10} className="text-emerald-500" />}
                          {(t.recurrence_enabled || !!t.parent_id) && t.modalidade !== 'parcelada' && <Repeat size={10} className="text-slate-600 stroke-[2.5]" />}
                          {t.auto_confirm && <Zap size={10} className="text-amber-500 fill-amber-500" />}
                        </div>
                      )}

                      <span className="font-bold text-xs text-slate-800 truncate">{t.description || 'S/ Descrição'}</span>
                      
                      {layoutPreference !== 'value_right_desc' && (
                        <div className="flex items-center gap-1 shrink-0 ml-1">
                          {t.status === 'paid' && <CheckCircle2 size={10} className="text-emerald-500" />}
                          {(t.recurrence_enabled || !!t.parent_id) && t.modalidade !== 'parcelada' && <Repeat size={10} className="text-slate-600 stroke-[2.5]" />}
                          {t.auto_confirm && <Zap size={10} className="text-amber-500 fill-amber-500" />}
                        </div>
                      )}
                    </div>
                    {(t.account || t.category || t.client || t.type === 'transfer') && (
                      <div className={`flex items-center gap-1.5 mt-0.5 flex-wrap ${layoutPreference === 'value_right_desc' ? 'justify-end' : ''}`}>
                        {t.account && <span className="text-[8px] font-black text-slate-400 uppercase">{t.account.name}</span>}
                        {t.type === 'transfer' && (
                          <>
                            {t.destination_account && (
                              <>
                                <ArrowRight size={8} className="text-slate-300" />
                                <span className="text-[8px] font-black text-indigo-500 bg-indigo-50 px-1 py-0.5 rounded uppercase leading-none">{t.destination_account.name}</span>
                              </>
                            )}
                            <span className="text-[8px] font-bold text-blue-600 bg-blue-50 px-1 py-0.5 rounded flex items-center gap-0.5 uppercase leading-none border border-blue-100/50">
                              <ArrowRightLeft size={8} /> Transf.
                            </span>
                          </>
                        )}
                        {t.category && <span className="text-[8px] font-medium text-slate-300">· {t.category.name}</span>}
                        {t.client && (
                          <span className="text-[8px] font-bold text-sky-600 bg-sky-50 px-1 py-0.5 rounded flex items-center gap-0.5 border border-sky-100/50">
                            <User size={8} /> {t.client.name}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {/* CASO: layoutPreference === 'default' -> VALOR VEM POR ÚLTIMO (DIREITA) */}
                  {layoutPreference === 'default' && (
                    <div className={`shrink-0 w-[90px] ${valueAlignment === 'left' ? 'text-left' : 'text-right'} pl-1.5`}>
                      <p className={`font-medium text-xs ${t.type === 'expense' ? 'text-rose-600' : t.type === 'income' ? 'text-emerald-600' : 'text-indigo-600'}`}>
                        {formatTransactionAmount(t.amount, t.type)}
                      </p>
                      {(t as any).runningBalance && !isNaN((t as any).runningBalance) && (
                        <p className="text-[9px] font-medium text-slate-900 bg-slate-100 px-1 py-0.5 rounded border border-slate-200/50 inline-block mt-0.5">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((t as any).runningBalance)}
                        </p>
                      )}
                    </div>
                  )}
                  {/* Menu */}
                  <div className="relative shrink-0" ref={openDropdown === dropdownKey ? dropdownRef : null} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                    <button onClick={(e) => handleDropdownClick(e, dropdownKey)} className="p-1 text-slate-600 hover:text-slate-800 transition-colors"><MoreVertical size={16} /></button>
                    {openDropdown === dropdownKey && (
                      <div onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} className={`absolute right-0 w-44 bg-white rounded-xl shadow-2xl border border-slate-100 py-1.5 z-[300] ${dropdownDirection === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                        {t.status !== 'paid' && (
                          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleConfirmAction(t); }} className="w-full px-3 py-1.5 text-left text-[11px] font-black text-blue-600 hover:bg-blue-50 flex items-center gap-2"><CheckCircle2 size={12} /> Confirmar</button>
                        )}
                        {t.status === 'paid' && (
                          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleUnconfirmAction(t); }} className="w-full px-3 py-1.5 text-left text-[11px] font-black text-amber-600 hover:bg-amber-50 flex items-center gap-2"><XCircle size={12} /> Desconfirmar</button>
                        )}
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleEdit(t); }} className="w-full px-3 py-1.5 text-left text-[11px] font-bold hover:bg-slate-50 flex items-center gap-2"><Pencil size={12} /> Editar</button>
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleClone(t); }} className="w-full px-3 py-1.5 text-left text-[11px] font-bold hover:bg-slate-50 flex items-center gap-2"><Copy size={12} /> Clonar</button>
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(t); }} className="w-full px-3 py-1.5 text-left text-[11px] font-bold hover:bg-rose-50 text-rose-600 border-t mt-0.5 pt-1.5 flex items-center gap-2"><Trash2 size={12} /> Excluir</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-[200] xl:hidden">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-[280px] bg-slate-50 p-4 overflow-y-auto no-scrollbar animate-in slide-in-from-left">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-black text-slate-800">Resumo</h2>
              <button onClick={() => setIsSidebarOpen(false)} className="p-1.5 text-slate-500 hover:text-slate-700 transition-colors"><ChevronLeft size={20} /></button>
            </div>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* ===== DESKTOP LAYOUT ===== */}
      <div className="hidden xl:flex flex-1 max-w-[1700px] mx-auto w-full px-6 pt-0 -mt-4 pb-6 gap-6 items-start">
        {/* Sidebar - Fixa */}
        <aside className="w-[360px] flex-shrink-0 sticky top-[64px] max-h-[calc(100vh-90px)] overflow-y-auto no-scrollbar">
          <SidebarContent />
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col space-y-6 min-w-0">
          {/* Header da Lista (Sticky e Lado a Lado Compacto) */}
          <div className="sticky top-[64px] z-20 bg-slate-50/95 backdrop-blur-md pb-2 flex flex-col gap-3 shrink-0 border-b border-slate-200/50">
            {/* Primeira Linha: Busca e Ações */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between">
              {/* Busca */}
              <div className="flex-1 relative group w-full lg:w-auto">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text" placeholder="Buscar lançamentos..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-11 pr-10 py-3 bg-white border border-slate-200 rounded-2xl font-bold shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-sm"
                />
                {searchTerm && (
                  <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1">
                    <X size={16} />
                  </button>
                )}
              </div>

              {/* Ações Lado a Lado */}
              <div className="flex items-center gap-3 w-full lg:w-auto justify-between lg:justify-end flex-wrap sm:flex-nowrap">
                {/* Ações */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={fetchTransactions} disabled={loading} className={`p-2.5 bg-white border border-slate-200 rounded-2xl shadow-sm hover:bg-slate-50 transition-all ${loading ? 'animate-spin' : ''}`} title="Recarregar"><RefreshCcw size={16} /></button>
                  <button onClick={() => setIsShareModalOpen(true)} className="p-2.5 bg-white border border-slate-200 text-[#0d9488] rounded-2xl shadow-sm hover:bg-slate-50 transition-all" title="Compartilhar"><Share2 size={16} /></button>
                </div>
              </div>
            </div>

            {/* Segunda Linha: Título, Criar Lançamento e Filtros */}
            <div className="px-4 py-2 flex flex-row items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-black">Transações</h2>
                {selectableInstances.length > 0 && (
                  <button
                    onClick={handleSelectAll}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-all text-[10px] font-black text-slate-600 shadow-sm"
                  >
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      readOnly
                      className="w-3.5 h-3.5 rounded border-slate-300 text-teal-600 pointer-events-none"
                    />
                    <span>{isAllSelected ? 'Desmarcar Todos' : 'Selecionar Todos'}</span>
                  </button>
                )}
                <button
                  onClick={() => { setModalType('expense'); setEditingTransaction(null); setIsModalOpen(true); }}
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
          </div>

          {/* Listagem */}
          <div className="flex flex-col">

            <div className="divide-y divide-slate-50 pb-20">
              {displayInstances.length === 0 ? (
                <div className="py-20 text-center"><p className="text-slate-400 font-bold">Nenhum lançamento.</p></div>
              ) : (
                displayInstances.map((t, index) => {
                  const dropdownKey = `${t.id}-${t.instanceDate}`;
                  const isEven = index % 2 === 0;

                  if (t.isOpeningBalance) {
                    return (
                      <div key={dropdownKey} className="group flex items-center gap-4 px-4 py-2 bg-slate-50/80 border-b border-slate-100">
                        {/* Espaçador de alinhamento */}
                        <div className="w-6 shrink-0" />
                        <div className="p-2 rounded-xl shrink-0 bg-slate-200 text-slate-600">
                          <Wallet size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3">
                            <h4 className="font-black text-slate-700 text-sm">{t.description}</h4>
                          </div>
                          <div className="flex items-center gap-x-3 mt-1">
                            <p className="text-[10px] font-bold text-slate-400">
                              {t.instanceDate === format(new Date(), 'yyyy-MM-dd') ? 'Hoje' : format(parseISO(t.instanceDate), 'dd/MM/yy')}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`font-medium text-base ${t.runningBalance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.runningBalance)}
                          </p>
                        </div>
                        <div className="relative w-10"></div>
                      </div>
                    );
                  }

                  if (t.isInvoiceSummary) {
                    return (
                      <div 
                        key={dropdownKey} 
                        onClick={() => { setSelectedSummaryTransaction(t); setIsSummaryModalOpen(true); }}
                        className="group flex items-center gap-4 px-4 py-2 bg-gradient-to-r from-amber-50/80 to-orange-50/50 border-b border-amber-100/50 transition-colors cursor-pointer"
                      >
                        {/* Status dot de Fatura */}
                        <div className="w-6 flex items-center justify-center shrink-0">
                          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            t.invoiceData?.isPaid 
                              ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' 
                              : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]'
                          }`} />
                        </div>
                        <div className="p-2 rounded-xl shrink-0 bg-amber-100 text-amber-600">
                          <CreditCard size={20} />
                        </div>

                        {/* CASO: layoutPreference !== 'default' -> VALOR VEM PRIMEIRO (ESQUERDA) */}
                        {(layoutPreference === 'value_first' || layoutPreference === 'value_right_desc') && (
                          <div className={`shrink-0 w-[130px] ${valueAlignment === 'left' ? 'text-left' : 'text-right'} pr-2.5`}>
                            <p className="font-black text-sm text-amber-700">
                              {formatTransactionAmount(t.amount, 'expense')}
                            </p>
                            {(t as any).runningBalance && !isNaN((t as any).runningBalance) && (
                              <p className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1 py-0.5 rounded border border-slate-200/50 inline-block mt-0.5 leading-none">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((t as any).runningBalance)}
                              </p>
                            )}
                          </div>
                        )}

                        <div className={`flex-1 min-w-0 ${layoutPreference === 'value_right_desc' ? 'text-right flex flex-col items-end' : ''}`}>
                          <div className={`flex items-center gap-3 ${layoutPreference === 'value_right_desc' ? 'justify-end' : ''}`}>
                            {layoutPreference === 'value_right_desc' && t.auto_confirm && (
                              <div className="flex items-center gap-1.5 px-1 shrink-0 mr-1.5">
                                <Zap size={12} className="text-amber-500 fill-amber-500 shrink-0" />
                              </div>
                            )}
                            <h4 className="font-black text-slate-800 text-sm">{t.description}</h4>
                            {layoutPreference !== 'value_right_desc' && t.auto_confirm && (
                              <div className="flex items-center gap-1.5 px-2 shrink-0">
                                <Zap size={12} className="text-amber-500 fill-amber-500 shrink-0" />
                              </div>
                            )}
                          </div>
                          <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 ${layoutPreference === 'value_right_desc' ? 'justify-end' : ''}`}>
                            <p className="text-[10px] font-bold text-slate-400">
                              {t.instanceDate === format(new Date(), 'yyyy-MM-dd') ? 'Hoje' : format(parseISO(t.instanceDate), 'dd/MM/yy')}
                            </p>
                            {t.invoiceData?.linkedAccountName && (
                              <div className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 rounded-md">
                                <span className="text-[9px] font-black text-slate-500 uppercase">{t.invoiceData.linkedAccountName}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* CASO: layoutPreference === 'default' -> VALOR VEM POR ÚLTIMO (DIREITA) */}
                        {layoutPreference === 'default' && (
                          <div className={`shrink-0 w-[130px] ${valueAlignment === 'left' ? 'text-left' : 'text-right'} pl-2.5`}>
                            <p className="font-black text-sm text-amber-700">
                              {formatTransactionAmount(t.amount, 'expense')}
                            </p>
                            {(t as any).runningBalance && !isNaN((t as any).runningBalance) && (
                              <p className="text-[10px] font-medium text-slate-900 bg-slate-100 px-1 py-0.5 rounded border border-slate-200/50 inline-block mt-0.5">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((t as any).runningBalance)}
                              </p>
                            )}
                          </div>
                        )}
                        <div className="relative" ref={openDropdown === dropdownKey ? dropdownRef : null} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                          <button onClick={(e) => handleDropdownClick(e, dropdownKey)} className="p-2 text-slate-600 hover:text-slate-800 transition-colors"><MoreVertical size={20} /></button>
                          {openDropdown === dropdownKey && (
                            <div className={`absolute right-0 w-48 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-[300] ${dropdownDirection === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'}`}>
                              <button onClick={() => {
                                setOpenDropdown(null);
                                const cardId = t.invoiceData?.cardId;
                                const currentMonthStr = format(currentMonth, 'yyyy-MM');
                                if (cardId) navigate(`/v2/financeiro/cartoes?cardId=${cardId}&month=${currentMonthStr}`);
                              }} className="w-full px-4 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3">
                                <CreditCard size={14} className="text-purple-600" /> Visualizar Fatura
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }

                  const status = getVisualStatus(t);

                  return (
                    <div 
                      key={dropdownKey} 
                      onClick={() => { setSelectedSummaryTransaction(t); setIsSummaryModalOpen(true); }}
                      className={`flex items-center gap-4 px-4 py-2.5 transition-colors cursor-pointer border-b border-slate-100 group ${isEven ? 'bg-white' : 'bg-slate-100/40'}`}
                    >
                      {/* Indicador de Status ou Checkbox */}
                      <div className="w-6 flex items-center justify-center shrink-0" onClick={(e) => e.stopPropagation()}>
                        {/* Checkbox visível se houver itens selecionados OU hover */}
                        <div className={selectedTransactionKeys.size > 0 ? 'block' : 'hidden group-hover:block'}>
                          <input 
                            type="checkbox"
                            checked={selectedTransactionKeys.has(`${t.id}-${t.instanceDate}`)}
                            onChange={(e) => toggleSelectTransaction(`${t.id}-${t.instanceDate}`, e)}
                            className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500/30 cursor-pointer transition-all"
                          />
                        </div>
                        {/* Bolinha de status visível por padrão (esconde se selecionados) */}
                        <div 
                          className={selectedTransactionKeys.size > 0 ? 'hidden' : 'block group-hover:hidden cursor-pointer p-1'}
                          onClick={(e) => toggleSelectTransaction(`${t.id}-${t.instanceDate}`, e)}
                        >
                          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            status === 'paid' 
                              ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' 
                              : status === 'overdue' 
                                ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]' 
                                : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]'
                          }`} />
                        </div>
                      </div>
                      {/* Ícone de Tipo */}
                      <div className={`p-1.5 rounded-lg shrink-0 ${t.type === 'income' ? 'bg-emerald-50 text-emerald-600' : t.type === 'expense' ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600'}`}>
                        {t.type === 'income' ? <Plus size={16} /> : t.type === 'expense' ? <ArrowDownCircle size={16} /> : <ArrowRightLeft size={16} />}
                      </div>

                      {/* CASO: layoutPreference !== 'default' -> VALOR VEM PRIMEIRO (ESQUERDA) */}
                      {(layoutPreference === 'value_first' || layoutPreference === 'value_right_desc') && (
                        <div className={`shrink-0 w-[130px] ${valueAlignment === 'left' ? 'text-left' : 'text-right'} pr-2.5`}>
                          <p className={`font-black text-sm ${t.type === 'expense' ? 'text-rose-600' : t.type === 'income' ? 'text-emerald-600' : 'text-indigo-600'}`}>
                            {formatTransactionAmount(t.amount, t.type)}
                          </p>
                          {(t as any).runningBalance && !isNaN((t as any).runningBalance) && (
                            <p className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1 py-0.5 rounded border border-slate-200/50 inline-block mt-0.5 leading-none">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((t as any).runningBalance)}
                            </p>
                          )}
                        </div>
                      )}

                       {/* Descrição e Metadados (Flex-1) */}
                      <div className={`flex-1 min-w-0 ${layoutPreference === 'value_right_desc' ? 'text-right flex flex-col items-end' : ''}`}>
                        <div className={`flex items-center gap-3 ${layoutPreference === 'value_right_desc' ? 'justify-end' : ''}`}>
                          
                          {/* Emblemas ANTES do nome no layout 3 */}
                          {layoutPreference === 'value_right_desc' && (
                            <div className="flex items-center gap-1.5 px-1 shrink-0 mr-1.5">
                              {t.status === 'paid' && <CheckCircle2 size={12} className="text-emerald-500" />}
                              {(t.recurrence_enabled || !!t.parent_id) && t.modalidade !== 'parcelada' && <Repeat size={12} className="text-slate-600 stroke-[2.5]" />}
                              {t.auto_confirm && <Zap size={12} className="text-amber-500 fill-amber-500" />}
                            </div>
                          )}

                          <h4 className="font-extrabold text-slate-800 truncate text-sm">{t.description || 'S/ Descrição'}</h4>

                          {/* Emblemas DEPOIS do nome nos layouts 1 e 2 */}
                          {layoutPreference !== 'value_right_desc' && (
                            <div className="flex items-center gap-1.5 px-2 shrink-0">
                              {t.status === 'paid' && <CheckCircle2 size={12} className="text-emerald-500" />}
                              {(t.recurrence_enabled || !!t.parent_id) && t.modalidade !== 'parcelada' && <Repeat size={12} className="text-slate-600 stroke-[2.5]" />}
                              {t.auto_confirm && <Zap size={12} className="text-amber-500 fill-amber-500" />}
                            </div>
                          )}
                        </div>

                        {/* Metadados adicionais */}
                        <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 ${layoutPreference === 'value_right_desc' ? 'justify-end' : ''}`}>
                          <p className="text-[10px] font-bold text-slate-400">
                            {t.instanceDate === format(new Date(), 'yyyy-MM-dd') ? 'Hoje' : format(parseISO(t.instanceDate), 'dd/MM/yy')}
                          </p>

                          {t.account && (
                            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 rounded-md">
                              <span className="text-[9px] font-black text-slate-500 uppercase">{t.account.name}</span>
                            </div>
                          )}

                          {t.type === 'transfer' && (
                            <>
                              {t.destination_account && (
                                <>
                                  <ArrowRight size={10} className="text-slate-300" />
                                  <div className="flex items-center gap-1 px-1.5 py-0.5 bg-indigo-50 rounded-md">
                                    <span className="text-[9px] font-black text-indigo-500 uppercase">{t.destination_account.name}</span>
                                  </div>
                                </>
                              )}
                              <div className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 border border-blue-100/50 text-blue-600 rounded-md">
                                <ArrowRightLeft size={10} />
                                <span className="text-[9px] font-black uppercase">Transferência</span>
                              </div>
                            </>
                          )}

                          {t.category && <span className="text-[10px] font-bold text-slate-300">· {t.category.name}</span>}
                          {t.client && (
                            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-sky-50 text-sky-600 border border-sky-100 rounded-md">
                              <User size={10} />
                              <span className="text-[9px] font-bold uppercase">{t.client.name}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* CASO: layoutPreference === 'default' -> VALOR VEM POR ÚLTIMO (DIREITA) */}
                      {layoutPreference === 'default' && (
                        <div className={`shrink-0 w-[130px] ${valueAlignment === 'left' ? 'text-left' : 'text-right'} pl-2.5`}>
                          <p className={`font-black text-sm ${t.type === 'expense' ? 'text-rose-600' : t.type === 'income' ? 'text-emerald-600' : 'text-indigo-600'}`}>
                            {formatTransactionAmount(t.amount, t.type)}
                          </p>
                          {(t as any).runningBalance && !isNaN((t as any).runningBalance) && (
                            <p className="text-[10px] font-medium text-slate-900 bg-slate-100 px-1 py-0.5 rounded border border-slate-200/50 inline-block mt-0.5">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((t as any).runningBalance)}
                            </p>
                          )}
                        </div>
                      )}

                      <div className="relative" ref={openDropdown === dropdownKey ? dropdownRef : null} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                        <button onClick={(e) => handleDropdownClick(e, dropdownKey)} className="p-2 text-slate-600 hover:text-slate-800 transition-colors"><MoreVertical size={20} /></button>
                        {openDropdown === dropdownKey && (
                          <div onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} className={`absolute right-0 w-48 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-[300] ${dropdownDirection === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'}`}>
                            {t.status !== 'paid' && (
                              <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleConfirmAction(t); }} className="w-full px-4 py-2 text-left text-xs font-black text-blue-600 hover:bg-blue-50 flex items-center gap-3"><CheckCircle2 size={14} /> Confirmar</button>
                            )}
                            {t.status === 'paid' && (
                              <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleUnconfirmAction(t); }} className="w-full px-4 py-2 text-left text-xs font-black text-amber-600 hover:bg-amber-50 flex items-center gap-3"><XCircle size={14} /> Desconfirmar</button>
                            )}
                            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleEdit(t); }} className="w-full px-4 py-2 text-left text-xs font-bold hover:bg-slate-50 flex items-center gap-3"><Pencil size={14} /> Editar</button>
                            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleClone(t); }} className="w-full px-4 py-2 text-left text-xs font-bold hover:bg-slate-50 flex items-center gap-3"><Copy size={14} /> Clonar</button>
                            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(t); }} className="w-full px-4 py-2 text-left text-xs font-bold hover:bg-rose-50 text-rose-600 border-t mt-1 pt-2 flex items-center gap-3"><Trash2 size={14} /> Excluir</button>
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

      <FinancialTransactionModalV2 
        isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSuccess={fetchTransactions}
        initialType={modalType} transaction={editingTransaction} isConfirming={isConfirming}
      />

      <QuickEditTransactionModal
        isOpen={isQuickEditOpen}
        onClose={() => setIsQuickEditOpen(false)}
        onSuccess={fetchTransactions}
        transaction={quickEditTransaction}
        isConfirming={quickEditIsConfirming}
      />

      <TransactionSummaryModal
        isOpen={isSummaryModalOpen}
        onClose={() => setIsSummaryModalOpen(false)}
        transaction={selectedSummaryTransaction}
        onEdit={(t) => handleEdit(t)}
      />

      <ShareTransactionsModalV2
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        currentMonth={currentMonth}
        totals={dynamicTotals}
        displayInstances={displayInstances}
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

      {/* Modal de confirmação premium de exclusão de lançamentos únicos */}
      {deleteConfirmModalConfig.isOpen && deleteConfirmModalConfig.transaction && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[999] animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden flex flex-col p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-rose-600 mb-4">
              <div className="p-3 bg-rose-50 rounded-2xl">
                <Trash2 size={24} />
              </div>
              <h3 className="text-lg font-black tracking-tight text-slate-900">Excluir Lançamento</h3>
            </div>
            
            <p className="text-xs text-slate-500 leading-relaxed font-medium mb-6">
              Tem certeza que deseja excluir o lançamento <strong className="text-slate-800 font-extrabold">"{deleteConfirmModalConfig.transaction.description}"</strong> de valor <strong className="text-rose-600 font-extrabold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(deleteConfirmModalConfig.transaction.amount)}</strong>? Esta ação não pode ser desfeita.
            </p>

            <div className="flex justify-end gap-3 border-t border-slate-50 pt-4">
              <button
                onClick={() => setDeleteConfirmModalConfig({ isOpen: false, transaction: null })}
                className="px-5 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-2xl font-bold hover:bg-slate-50 transition-colors text-xs"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmModalConfig.transaction!, 'this', true)}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-bold shadow-lg shadow-rose-500/30 transition-colors text-xs"
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barra de ações em lote flutuante */}
      {selectedTransactionKeys.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[40] w-full max-w-lg px-4 animate-in slide-in-from-bottom duration-300">
          <div className="bg-slate-900/90 backdrop-blur-md text-white rounded-3xl p-4 shadow-2xl border border-white/10 flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-2.5 shrink-0 pl-1">
              <span className="bg-teal-500 text-slate-950 font-black text-xs px-2.5 py-1 rounded-full">
                {selectedTransactionKeys.size}
              </span>
              <span className="text-[11px] font-bold text-slate-300">selecionado(s)</span>
            </div>
            
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-end w-full sm:w-auto">
              <button
                onClick={handleBulkConfirmClick}
                className="flex items-center gap-1.5 bg-teal-500 hover:bg-teal-400 active:scale-95 text-slate-950 px-3.5 py-2 rounded-2xl text-[10px] font-black tracking-wide uppercase transition-all shadow-md shrink-0"
              >
                <CheckCircle2 size={12} /> Confirmar
              </button>
              
              <button
                onClick={handleBulkUnconfirm}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 px-3.5 py-2 rounded-2xl text-[10px] font-black tracking-wide uppercase transition-all shrink-0"
              >
                <RefreshCcw size={12} /> Pendente
              </button>
              
              <button
                onClick={handleBulkDeleteClick}
                className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white px-3.5 py-2 rounded-2xl text-[10px] font-black tracking-wide uppercase transition-all shadow-md shrink-0"
              >
                <Trash2 size={12} /> Excluir
              </button>
              
              <button
                onClick={() => setSelectedTransactionKeys(new Set())}
                className="text-[10px] font-bold text-slate-400 hover:text-white px-2 py-2 transition-colors uppercase shrink-0"
              >
                Limpar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação em Lote */}
      {isBulkConfirmOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[999] animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden flex flex-col p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-teal-600 mb-4">
              <div className="p-3 bg-teal-50 rounded-2xl">
                <CheckCircle2 size={24} />
              </div>
              <h3 className="text-lg font-black tracking-tight text-slate-900">Confirmar Lançamentos</h3>
            </div>
            
            <p className="text-xs text-slate-500 leading-relaxed font-medium mb-6">
              Você selecionou <strong className="text-slate-800 font-extrabold">{selectedTransactionKeys.size}</strong> lançamentos para confirmar. Como deseja definir a data de pagamento?
            </p>

            <div className="space-y-3 mb-6">
              {/* Opção Datas Originais */}
              <div 
                className={`flex items-start gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                  bulkConfirmDateMode === 'original' 
                    ? 'border-teal-500 bg-teal-50/20' 
                    : 'border-slate-100 hover:border-slate-200 bg-white'
                }`}
                onClick={() => setBulkConfirmDateMode('original')}
              >
                <input
                  type="radio"
                  name="bulkConfirmDateMode"
                  checked={bulkConfirmDateMode === 'original'}
                  onChange={() => setBulkConfirmDateMode('original')}
                  className="mt-0.5 text-teal-600 focus:ring-teal-500/30"
                />
                <div>
                  <p className="text-xs font-bold text-slate-800 font-manrope">Datas originais de cada lançamento</p>
                  <p className="text-[10px] text-slate-400 mt-1 font-medium leading-normal">Cada lançamento será confirmado na sua própria data de vencimento correspondente.</p>
                </div>
              </div>

              {/* Opção Data Específica */}
              <div 
                className={`flex flex-col gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                  bulkConfirmDateMode === 'specific' 
                    ? 'border-teal-500 bg-teal-50/20' 
                    : 'border-slate-100 hover:border-slate-200 bg-white'
                }`}
                onClick={() => setBulkConfirmDateMode('specific')}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="bulkConfirmDateMode"
                    checked={bulkConfirmDateMode === 'specific'}
                    onChange={() => setBulkConfirmDateMode('specific')}
                    className="mt-0.5 text-teal-600 focus:ring-teal-500/30"
                  />
                  <div>
                    <p className="text-xs font-bold text-slate-800 font-manrope">Uma data específica para todos</p>
                    <p className="text-[10px] text-slate-400 mt-1 font-medium leading-normal">Todos os lançamentos selecionados serão marcados como pagos na data escolhida.</p>
                  </div>
                </div>

                {bulkConfirmDateMode === 'specific' && (
                  <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="date"
                      value={bulkConfirmSpecificDate}
                      onChange={(e) => setBulkConfirmSpecificDate(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-50 pt-4">
              <button
                onClick={() => setIsBulkConfirmOpen(false)}
                disabled={bulkConfirmLoading}
                className="px-5 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-2xl font-bold hover:bg-slate-50 transition-colors text-xs disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleBulkConfirmSubmit}
                disabled={bulkConfirmLoading}
                className="px-5 py-2.5 bg-[#0d9488] hover:bg-[#0f766e] text-white rounded-2xl font-bold shadow-lg shadow-teal-500/20 transition-colors text-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                {bulkConfirmLoading && <Loader2 size={12} className="animate-spin" />}
                Confirmar Pagamentos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão em Lote */}
      {isBulkDeleteConfirmOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[999] animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden flex flex-col p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-rose-600 mb-4">
              <div className="p-3 bg-rose-50 rounded-2xl">
                <Trash2 size={24} />
              </div>
              <h3 className="text-lg font-black tracking-tight text-slate-900">Excluir Lançamentos em Lote</h3>
            </div>
            
            <p className="text-xs text-slate-500 leading-relaxed font-medium mb-6">
              Tem certeza que deseja excluir os <strong className="text-slate-800 font-extrabold">{selectedTransactionKeys.size}</strong> lançamentos selecionados?
              <br /><span className="text-rose-500 font-bold mt-2 block leading-relaxed">Apenas transações físicas serão excluídas diretamente. Instâncias virtuais de lançamentos recorrentes não alteradas permanecerão intocadas (para exclui-las, faça-o individualmente). Esta ação não pode ser desfeita.</span>
            </p>

            <div className="flex justify-end gap-3 border-t border-slate-50 pt-4">
              <button
                onClick={() => setIsBulkDeleteConfirmOpen(false)}
                disabled={bulkDeleteLoading}
                className="px-5 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-2xl font-bold hover:bg-slate-50 transition-colors text-xs disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleBulkDeleteSubmit}
                disabled={bulkDeleteLoading}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-bold shadow-lg shadow-rose-500/30 transition-colors text-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                {bulkDeleteLoading && <Loader2 size={12} className="animate-spin" />}
                Sim, Excluir Todos
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinancialTransactionsV2;
