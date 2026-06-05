import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, CalendarDays, Pencil, Search,
  MoreVertical, Trash2, CheckCircle2, CreditCard,
  ChevronDown, Repeat,
  Plus, ArrowRight
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { format, endOfMonth, addMonths, subMonths, subDays, setDate, parseISO, isBefore, isAfter, isSameMonth, addDays, addWeeks, addYears, isSameDay, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'react-hot-toast';
import FinancialTransactionModalV2 from '../../components/v2/FinancialTransactionModalV2';
import CloseBillModal from '../../components/v2/CloseBillModal';
import ConfirmModal from '../../components/v2/ConfirmModal';
import { ModalOpcaoRecorrente } from '../../components/financeiro/ModalOpcaoRecorrente';
import { deletarTransacao } from '../../lib/financeiro/deletarTransacao';
import { BRAZILIAN_BANKS } from '../../constants/banks';

interface Account {
  id: string;
  name: string;
  type: string;
  initial_balance: number;
  credit_limit: number | null;
  closing_day: number | null;
  due_day: number | null;
  is_active: boolean;
  limit_type?: string | null;
  first_invoice_due_date?: string | null;
  closing_days_before?: number | null;
  invoice_payment_account_id?: string | null;
  main_card_name?: string | null;
  secondary_cards?: string[] | null;
  bank_name?: string | null;
  bank_icon?: string | null;
  card_brand?: string | null;
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
  account_id?: string;
  destination_account_id?: string;
  category_id?: string;
  client_id?: string;
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
  // Card holder fields from the view
  card_holder_name?: string | null;
  invoice_month?: string | null;
}

interface TransactionInstance extends FinancialTransaction {
  instanceDate: string;
  isVirtual: boolean;
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);



const CardIcon = ({ card, size = 20 }: { card: Account | null | undefined; size?: number }) => {
  if (!card) return <CreditCard size={size} className="text-purple-600 shrink-0" />;

  if (card.bank_icon) {
    return (
      <div style={{ width: size, height: size }} className="rounded-md border border-slate-200 overflow-hidden shrink-0 relative bg-white flex items-center justify-center">
        <img 
          src={`https://www.google.com/s2/favicons?domain=${card.bank_icon}&sz=64`} 
          alt={card.bank_name || ''} 
          className="w-full h-full object-cover"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.classList.add('hidden');
            if (target.nextElementSibling) {
              target.nextElementSibling.classList.remove('hidden');
            }
          }}
        />
        <div className="hidden absolute inset-0 flex items-center justify-center font-bold text-white leading-none uppercase" style={{ width: size, height: size, fontSize: `${Math.max(6, Math.floor(size * 0.4))}px`, backgroundColor: BRAZILIAN_BANKS.find(b => b.domain === card.bank_icon)?.color || '#94a3b8' }}>
          {card.bank_name?.charAt(0) || <CreditCard size={size * 0.6} />}
        </div>
      </div>
    );
  }

  return <CreditCard size={size} className="text-purple-600 shrink-0" />;
};

const CreditCardV2 = () => {
  const { user } = useAuth();
  const [cards, setCards] = useState<Account[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(startOfDay(new Date()));
  const [searchTerm, setSearchTerm] = useState('');
  const [searchParams] = useSearchParams();
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
    if (spaceBelow < 130) {
      setDropdownDirection('up');
    } else {
      setDropdownDirection('down');
    }
    setOpenDropdown(dropdownKey);
  };
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isCardDropdownOpen, setIsCardDropdownOpen] = useState(false);
  const [hasInitializedParams, setHasInitializedParams] = useState(false);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'income' | 'expense' | 'transfer'>('expense');
  const [editingTransaction, setEditingTransaction] = useState<FinancialTransaction | null>(null);
  const [isDeleteScopeModalOpen, setIsDeleteScopeModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<FinancialTransaction | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const [isCloseBillModalOpen, setIsCloseBillModalOpen] = useState(false);
  const [isReopenConfirmOpen, setIsReopenConfirmOpen] = useState(false);

  const today = new Date();
  const selectedCard = cards.find(c => c.id === selectedCardId) || null;

  // Compute smart "current month" for a card
  const getSmartCurrentMonth = (card: Account | null): Date => {
    if (!card?.due_day) return startOfDay(new Date());
    const now = startOfDay(new Date());
    return now.getDate() >= card.due_day ? addMonths(now, 1) : now;
  };

  // Fetch credit cards
  const fetchCards = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('financial_accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('type', 'credit_card')
      .eq('is_active', true)
      .order('name');
    const cardList = (data as Account[]) || [];
    setCards(cardList);
    
    if (!hasInitializedParams) {
      const initialCardId = searchParams.get('cardId');
      const initialMonth = searchParams.get('month'); // format: yyyy-MM
      
      const foundCard = cardList.find(c => c.id === initialCardId);
      if (foundCard) {
        setSelectedCardId(foundCard.id);
        if (initialMonth) {
          const [year, month] = initialMonth.split('-');
          setCurrentMonth(new Date(parseInt(year), parseInt(month) - 1, 1));
        } else {
          setCurrentMonth(getSmartCurrentMonth(foundCard));
        }
      } else if (cardList.length > 0 && !selectedCardId) {
        setSelectedCardId(cardList[0].id);
        setCurrentMonth(getSmartCurrentMonth(cardList[0]));
      }
      setHasInitializedParams(true);
    }
  };

  // Fetch all transactions
  const fetchTransactions = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('v_financial_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: true });
      if (error) throw error;
      const mapped = (data || []).map((t: any) => ({
        ...t,
        account: t.account_name ? { name: t.account_name, type: t.account_type } : null,
        destination_account: t.destination_account_name ? { name: t.destination_account_name, type: t.destination_account_type } : null,
        client: t.client_name ? { name: t.client_name } : null,
        category: t.category_name ? { name: t.category_name, icon: t.category_icon, parent_id: t.category_parent_id } : null,
      }));
      setTransactions(mapped);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar transações');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCards(); fetchTransactions(); }, [user]);

  // Sincroniza dinamicamente o cartão selecionado quando os parâmetros de busca da URL mudarem
  useEffect(() => {
    const cardId = searchParams.get('cardId');
    const month = searchParams.get('month');
    if (cardId && cards.length > 0) {
      const foundCard = cards.find(c => c.id === cardId);
      if (foundCard) {
        setSelectedCardId(foundCard.id);
        if (month) {
          const [year, m] = month.split('-');
          setCurrentMonth(new Date(parseInt(year), parseInt(m) - 1, 1));
        } else {
          setCurrentMonth(getSmartCurrentMonth(foundCard));
        }
      }
    }
  }, [searchParams, cards]);

  // When card changes, update smart month
  useEffect(() => {
    if (selectedCard && hasInitializedParams) {
      // Check if we are changing cards through user click vs initial load
      // Since we only want to auto-change month when user selects a different card manually
      // We can rely on the fact that initialCard is handled in fetchCards.
      // But we need to make sure we don't override the month right after initial load.
      // A safe way is to only update if it's not the initial mount.
      // We can use a ref to track if it's the first render.
    }
  }, [selectedCardId]);

  // Handle manual card change via select
  const handleCardChange = (card: Account) => {
    setSelectedCardId(card.id);
    setCurrentMonth(getSmartCurrentMonth(card));
    setIsCardDropdownOpen(false);
  };

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Invoice period calculation
  const invoicePeriod = useMemo(() => {
    if (!selectedCard?.due_day || !selectedCard?.closing_days_before) return null;
    const dueDay = selectedCard.due_day;
    const closingDaysBefore = selectedCard.closing_days_before;

    // Vencimento do mês selecionado
    const dueDate = startOfDay(setDate(currentMonth, Math.min(dueDay, 28)));
    // Fechamento = vencimento - closing_days_before
    const closingDate = startOfDay(subDays(dueDate, closingDaysBefore));
    const endDate = startOfDay(subDays(closingDate, 1));
    // Início = fechamento do mês anterior (dia do fechamento cai nesta nova fatura)
    const prevDueDate = startOfDay(setDate(subMonths(currentMonth, 1), Math.min(dueDay, 28)));
    const prevClosingDate = startOfDay(subDays(prevDueDate, closingDaysBefore));
    const startDate = prevClosingDate;

    return { startDate, closingDate, dueDate, endDate };
  }, [selectedCard, currentMonth]);

  // Filter transactions for this card + invoice period
  const cardInstances = useMemo((): TransactionInstance[] => {
    if (!selectedCardId) return [];

    const instances: TransactionInstance[] = [];
    const cardTransactions = transactions.filter(t => t.account_id === selectedCardId);

    // Build set of physical dates and indices per parent
    const physicalDatesByParent = new Map<string, Set<string>>();
    const physicalIndicesByParent = new Map<string, Set<number>>();
    for (const t of cardTransactions) {
      const parentId = t.parent_id || t.id;
      if (!physicalDatesByParent.has(parentId)) physicalDatesByParent.set(parentId, new Set());
      physicalDatesByParent.get(parentId)!.add(t.date);

      // CRUCIAL: Adicionamos ao índice de parcelas físicas APENAS se for um filho físico (t.parent_id !== null).
      // Isso nos permite detectar quando uma ocorrência específica foi desmembrada por edição de escopo 'somente este'.
      if (t.parent_id && t.installment_current !== null && t.installment_current !== undefined) {
        if (!physicalIndicesByParent.has(parentId)) physicalIndicesByParent.set(parentId, new Set());
        physicalIndicesByParent.get(parentId)!.add(t.installment_current);
      }
    }

    for (const t of cardTransactions) {
      // Skip cancelled records — they are blockers, not displayable items
      if (t.status === 'cancelled') continue;

      const tDate = parseISO(t.date);

      if (!t.recurrence_enabled) {
        const matchesInvoice = t.invoice_month
          ? t.invoice_month === currentInvoiceMonthString
          : (invoicePeriod
              ? (!isBefore(tDate, invoicePeriod.startDate) && !isAfter(tDate, invoicePeriod.endDate))
              : isSameMonth(tDate, currentMonth));

        if (matchesInvoice) {
          instances.push({ ...t, instanceDate: t.date, isVirtual: false });
        }
        continue;
      }

      const interval = t.recurrence_interval || 1;
      const period = t.recurrence_period || 'monthly';
      const recEndDate = t.recurrence_end_date ? parseISO(t.recurrence_end_date) : null;
      const absMax = addYears(today, 5);
      let cursor = new Date(tDate);
      const parentId = t.id;
      let occurrenceIndex = 0;

      while (isBefore(cursor, absMax)) {
        // Respect recurrence_end_date
        if (recEndDate && isAfter(cursor, recEndDate)) break;

        const dateStr = format(cursor, 'yyyy-MM-dd');
        const currentInst = (t.installment_current || 1) + occurrenceIndex;

        // Checar por índice sequencial e por data (fallback)
        const hasPhysicalByIndex = physicalIndicesByParent.get(parentId)?.has(currentInst);
        const hasPhysicalByDate = physicalDatesByParent.get(parentId)?.has(dateStr);
        const alreadyHasPhysical = hasPhysicalByIndex || hasPhysicalByDate;

        const cursorDate = parseISO(dateStr);

        let inPeriod = false;
        if (dateStr === t.date && t.invoice_month) {
          inPeriod = t.invoice_month === currentInvoiceMonthString;
        } else {
          if (invoicePeriod) {
            inPeriod = !isBefore(cursorDate, invoicePeriod.startDate) && !isAfter(cursorDate, invoicePeriod.endDate);
          } else {
            inPeriod = isSameMonth(cursorDate, currentMonth);
          }
        }

        // Se for a data original do pai (e não houver filho físico desmembrado para esse mesmo índice)
        // ou uma virtual que não existe fisicamente.
        if (inPeriod && (!alreadyHasPhysical || (dateStr === t.date && !hasPhysicalByIndex))) {
          instances.push({
            ...t,
            instanceDate: dateStr,
            isVirtual: dateStr !== t.date,
            installment_current: currentInst,
          });
        }

        if (invoicePeriod && isAfter(cursor, invoicePeriod.endDate)) break;
        if (!invoicePeriod && isAfter(cursor, endOfMonth(currentMonth))) break;

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

    return instances.sort((a, b) => new Date(a.instanceDate).getTime() - new Date(b.instanceDate).getTime());
  }, [transactions, selectedCardId, currentMonth, invoicePeriod]);

  // Checar se a fatura atual está fechada (existe uma transferência agendada/paga para ela com o invoice_month correspondente)
  const currentInvoiceMonthString = format(currentMonth, 'yyyy-MM');
  const billPaymentTransaction = useMemo(() => {
    if (!selectedCardId) return null;
    return transactions.find(t => 
      t.destination_account_id === selectedCardId && 
      t.type === 'transfer' && 
      t.invoice_month === currentInvoiceMonthString
    ) || null;
  }, [transactions, selectedCardId, currentInvoiceMonthString]);

  const isBillClosed = !!billPaymentTransaction;

  const handleReopenBill = async () => {
    if (!billPaymentTransaction) return;
    try {
      const { error } = await supabase.from('financial_transactions').delete().eq('id', billPaymentTransaction.id);
      if (error) throw error;
      toast.success('Fatura reaberta com sucesso!');
      fetchTransactions();
      setIsReopenConfirmOpen(false);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao reabrir fatura.');
    }
  };

  // Display instances with search filter
  const displayInstances = useMemo(() => {
    return cardInstances.filter(t => {
      const matchesSearch = !searchTerm || t.description?.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSearch;
    });
  }, [cardInstances, searchTerm]);

  // Invoice summary
  const invoiceSummary = useMemo(() => {
    const allExpenses = cardInstances.reduce((sum, t) => sum + (t.type === 'expense' ? t.amount : 0), 0);
    // Fixed expenses: recurrence_enabled
    const fixed = cardInstances.filter(t => t.recurrence_enabled && t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    // Installments
    const installments = cardInstances.filter(t => t.modalidade === 'parcelada').reduce((sum, t) => sum + t.amount, 0);

    return {
      total: allExpenses,
      fixed,
      installments,
    };
  }, [cardInstances]);

  const monthLabel = format(currentMonth, "MMMM 'de' yyyy", { locale: ptBR });

  const handleResetMonth = () => {
    setCurrentMonth(getSmartCurrentMonth(selectedCard));
  };

  const isInvoiceOverdue = useMemo(() => {
    if (!invoicePeriod) return false;
    const todayDate = new Date();
    const isPastDue = isBefore(invoicePeriod.dueDate, todayDate) && !isSameDay(invoicePeriod.dueDate, todayDate);
    if (!isPastDue) return false;
    if (billPaymentTransaction) {
      return billPaymentTransaction.status !== 'paid';
    }
    return true;
  }, [invoicePeriod, billPaymentTransaction]);

  const statusDot: Record<string, string> = {
    default: 'bg-slate-300',
    overdue: 'bg-rose-500',
  };

  // Handlers

  const handleDeleteTransaction = async (scope: 'this' | 'following' | 'all') => {
    if (!itemToDelete) return;
    try {
      await deletarTransacao({
        transactionId: itemToDelete.id,
        scope,
        instanceDate: (itemToDelete as any).instanceDate || itemToDelete.date,
        installmentCurrent: (itemToDelete as any).installment_current,
      });
      toast.success('Lançamento excluído!');
      setIsDeleteScopeModalOpen(false);
      setItemToDelete(null);
      fetchTransactions();
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    }
  };

  // Group by card holder
  const groupedByHolder = useMemo(() => {
    if (!selectedCard) return [];

    const holders = new Map<string, TransactionInstance[]>();
    const mainName = selectedCard.main_card_name || selectedCard.name;

    for (const t of displayInstances) {
      const holderName = t.card_holder_name || mainName;
      if (!holders.has(holderName)) holders.set(holderName, []);
      holders.get(holderName)!.push(t);
    }

    // Main card first, then secondary
    const result: { holder: string; items: TransactionInstance[] }[] = [];
    if (holders.has(mainName)) {
      result.push({ holder: mainName, items: holders.get(mainName)! });
      holders.delete(mainName);
    }
    for (const [holder, items] of holders) {
      result.push({ holder, items });
    }
    // If no grouping, just show all
    if (result.length === 0 && displayInstances.length > 0) {
      result.push({ holder: mainName, items: displayInstances });
    }
    return result;
  }, [displayInstances, selectedCard]);

  // Transaction row component
  const TransactionRow = ({ t }: { t: TransactionInstance }) => {
    const visualStatus = isInvoiceOverdue ? 'overdue' : 'default';
    return (
      <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors group border-b border-slate-50 last:border-0">
        <div className={`w-2 h-2 rounded-full shrink-0 ${statusDot[visualStatus]}`} />
        <span className="text-xs text-slate-400 font-mono w-[70px] shrink-0">
          {format(parseISO(t.instanceDate), 'dd/MM/yy')}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{t.description}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            {t.category && (
              <span className="text-[10px] text-slate-400">{t.category.icon} {t.category.name}</span>
            )}
            {t.tags && t.tags.length > 0 && t.tags.map(({ tag }) => (
              <span key={tag.id} className="text-[9px] px-1.5 py-0.5 rounded-md font-bold text-white" style={{ backgroundColor: tag.color }}>{tag.name}</span>
            ))}
          </div>
        </div>
        {t.modalidade === 'parcelada' && t.installment_total && (
          <span className="text-[10px] text-slate-400 font-mono shrink-0">{t.installment_current}/{t.installment_total}</span>
        )}
        {t.recurrence_enabled && t.modalidade === 'recorrente' && (
          <Repeat size={12} className="text-indigo-400 shrink-0" />
        )}
        <span className={`text-sm font-bold tabular-nums shrink-0 ${t.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
          {t.type === 'expense' ? '-' : ''}{formatCurrency(t.amount)}
        </span>
        <div className="relative" ref={openDropdown === t.id + t.instanceDate ? dropdownRef : null}>
          <button
            onClick={(e) => handleDropdownClick(e, t.id + t.instanceDate)}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <MoreVertical size={14} />
          </button>
          {openDropdown === t.id + t.instanceDate && (
            <div className={`absolute right-0 w-44 bg-white rounded-xl shadow-xl border border-slate-100 py-1 z-30 ${dropdownDirection === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
              <button onClick={() => { setEditingTransaction(t); setModalType(t.type); setIsModalOpen(true); setOpenDropdown(null); }} className="flex items-center gap-2 w-full px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 transition-colors">
                <Pencil size={14} /> Editar
              </button>
              <button onClick={() => { setItemToDelete(t); if (t.recurrence_enabled || t.parent_id) { setIsDeleteScopeModalOpen(true); } else { if (confirm('Excluir este lançamento?')) { deletarTransacao({ transactionId: t.id, scope: 'this', instanceDate: t.instanceDate || t.date, installmentCurrent: t.installment_current }).then(() => { toast.success('Excluído!'); fetchTransactions(); }); } } setOpenDropdown(null); }} className="flex items-center gap-2 w-full px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 transition-colors">
                <Trash2 size={14} /> Excluir
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (cards.length === 0 && !loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="text-center space-y-4">
          <CreditCard size={48} className="text-slate-300 mx-auto" />
          <h2 className="text-xl font-bold text-slate-600">Nenhum cartão cadastrado</h2>
          <p className="text-sm text-slate-400">Cadastre um cartão de crédito na tela de <a href="/v2/financeiro/contas" className="text-teal-600 font-bold hover:underline">Contas</a>.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 h-screen overflow-hidden flex flex-col">
      {/* ===== MOBILE LAYOUT ===== */}
      <div className="lg:hidden flex flex-col h-full overflow-hidden">
        {/* Mobile Header */}
        <div className="shrink-0 bg-white border-b border-slate-100 px-3 pt-3 pb-2 space-y-2">
          {/* Card selector + month */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <button
                onClick={() => setIsCardDropdownOpen(!isCardDropdownOpen)}
                className="w-full flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl text-sm font-bold text-slate-800"
              >
                <CardIcon card={selectedCard} size={18} />
                <span className="truncate">{selectedCard?.name || 'Selecione'}</span>
                <ChevronDown size={14} className="ml-auto text-slate-400" />
              </button>
              {isCardDropdownOpen && (
                <div className="absolute z-30 mt-1 w-full bg-white rounded-xl shadow-xl border border-slate-100 py-1">
                  {cards.map(c => (
                    <button 
                      key={c.id} 
                      onClick={() => handleCardChange(c)} 
                      className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-sm hover:bg-slate-50 transition-colors ${c.id === selectedCardId ? 'font-bold text-purple-600 bg-purple-50' : 'text-slate-700'}`}
                    >
                      <CardIcon card={c} size={16} />
                      <span className="truncate">{c.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
               onClick={() => { setModalType('expense'); setEditingTransaction(null); setIsModalOpen(true); }}
               className="flex items-center gap-1.5 bg-[#0d9488] text-white px-3 py-2 rounded-xl text-[9px] font-black shadow-md hover:bg-[#0f766e] transition-all uppercase tracking-wider shrink-0"
             >
               <Plus size={12} /> Criar
            </button>
          </div>
          {/* Month navigation */}
          <div className="flex items-center justify-between bg-slate-50 rounded-xl px-1 py-1">
            <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1.5 hover:bg-white rounded-lg transition-all active:scale-90">
              <ChevronLeft size={18} className="text-slate-600" />
            </button>
            <span className="text-xs font-black text-slate-700 capitalize">{monthLabel}</span>
            <div className="flex items-center gap-1">
              <button onClick={handleResetMonth} className="p-1.5 hover:bg-white rounded-lg transition-all active:scale-90" title="Mês atual">
                <CalendarDays size={14} className="text-slate-500" />
              </button>
              <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1.5 hover:bg-white rounded-lg transition-all active:scale-90">
                <ChevronRight size={18} className="text-slate-600" />
              </button>
            </div>
          </div>
          {/* Filter bar removed as we have no conciliation */}
        </div>

        {/* Mobile: Invoice summary card */}
        <div className="shrink-0 px-3 py-2 bg-purple-50 border-b border-purple-100">
          <div className="flex items-center justify-between text-xs">
            <span className="text-purple-600 font-bold">Fatura</span>
            <span className={`font-black ${invoiceSummary.total > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
              {formatCurrency(invoiceSummary.total)}
            </span>
          </div>
        </div>

        {/* Mobile List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-12 text-center text-slate-400 italic">Carregando...</div>
          ) : displayInstances.length === 0 ? (
            <div className="py-12 text-center text-slate-400 italic">Nenhum lançamento neste período.</div>
          ) : (
            displayInstances.map(t => <TransactionRow key={t.id + t.instanceDate} t={t} />)
          )}
        </div>
      </div>

      {/* ===== DESKTOP LAYOUT ===== */}
      <div className="hidden lg:flex h-full gap-0 overflow-hidden">
        {/* Sidebar */}
        <div className="w-[340px] shrink-0 bg-white border-r border-slate-100 flex flex-col h-full overflow-y-auto">
          {/* Card Selector */}
          <div className="p-4 border-b border-slate-100 space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <button
                  onClick={() => setIsCardDropdownOpen(!isCardDropdownOpen)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-2xl text-sm font-bold text-slate-800 hover:bg-slate-100 transition-colors"
                >
                  <CardIcon card={selectedCard} size={22} />
                  <span className="truncate flex-1 text-left">{selectedCard?.name || 'Selecione'}</span>
                  <ChevronDown size={16} className="text-slate-400 shrink-0" />
                </button>
                {isCardDropdownOpen && (
                  <div className="absolute z-30 mt-1 w-full bg-white rounded-xl shadow-xl border border-slate-100 py-1">
                    {cards.map(c => (
                      <button 
                        key={c.id} 
                        onClick={() => handleCardChange(c)} 
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-slate-50 transition-colors ${c.id === selectedCardId ? 'font-bold text-purple-600 bg-purple-50' : 'text-slate-700'}`}
                      >
                        <CardIcon card={c} size={18} />
                        <span className="truncate">{c.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => { if (selectedCard) { window.open(`/v2/financeiro/contas`, '_self'); } }} className="p-2.5 hover:bg-slate-100 rounded-xl transition-colors" title="Editar cartão">
                <Pencil size={16} className="text-slate-500" />
              </button>
            </div>

            {/* Month Navigation */}
            <div className="flex items-center justify-between bg-slate-50 rounded-2xl px-2 py-2">
              <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 hover:bg-white rounded-xl transition-all active:scale-90">
                <ChevronLeft size={18} className="text-slate-600" />
              </button>
              <div className="text-center flex-1">
                <h2 className="text-base font-black text-slate-800 capitalize">{monthLabel}</h2>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={handleResetMonth} className="p-2 hover:bg-white rounded-xl transition-all active:scale-90" title="Mês atual do cartão">
                  <CalendarDays size={16} className="text-slate-500" />
                </button>
                <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 hover:bg-white rounded-xl transition-all active:scale-90">
                  <ChevronRight size={18} className="text-slate-600" />
                </button>
              </div>
            </div>
          </div>

          {/* Invoice Info */}
          <div className="p-4 border-b border-slate-100 space-y-3">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fatura Atual (R$)</div>
            {invoicePeriod && (
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Fechamento</span>
                  <span className="font-bold text-slate-700">{format(invoicePeriod.closingDate, 'dd/MM/yyyy')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Vencimento</span>
                  <span className="font-bold text-slate-700">{format(invoicePeriod.dueDate, 'dd/MM/yyyy')}</span>
                </div>
                {isBillClosed ? (
                  <button
                    onClick={() => setIsReopenConfirmOpen(true)}
                    className="w-full py-3 bg-white border-2 border-[#14b8a6]/20 text-[#14b8a6] rounded-xl font-bold uppercase tracking-wider text-[10px] hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                  >
                    <Repeat size={14} /> Reabrir Fatura
                  </button>
                ) : (
                  <button
                    onClick={() => setIsCloseBillModalOpen(true)}
                    className="w-full py-3 bg-[#14b8a6] hover:bg-teal-600 text-white rounded-xl font-bold shadow-lg shadow-teal-500/30 uppercase tracking-wider text-[10px] transition-all"
                  >
                    Fechar Fatura
                  </button>
                )}
                <button
                  onClick={() => { setModalType('transfer'); setEditingTransaction({ destination_account_id: selectedCardId } as any); setIsModalOpen(true); }}
                  className="w-full py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold uppercase tracking-wider text-[10px] hover:bg-slate-50 transition-all mb-4"
                >
                  Lançar Pagamento
                </button>
              </div>
            )}
            <div className="h-px bg-slate-100" />
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between font-bold">
                <span className="text-slate-700">Total da Fatura</span>
                <span className="text-rose-600">-{formatCurrency(invoiceSummary.total)}</span>
              </div>
            </div>
          </div>

          {/* Detalhamento */}
          <div className="p-4 space-y-3">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Detalhamento</div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Despesas</span>
                <span className="font-bold text-rose-600">-{formatCurrency(invoiceSummary.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Despesas fixas</span>
                <span className="font-bold text-slate-600">-{formatCurrency(invoiceSummary.fixed)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Parcelas</span>
                <span className="font-bold text-slate-600">{formatCurrency(invoiceSummary.installments)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Panel */}
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Toolbar */}
          <div className="shrink-0 bg-white border-b border-slate-100 px-6 py-3 flex items-center gap-4">
            <button
               onClick={() => { setModalType('expense'); setEditingTransaction(null); setIsModalOpen(true); }}
               className="flex items-center gap-2 bg-[#0d9488] text-white px-4 py-2 rounded-xl text-[10px] font-black shadow-lg hover:bg-[#0f766e] hover:scale-105 transition-all uppercase tracking-wider shrink-0"
             >
               <Plus size={14} />
               <span>Criar Lançamento</span>
               <ArrowRight size={14} className="ml-1 opacity-70" />
            </button>

            <div className="flex-1 max-w-sm relative ml-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar lançamento..."
                className="w-full pl-10 pr-4 py-2 bg-slate-50 rounded-xl border-none focus:ring-2 focus:ring-teal-500/20 text-sm"
              />
            </div>
          </div>

          {/* Transaction List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="py-12 text-center text-slate-400 italic">Carregando...</div>
            ) : displayInstances.length === 0 ? (
              <div className="py-12 text-center text-slate-400 italic">Nenhum lançamento neste período.</div>
            ) : groupedByHolder.length > 0 ? (
              groupedByHolder.map(group => (
                <div key={group.holder}>
                  {/* Group header */}
                  {groupedByHolder.length > 1 && (
                    <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                      <span className="text-xs font-black text-slate-500 uppercase tracking-wider">Cartão {group.holder}</span>
                      <span className="text-xs font-bold text-rose-600">
                        -{formatCurrency(group.items.reduce((sum, t) => sum + (t.type === 'expense' ? t.amount : 0), 0))}
                      </span>
                    </div>
                  )}
                  {group.items.map(t => <TransactionRow key={t.id + t.instanceDate} t={t} />)}
                </div>
              ))
            ) : (
              displayInstances.map(t => <TransactionRow key={t.id + t.instanceDate} t={t} />)
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {isModalOpen && (
        <FinancialTransactionModalV2
          isOpen={isModalOpen}
          onClose={() => { setIsModalOpen(false); setEditingTransaction(null); }}
          onSuccess={() => { setIsModalOpen(false); setEditingTransaction(null); fetchTransactions(); }}
          initialType={modalType}
          transaction={editingTransaction}
          initialAccountId={selectedCardId || undefined}
        />
      )}

      {isDeleteScopeModalOpen && itemToDelete && (
        <ModalOpcaoRecorrente
          isOpen={isDeleteScopeModalOpen}
          onClose={() => { setIsDeleteScopeModalOpen(false); setItemToDelete(null); }}
          onSelect={(scope) => handleDeleteTransaction(scope)}
          type="delete"
          modalidade={itemToDelete.modalidade === 'parcelada' ? 'parcelada' : 'recorrente'}
        />
      )}

      {/* Modal de Fechar Fatura */}
      {selectedCardId && (
        <CloseBillModal
          isOpen={isCloseBillModalOpen}
          onClose={() => setIsCloseBillModalOpen(false)}
          onSuccess={() => {
            setIsCloseBillModalOpen(false);
            fetchTransactions();
          }}
          cardId={selectedCardId}
          invoiceMonth={currentInvoiceMonthString}
          totalAmount={invoiceSummary.total}
        />
      )}

      {/* Confirmar Reabertura */}
      <ConfirmModal
        isOpen={isReopenConfirmOpen}
        title="Reabrir Fatura"
        message={`Você tem certeza que deseja cancelar o fechamento da fatura ${currentInvoiceMonthString}? Isso excluirá o agendamento de pagamento associado.`}
        confirmLabel="Sim, Reabrir"
        cancelLabel="Cancelar"
        onConfirm={handleReopenBill}
        onClose={() => setIsReopenConfirmOpen(false)}
        confirmColor="blue"
      />
    </div>
  );
};

export default CreditCardV2;
