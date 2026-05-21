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
  Wallet
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { format, startOfMonth, endOfMonth, addMonths, subMonths, isAfter, isBefore, isSameMonth, parseISO, addDays, addWeeks, addYears, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'react-hot-toast';
import FinancialTransactionModalV2 from '../../components/v2/FinancialTransactionModalV2';
import { ModalOpcaoRecorrente } from '../../components/financeiro/ModalOpcaoRecorrente';
import { deletarTransacao } from '../../lib/financeiro/deletarTransacao';
import { TransactionSummaryModal } from '../../components/v2/TransactionSummaryModal';

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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Estados para exclusão em cadeia
  const [isDeleteScopeModalOpen, setIsDeleteScopeModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<FinancialTransaction | null>(null);

  // Estados para o modal de resumo
  const [selectedSummaryTransaction, setSelectedSummaryTransaction] = useState<any | null>(null);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);

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
      const fetchedAccounts = data || [];
      setAccounts(fetchedAccounts);

      const saved = localStorage.getItem('recebimento_smart_selected_accounts');
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

  const allInstancesUpToMonth = useMemo((): TransactionInstance[] => {
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
          if (isUnpaid && finalInstanceDate < todayStr) {
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
      
      while (isBefore(cursor, maxDate) || isSameDay(cursor, maxDate)) {
        // Respect recurrence_end_date: stop generating after this date
        if (recEndDate && isAfter(cursor, recEndDate)) break;

        const dateStr = format(cursor, 'yyyy-MM-dd');
        // Só gera virtual se não houver registro físico correspondente
        const alreadyHasPhysical = physicalDatesByParent.get(parentId)?.has(dateStr);

        // Se for a data original do pai ou uma virtual que não existe fisicamente
        if (!alreadyHasPhysical || dateStr === t.date) {
          const monthsDiff = (cursor.getFullYear() - tDate.getFullYear()) * 12 + (cursor.getMonth() - tDate.getMonth());
          const currentInst = (t.installment_current || 1) + monthsDiff;

          if (period === 'parcelada' && t.installment_total && currentInst > t.installment_total) {
            break;
          }

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
          if (isUnpaid && finalInstanceDate < todayStr) {
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
    // Para edições de instâncias virtuais, a data exibida no modal deve ser a data da instância original (antes de ser jogada pra hoje)
    const transactionToEdit = { ...t, date: t.originalInstanceDate || t.instanceDate || t.date };
    setEditingTransaction(transactionToEdit);
    setModalType(t.type);
    setIsConfirming(false);
    setIsModalOpen(true);
    setOpenDropdown(null);
  };

  const handleConfirmAction = (t: TransactionInstance) => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const originalDate = t.originalInstanceDate || t.instanceDate || t.date;
    // Se a data original for maior que hoje (futuro), força data de hoje, senão mantém original
    const dateToSet = originalDate > todayStr ? todayStr : originalDate;

    const transactionToEdit = { ...t, date: dateToSet };
    setEditingTransaction(transactionToEdit);
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

  const handleDelete = async (t: TransactionInstance, scope: 'this' | 'following' | 'all' = 'this') => {
    const isRecurring = t.modalidade === 'recorrente' || t.modalidade === 'parcelada' || !!t.parent_id || t.recurrence_enabled;
    
    if (isRecurring && !isDeleteScopeModalOpen && scope === 'this') {
      setItemToDelete(t);
      setIsDeleteScopeModalOpen(true);
      setOpenDropdown(null);
      return;
    }

    try {
      const { error } = await deletarTransacao({
        transactionId: t.id,
        scope,
        instanceDate: t.originalInstanceDate || t.instanceDate || t.date,
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
         const cardTrans = allInstancesUpToMonth.filter(t => t.account_id === card.id && t.type === 'expense' && t.status !== 'cancelled');
         
         // Group by invoice_month
         const byMonth = new Map<string, number>();
         for (const ct of cardTrans) {
            const m = ct.invoice_month;
            if (m) {
               byMonth.set(m, (byMonth.get(m) || 0) + Number(ct.amount));
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
      
      if (existing) {
        existing.total += amount;
      } else {
        const card = creditCardAccounts.find(c => c.id === t.account_id);
        invoiceMap.set(t.account_id!, {
          cardName: card?.name || t.account?.name || 'Cartão',
          linkedAccountName: card?.linkedAccountName || null,
          invoicePaymentAccountId: card?.invoice_payment_account_id || null,
          total: amount,
          dueDay: card?.due_day || null,
        });
      }
    }

    return Array.from(invoiceMap.entries()).map(([accountId, data]) => {
      const dueDay = data.dueDay || 1;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const safeDay = Math.min(dueDay, lastDay);
      const instanceDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;

      // Check if bill is paid
      const isPaid = transactions.some(t => 
        t.destination_account_id === accountId && 
        t.type === 'transfer' && 
        t.invoice_month === currentMonthStr &&
        t.status !== 'cancelled'
      );

      return {
        id: `invoice-${accountId}-${currentMonthStr}`,
        type: 'expense' as const,
        amount: data.total,
        date: instanceDate,
        description: `Fatura ${data.cardName}`,
        status: isPaid ? ('paid' as const) : ('pending' as const),
        account_id: accountId,
        instanceDate,
        isVirtual: true,
        isInvoiceSummary: true,
        invoiceData: {
          cardId: accountId,
          cardName: data.cardName,
          linkedAccountName: data.linkedAccountName,
          invoicePaymentAccountId: data.invoicePaymentAccountId,
          total: data.total,
          isPaid,
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
    const filtered = monthInstances.filter(t => {
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
      const dateCompare = a.instanceDate.localeCompare(b.instanceDate);
      if (dateCompare !== 0) return dateCompare;

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
         if (!t.invoiceData?.isPaid) {
            runningBalance -= t.amount;
         }
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
  }, [monthInstances, selectedAccountIds, filter, searchTerm, totals.confirmed, currentMonth, invoiceInstances]);

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
                <p className="text-[10px] font-bold text-slate-500">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(acc.projected)}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
          <div className="flex flex-col"><span className="text-[10px] font-black opacity-40 uppercase">Total</span></div>
          <div className="text-right">
            <p className="text-lg font-black">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.confirmed)}</p>
            <p className="text-[10px] font-bold opacity-70">Proj: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.projected)}</p>
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
              <p className="text-lg font-black">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.income + totals.transfersIn)}</p>
            </div>
            <div>
              <span className="text-[10px] uppercase font-black text-white/50">Gastos</span>
              <p className="text-lg font-black">-{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.expense + totals.transfersOut)}</p>
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
    <div className="bg-slate-50 min-h-screen flex flex-col">
      {/* ===== MOBILE LAYOUT ===== */}
      <div className="lg:hidden flex flex-col min-h-screen">
        {/* Mobile Header: Resumo + Busca + Criar */}
        <div className="sticky top-0 z-50 bg-white border-b border-slate-100 px-3 pt-3 pb-2 space-y-2">
          {/* Linha 1: Hamburger Resumo + Saldo + Botão Criar */}
          <div className="flex items-center justify-between">
            <button onClick={() => setIsSidebarOpen(true)} className="flex items-center gap-2">
              <div className="flex flex-col gap-[3px] w-4"><div className="h-[2px] w-full bg-slate-600" /><div className="h-[2px] w-full bg-slate-600" /><div className="h-[2px] w-full bg-slate-600" /></div>
              <span className="text-xs font-black text-slate-800">Resumo</span>
            </button>
            <span className="text-sm font-black text-slate-800">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.confirmed)}</span>
            <button
              onClick={() => { setModalType('expense'); setEditingTransaction(null); setIsModalOpen(true); }}
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
                    <div className="w-2 h-2 rounded-full shrink-0 bg-slate-300" />
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
                  <div key={dropdownKey} className={`flex items-center gap-2 px-3 py-1.5 border-b border-slate-100 bg-gradient-to-r from-amber-50/60 to-orange-50/40`}>
                    <div className="w-2 h-2 rounded-full shrink-0 bg-amber-500" />
                    <span className="text-[10px] font-bold text-slate-400 shrink-0 w-[52px]">
                      {t.instanceDate === format(new Date(), 'yyyy-MM-dd') ? 'Hoje' : format(parseISO(t.instanceDate), 'dd/MM/yy')}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <CreditCard size={12} className="text-amber-600 shrink-0" />
                        <span className="font-black text-xs text-slate-800 truncate">{t.description}</span>
                      </div>
                      {t.invoiceData?.linkedAccountName && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[8px] font-black text-slate-400 uppercase">{t.invoiceData.linkedAccountName}</span>
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-medium text-xs text-amber-700">
                        -{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.amount)}
                      </p>
                    </div>
                    <div className="relative shrink-0" ref={openDropdown === dropdownKey ? dropdownRef : null}>
                      <button onClick={() => setOpenDropdown(openDropdown === dropdownKey ? null : dropdownKey)} className="p-1 text-slate-600 hover:text-slate-800 transition-colors"><MoreVertical size={16} /></button>
                      {openDropdown === dropdownKey && (
                        <div className={`absolute right-0 w-44 bg-white rounded-xl shadow-2xl border border-slate-100 py-1.5 z-[300] ${index >= displayInstances.length - 3 ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
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
                  onClick={() => { setSelectedSummaryTransaction(t); setIsSummaryModalOpen(true); }}
                  className={`flex items-center gap-2 px-3 py-2 border-b border-slate-50 cursor-pointer hover:bg-slate-100/50 transition-colors ${isEven ? 'bg-white' : 'bg-slate-50/30'}`}
                >
                  {/* Status dot */}
                  <div className={`w-2 h-2 rounded-full shrink-0 ${status === 'paid' ? 'bg-emerald-500' : status === 'overdue' ? 'bg-rose-500' : 'bg-amber-400'}`} />
                  {/* Data */}
                  <span className="text-[10px] font-bold text-slate-400 shrink-0 w-[52px]">
                    {t.instanceDate === format(new Date(), 'yyyy-MM-dd') ? 'Hoje' : format(parseISO(t.instanceDate), 'dd/MM/yy')}
                  </span>
                  {/* Descrição + badges */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-xs text-slate-800 truncate">{t.description || 'S/ Descrição'}</span>
                      {(t.recurrence_enabled || !!t.parent_id) && t.modalidade !== 'parcelada' && <Repeat size={10} className="text-slate-400/60 shrink-0" />}

                    </div>
                    {(t.account || t.category || t.client || t.type === 'transfer') && (
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
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
                  {/* Valor + Saldo */}
                  <div className="text-right shrink-0">
                    <p className={`font-medium text-xs ${t.type === 'expense' ? 'text-rose-600' : t.type === 'income' ? 'text-emerald-600' : 'text-indigo-600'}`}>
                      {t.type === 'expense' ? '-' : ''}{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.amount)}
                    </p>
                    {(t as any).runningBalance && !isNaN((t as any).runningBalance) && (
                      <p className="text-[9px] font-medium text-slate-900 bg-slate-100 px-1 py-0.5 rounded border border-slate-200/50 inline-block mt-0.5">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((t as any).runningBalance)}
                      </p>
                    )}
                  </div>
                  {/* Menu */}
                  <div className="relative shrink-0" ref={openDropdown === dropdownKey ? dropdownRef : null} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                    <button onClick={(e) => { e.stopPropagation(); setOpenDropdown(openDropdown === dropdownKey ? null : dropdownKey); }} className="p-1 text-slate-600 hover:text-slate-800 transition-colors"><MoreVertical size={16} /></button>
                    {openDropdown === dropdownKey && (
                      <div onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} className={`absolute right-0 w-44 bg-white rounded-xl shadow-2xl border border-slate-100 py-1.5 z-[300] ${index >= displayInstances.length - 3 ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                        {t.status !== 'paid' && (
                          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleConfirmAction(t); }} className="w-full px-3 py-1.5 text-left text-[11px] font-black text-blue-600 hover:bg-blue-50 flex items-center gap-2"><CheckCircle2 size={12} /> Confirmar</button>
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
      <div className="hidden lg:flex flex-1 max-w-[1700px] mx-auto w-full p-6 gap-6 items-start">
        {/* Sidebar - Fixa */}
        <aside className="w-[360px] flex-shrink-0 sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto no-scrollbar">
          <SidebarContent />
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col space-y-6 min-w-0">
          {/* Header da Lista (Fixo) */}
          <div className="flex flex-col xl:flex-row gap-4 justify-between shrink-0">
            <div className="flex-1 relative group">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input
                type="text" placeholder="Filtrar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-14 pr-12 py-4 bg-white border border-slate-200 rounded-3xl font-bold shadow-sm"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                >
                  <X size={18} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={fetchTransactions} disabled={loading} className={`p-4 bg-white border border-slate-200 rounded-3xl shadow-sm ${loading ? 'animate-spin' : ''}`}><RefreshCcw size={20} /></button>
            </div>
          </div>

          {/* Listagem */}
          <div className="flex flex-col">
            <div className="px-4 py-3 border-b border-slate-200 bg-transparent flex flex-row items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-black">Transações</h2>
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
                      <div key={dropdownKey} className="group flex items-center gap-4 px-4 py-2 bg-gradient-to-r from-amber-50/80 to-orange-50/50 border-b border-amber-100/50">
                        <div className="p-2 rounded-xl shrink-0 bg-amber-100 text-amber-600">
                          <CreditCard size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full shrink-0 bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]" />
                            <h4 className="font-black text-slate-800 text-sm">{t.description}</h4>
                          </div>
                          <div className="flex items-center gap-x-3 mt-1">
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
                        <div className="text-right shrink-0">
                          <p className="font-medium text-base text-amber-700">
                            -{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.amount)}
                          </p>
                          <p className={`text-[10px] font-bold ${t.runningBalance !== undefined && t.runningBalance >= 0 ? 'text-emerald-500/70' : 'text-rose-500/70'}`}>
                             {t.runningBalance !== undefined && !isNaN(t.runningBalance) 
                                ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.runningBalance) 
                                : 'Fatura consolidada'}
                          </p>
                        </div>
                        <div className="relative" ref={openDropdown === dropdownKey ? dropdownRef : null}>
                          <button onClick={() => setOpenDropdown(openDropdown === dropdownKey ? null : dropdownKey)} className="p-2 text-slate-600 hover:text-slate-800 transition-colors"><MoreVertical size={20} /></button>
                          {openDropdown === dropdownKey && (
                            <div className={`absolute right-0 w-48 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-[300] ${displayInstances.indexOf(t) >= displayInstances.length - 3 ? 'bottom-full mb-2' : 'top-full mt-2'}`}>
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
                      className={`flex items-center gap-2 px-3 py-1.5 transition-colors cursor-pointer border-b border-slate-100 ${isEven ? 'bg-white' : 'bg-slate-50/30'}`}
                    >
                      <div className={`p-1.5 rounded-lg shrink-0 ${t.type === 'income' ? 'bg-emerald-50 text-emerald-600' : t.type === 'expense' ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600'}`}>
                        {t.type === 'income' ? <Plus size={16} /> : t.type === 'expense' ? <ArrowDownCircle size={16} /> : <ArrowRightLeft size={16} />}
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

                          {t.category && (
                            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-50 border border-slate-100 rounded-md">
                              <span className="text-[9px] font-bold text-slate-400">{t.category.name}</span>
                            </div>
                          )}

                          {t.client && (
                            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-sky-50 border border-sky-100/50 rounded-md text-sky-600">
                              <User size={10} />
                              <span className="text-[9px] font-bold">{t.client.name}</span>
                            </div>
                          )}


                        </div>
                      </div>

                      <div className="text-right shrink-0">
                      <p className={`font-medium text-base ${t.type === 'expense' ? 'text-rose-600' : t.type === 'income' ? 'text-emerald-600' : 'text-indigo-600'}`}>
                          {t.type === 'expense' ? '-' : ''}{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.amount)}
                        </p>
                        <p className="text-[10px] font-medium text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/50 inline-block mt-0.5">
                           {(t as any).runningBalance && !isNaN((t as any).runningBalance) ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((t as any).runningBalance) : ''}
                        </p>
                      </div>

                      <div className="relative" ref={openDropdown === dropdownKey ? dropdownRef : null} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                        <button onClick={(e) => { e.stopPropagation(); setOpenDropdown(openDropdown === dropdownKey ? null : dropdownKey); }} className="p-2 text-slate-600 hover:text-slate-800 transition-colors"><MoreVertical size={20} /></button>
                        {openDropdown === dropdownKey && (
                          <div onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} className={`absolute right-0 w-48 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-[300] ${displayInstances.indexOf(t) >= displayInstances.length - 3 ? 'bottom-full mb-2' : 'top-full mt-2'}`}>
                            {t.status !== 'paid' && (
                              <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleConfirmAction(t); }} className="w-full px-4 py-2 text-left text-xs font-black text-blue-600 hover:bg-blue-50 flex items-center gap-3"><CheckCircle2 size={14} /> Confirmar</button>
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

      <TransactionSummaryModal
        isOpen={isSummaryModalOpen}
        onClose={() => setIsSummaryModalOpen(false)}
        transaction={selectedSummaryTransaction}
        onEdit={(t) => handleEdit(t)}
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
