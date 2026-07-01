import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  ArrowUpCircle, 
  ArrowDownCircle, 
  AlertCircle,
  TrendingUp,
  ChevronRight,
  ChevronLeft,
  Calendar,
  Inbox,
  Settings,
  BarChart2,
  PieChart,
  Wallet,
  ArrowRightLeft,
  Lock,
  X,
  CheckCircle2
} from 'lucide-react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  parseISO,
  isBefore,
  isAfter,
  isSameDay,
  addDays,
  addWeeks,
  addYears,
  isSameMonth,
  eachDayOfInterval
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Plot from 'react-plotly.js';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import FinancialTransactionModalV2 from '../../components/v2/FinancialTransactionModalV2';
import toast from 'react-hot-toast';

interface FinancialAccount {
  id: string;
  name: string;
  type: 'checking' | 'savings' | 'investment' | 'credit_card';
  initial_balance: number;
  is_active: boolean;
}

interface FinancialTransaction {
  id: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  date: string;
  description: string;
  status: 'pending' | 'paid' | 'cancelled';
  account_id?: string;
  destination_account_id?: string;
  category_id?: string;
  category_name?: string;
  client_name?: string;
  account_name?: string;
  account_type?: string;
  destination_account_type?: string;
  destination_account_name?: string;
  recurrence_enabled?: boolean;
  recurrence_period?: string;
  recurrence_interval?: number;
  recurrence_end_date?: string | null;
  installment_current?: number;
  instanceDate?: string;
  originalInstanceDate?: string;
  isVirtual?: boolean;
}

interface MonthlyStat {
  label: string;
  income: number;
  expense: number;
}

const DashboardV2 = () => {
  const { user, plano, isAdmin, dashboardWidgets, updateDashboardWidgets, themePreference } = useAuth();
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  // Abas
  const [activeTab, setActiveTab] = useState<'overview' | 'reports'>('overview');
  
  // Filtro Global no Header (Cards Superiores e Gráfico de Fluxo de 7 Meses)
  const [onlyConfirmed, setOnlyConfirmed] = useState<boolean>(false);

  // Estados Independentes para Despesas por Categoria
  const [expenseOnlyConfirmed, setExpenseOnlyConfirmed] = useState<boolean>(false);
  const [expenseChartType, setExpenseChartType] = useState<'pie' | 'bar'>('pie');

  // Estados Independentes para Receitas por Categoria
  const [incomeOnlyConfirmed, setIncomeOnlyConfirmed] = useState<boolean>(false);
  const [incomeChartType, setIncomeChartType] = useState<'pie' | 'bar'>('pie');

  // Modais e Lançamentos
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'income' | 'expense'>('income');
  
  // Dados do Supabase
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  
  // Relatórios e Estados do Usuário
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [isConfigDrawerOpen, setIsConfigDrawerOpen] = useState(false);
  
  // Estados de Interação da Pizza de Categorias
  const [selectedCategoryTransactions, setSelectedCategoryTransactions] = useState<any[]>([]);
  const [selectedCategoryName, setSelectedCategoryName] = useState<string>('');
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  // Cores dinâmicas para os gráficos Plotly de acordo com o tema selecionado
  const plotlyColors = useMemo(() => {
    const isLight = themePreference === 'light';
    return {
      paper_bgcolor: 'rgba(0,0,0,0)', // Transparente para herdar o background do card
      plot_bgcolor: 'rgba(0,0,0,0)',  // Transparente para a área interna
      font: {
        color: isLight ? '#475569' : '#f1f5f9',
        family: 'Inter, system-ui, sans-serif',
        size: 11
      },
      gridColor: isLight ? '#f1f5f9' : '#1f2937'
    };
  }, [themePreference]);

  const hasPremiumAccess = useMemo(() => {
    return isAdmin || plano === 'premium' || plano === 'trial';
  }, [plano, isAdmin]);

  const fetchStats = async () => {
    if (!user) return;

    try {
      setLoading(true);

      // 1. Buscar contas bancárias ativas
      const { data: accountsData, error: accountsError } = await supabase
        .from('financial_accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('name');

      if (accountsError) throw accountsError;
      const fetchedAccounts = accountsData || [];
      setAccounts(fetchedAccounts);

      // Preencher contas selecionadas padrão (apenas contas bancárias, ignorando cartões)
      if (selectedAccountIds.size === 0 && fetchedAccounts.length > 0) {
        const defaultSelected = fetchedAccounts
          .filter(a => a.type !== 'credit_card')
          .map(a => a.id);
        setSelectedAccountIds(new Set(defaultSelected));
      }

      // 2. Buscar TODAS as transações do usuário a partir da view para processamento consistente em memória
      const { data: txData, error: txError } = await supabase
        .from('v_financial_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: true });

      if (txError) throw txError;
      setTransactions((txData as any) || []);

    } catch (err) {
      console.error('Erro ao carregar dados do dashboard:', err);
      toast.error('Erro ao carregar dados do painel.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [user, currentMonth]);

  useEffect(() => {
    const handleTransactionCreated = () => {
      fetchStats();
    };
    window.addEventListener('transaction_created', handleTransactionCreated);
    return () => {
      window.removeEventListener('transaction_created', handleTransactionCreated);
    };
  }, [user, currentMonth]);

  const handlePrevMonth = () => setCurrentMonth(prev => subMonths(prev, 1));
  const handleNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));

  // Expansão de instâncias em memória considerando o limite de +3 meses à frente
  const expandedInstances = useMemo(() => {
    const maxFutureDate = endOfMonth(addMonths(currentMonth, 3));
    const txList = transactions || [];
    const instances: any[] = [];
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    
    // Mapeamentos para identificar filhos físicos desmembrados de recorrências
    const physicalIndicesByParent = new Map<string, Set<number>>();
    const physicalDatesByParent = new Map<string, Set<string>>();
    
    txList.forEach(t => {
      if (t.parent_id) {
        if (!physicalIndicesByParent.has(t.parent_id)) {
          physicalIndicesByParent.set(t.parent_id, new Set());
        }
        if (t.installment_current) {
          physicalIndicesByParent.get(t.parent_id)!.add(t.installment_current);
        }
        
        if (!physicalDatesByParent.has(t.parent_id)) {
          physicalDatesByParent.set(t.parent_id, new Set());
        }
        physicalDatesByParent.get(t.parent_id)!.add(t.date);
      }
    });

    for (const t of txList) {
      if (t.status === 'cancelled') continue;
      
      const tDate = parseISO(t.date);
      
      if (!t.recurrence_enabled) {
        if (isBefore(tDate, maxFutureDate) || isSameDay(tDate, maxFutureDate)) {
          const status = t.account_type === 'credit_card' ? 'paid' : t.status;
          let finalInstanceDate = t.date;
          const isUnpaid = status !== 'paid';
          if (isUnpaid && t.date < todayStr && t.account_type !== 'credit_card') {
            finalInstanceDate = todayStr;
          }
          instances.push({
            ...t,
            instanceDate: finalInstanceDate,
            originalInstanceDate: t.date,
            status,
            isVirtual: false
          });
        }
        continue;
      }
      
      const interval = t.recurrence_interval || 1;
      const period = t.recurrence_period || 'monthly';
      const recEndDate = t.recurrence_end_date ? parseISO(t.recurrence_end_date) : null;
      
      let cursor = new Date(tDate);
      const parentId = t.id;
      let occurrenceIndex = 0;
      
      while (isBefore(cursor, maxFutureDate) || isSameDay(cursor, maxFutureDate)) {
        if (recEndDate && isAfter(cursor, recEndDate)) break;
        
        const dateStr = format(cursor, 'yyyy-MM-dd');
        const currentInst = (t.installment_current || 1) + occurrenceIndex;
        
        const hasPhysicalByIndex = physicalIndicesByParent.get(parentId)?.has(currentInst);
        const hasPhysicalByDate = physicalDatesByParent.get(parentId)?.has(dateStr);
        const alreadyHasPhysical = hasPhysicalByIndex || hasPhysicalByDate;
        
        if (!alreadyHasPhysical || (dateStr === t.date && !hasPhysicalByIndex)) {
          const status = t.account_type === 'credit_card' 
            ? 'paid' 
            : (dateStr !== t.date ? 'pending' : t.status);
          let finalInstanceDate = dateStr;
          const isUnpaid = status !== 'paid';
          if (isUnpaid && dateStr < todayStr && t.account_type !== 'credit_card') {
            finalInstanceDate = todayStr;
          }
          instances.push({
            ...t,
            instanceDate: finalInstanceDate,
            originalInstanceDate: dateStr,
            isVirtual: dateStr !== t.date,
            status,
            installment_current: currentInst
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
    
    return instances;
  }, [transactions, currentMonth]);

  // Transações específicas do mês selecionado respeitando o filtro Global de Apenas Confirmados (Paid)
  const currentMonthInstances = useMemo(() => {
    return expandedInstances.filter(t => {
      const isCurrentMonth = isSameMonth(parseISO(t.instanceDate), currentMonth);
      if (!isCurrentMonth) return false;
      if (onlyConfirmed) {
        return t.status === 'paid';
      }
      return t.status === 'paid' || t.status === 'pending';
    });
  }, [expandedInstances, currentMonth, onlyConfirmed]);

  // 1. Cálculos dos Cartões Superiores (Exclui CANCELADOS, obedece toggle global onlyConfirmed)
  const stats = useMemo(() => {
    const income = currentMonthInstances
      .filter(t => t.type === 'income')
      .reduce((acc, curr) => acc + curr.amount, 0);

    const expenses = currentMonthInstances
      .filter(t => t.type === 'expense')
      .reduce((acc, curr) => acc + curr.amount, 0);

    return {
      balance: income - expenses,
      income,
      expenses
    };
  }, [currentMonthInstances]);

  // 2. Gráfico Mensal de Barras Duplas (7 meses: -3 a +3 meses, respeita global onlyConfirmed)
  const monthlyData = useMemo(() => {
    const dataRange: MonthlyStat[] = [];
    for (let i = -3; i <= 3; i++) {
      const month = addMonths(currentMonth, i);
      const start = startOfMonth(month);
      const end = endOfMonth(month);

      const monthInstances = expandedInstances.filter(t => {
        const tDate = parseISO(t.instanceDate);
        const isInRange = (isBefore(tDate, end) || isSameDay(tDate, end)) && 
                           (isAfter(tDate, start) || isSameDay(tDate, start));
        if (!isInRange) return false;
        if (onlyConfirmed) {
          return t.status === 'paid';
        }
        return t.status === 'paid' || t.status === 'pending';
      });

      const income = monthInstances
        .filter(t => t.type === 'income')
        .reduce((acc, curr) => acc + curr.amount, 0);

      const expenses = monthInstances
        .filter(t => t.type === 'expense')
        .reduce((acc, curr) => acc + curr.amount, 0);

      dataRange.push({
        label: format(month, 'MMM/yy', { locale: ptBR }),
        income,
        expense: expenses
      });
    }
    return dataRange;
  }, [expandedInstances, currentMonth, onlyConfirmed]);

  const maxChartValue = useMemo(() => {
    return Math.max(
      ...monthlyData.map(m => Math.max(m.income, m.expense)), 
      100
    );
  }, [monthlyData]);

  // ===== DADOS DOS RELATÓRIOS AVANÇADOS =====

  // 1. Evolução Diária do Saldo Acumulado (Fluxo de Caixa Projetado)
  const cumulativeCashFlowData = useMemo(() => {
    const startOfCurrent = startOfMonth(currentMonth);
    const endOfCurrent = endOfMonth(currentMonth);
    const daysInMonth = eachDayOfInterval({ start: startOfCurrent, end: endOfCurrent });

    const selectedAccs = accounts.filter(a => selectedAccountIds.has(a.id));
    const initialBalanceSum = selectedAccs.reduce((sum, a) => sum + (Number(a.initial_balance) || 0), 0);

    const creditCardAccounts = accounts.filter(a => a.type === 'credit_card');
    const creditCardIds = new Set(creditCardAccounts.map(c => c.id));

    // Calcular faturas pendentes anteriores a este mês vinculadas a contas correntes selecionadas
    let previousPendingInvoiceDeduction = 0;
    const selectedAccountCards = creditCardAccounts.filter(c => 
      c.invoice_payment_account_id && selectedAccountIds.has(c.invoice_payment_account_id)
    );

    for (const card of selectedAccountCards) {
      // Filtrar todas as instâncias do cartão anteriores a este mês
      const cardTrans = expandedInstances.filter(t => 
        t.account_id === card.id && 
        (t.type === 'expense' || t.type === 'income') && 
        t.status !== 'cancelled' &&
        isBefore(parseISO(t.instanceDate), startOfCurrent)
      );
      
      const byMonth = new Map<string, number>();
      for (const ct of cardTrans) {
        const m = ct.invoice_month;
        if (m) {
          const amt = Number(ct.amount) || 0;
          const adjustedVal = ct.type === 'expense' ? amt : -amt;
          byMonth.set(m, (byMonth.get(m) || 0) + adjustedVal);
        }
      }

      for (const [m, total] of byMonth.entries()) {
        const isPaid = expandedInstances.some(t => 
          t.destination_account_id === card.id && 
          t.type === 'transfer' && 
          t.invoice_month === m &&
          t.status !== 'cancelled'
        );
        
        if (!isPaid) {
          const [y, mo] = m.split('-');
          const dueDay = card.due_day || 1;
          const invoiceDate = new Date(Number(y), Number(mo) - 1, dueDay, 12, 0, 0);
          if (isBefore(invoiceDate, startOfCurrent)) {
            previousPendingInvoiceDeduction += total;
          }
        }
      }
    }

    // Calcular o saldo inicial histórico antes de começar o mês atual (apenas transações de contas correntes/investimentos selecionadas)
    const prevTransactions = expandedInstances.filter(t => {
      const tDate = parseISO(t.instanceDate);
      const isBeforeMonth = isBefore(tDate, startOfCurrent);
      
      // Ignorar transações em cartões de crédito para fins de saldo das contas correntes
      if (t.account_type === 'credit_card') return false;

      const isSelectedAccount = (t.account_id && selectedAccountIds.has(t.account_id)) || 
                                (t.destination_account_id && selectedAccountIds.has(t.destination_account_id));
      if (!isBeforeMonth || !isSelectedAccount) return false;
      if (onlyConfirmed) return t.status === 'paid';
      return t.status === 'paid' || t.status === 'pending';
    });

    const rawOffset = prevTransactions.reduce((sum, t) => {
      if (t.status === 'cancelled') return sum;
      
      const amt = t.amount;
      if (t.type === 'income') {
        return sum + amt;
      } else if (t.type === 'expense') {
        return sum - amt;
      } else if (t.type === 'transfer') {
        const isOut = t.account_id && selectedAccountIds.has(t.account_id);
        const isIn = t.destination_account_id && selectedAccountIds.has(t.destination_account_id);
        if (isIn && !isOut) return sum + amt;
        if (isOut && !isIn) return sum - amt;
      }
      return sum;
    }, initialBalanceSum);

    const historicalOffset = rawOffset - previousPendingInvoiceDeduction;

    // Gerar faturas virtuais do mês corrente vinculadas a contas selecionadas
    const currentMonthStr = format(currentMonth, 'yyyy-MM');
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const invoiceMap = new Map<string, { cardName: string; total: number; dueDay: number | null }>();

    for (const t of expandedInstances) {
      if (t.account_type !== 'credit_card' || t.invoice_month !== currentMonthStr || t.status === 'cancelled') continue;
      
      const card = creditCardAccounts.find(c => c.id === t.account_id);
      if (!card || !card.invoice_payment_account_id || !selectedAccountIds.has(card.invoice_payment_account_id)) continue;

      const existing = invoiceMap.get(t.account_id!);
      const amount = Number(t.amount) || 0;
      const adjustedAmount = t.type === 'expense' ? amount : -amount;
      
      if (existing) {
        existing.total += adjustedAmount;
      } else {
        invoiceMap.set(t.account_id!, {
          cardName: card.name || 'Cartão',
          total: adjustedAmount,
          dueDay: card.due_day || null,
        });
      }
    }

    const monthVirtualInvoices = Array.from(invoiceMap.entries()).map(([accountId, data]) => {
      const dueDay = data.dueDay || 1;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const safeDay = Math.min(dueDay, lastDay);
      const originalDueDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
      
      const billTransfer = expandedInstances.find(t => 
        t.destination_account_id === accountId && 
        t.type === 'transfer' && 
        t.invoice_month === currentMonthStr &&
        t.status !== 'cancelled'
      );
      const isPaid = billTransfer?.status === 'paid';
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
        isInvoiceSummary: true
      };
    });

    // Filtrar lançamentos do mês corrente (ignora cartões e transferências para cartões)
    const filteredMonthTrans = currentMonthInstances.filter(t => {
      if (t.account_type === 'credit_card') return false;
      if (t.type === 'transfer' && t.destination_account_id && creditCardIds.has(t.destination_account_id)) {
        return false;
      }
      return ((t.account_id && selectedAccountIds.has(t.account_id)) || 
              (t.destination_account_id && selectedAccountIds.has(t.destination_account_id)));
    });

    // Combinar instâncias do mês com faturas virtuais
    const combinedMonthTrans = [
      ...filteredMonthTrans,
      ...monthVirtualInvoices
    ];

    let runningBalance = historicalOffset;
    const xLabels: string[] = [];
    const yValues: number[] = [];

    daysInMonth.forEach(day => {
      const dayStr = format(day, 'yyyy-MM-dd');
      const dayTransactions = combinedMonthTrans.filter(t => t.instanceDate === dayStr);

      dayTransactions.forEach(t => {
        const amt = t.amount;
        if (t.isInvoiceSummary) {
          // Descontar a fatura se ela estiver paga ou se não for o filtro de confirmados apenas
          if (!onlyConfirmed || t.status === 'paid') {
            runningBalance -= amt;
          }
        } else if (t.type === 'income') {
          runningBalance += amt;
        } else if (t.type === 'expense') {
          runningBalance -= amt;
        } else if (t.type === 'transfer') {
          const isOut = t.account_id && selectedAccountIds.has(t.account_id);
          const isIn = t.destination_account_id && selectedAccountIds.has(t.destination_account_id);
          if (isIn && !isOut) runningBalance += amt;
          if (isOut && !isIn) runningBalance -= amt;
        }
      });

      xLabels.push(format(day, 'dd/MM'));
      yValues.push(runningBalance);
    });

    return {
      x: xLabels,
      y: yValues
    };
  }, [expandedInstances, currentMonthInstances, accounts, selectedAccountIds, currentMonth, onlyConfirmed]);

  // 2. Resultados de Caixa (Barras por Conta Selecionada)
  const accountBalancesData = useMemo(() => {
    const labels: string[] = [];
    const incomes: number[] = [];
    const expenses: number[] = [];

    accounts.forEach(acc => {
      if (!selectedAccountIds.has(acc.id)) return;

      const accTransactions = currentMonthInstances.filter(t => 
        (t.account_id === acc.id || t.destination_account_id === acc.id)
      );

      let totalIncome = 0;
      let totalExpense = 0;

      accTransactions.forEach(t => {
        const amt = t.amount;
        if (t.type === 'income') {
          totalIncome += amt;
        } else if (t.type === 'expense') {
          totalExpense += amt;
        } else if (t.type === 'transfer') {
          if (t.destination_account_id === acc.id) totalIncome += amt;
          if (t.account_id === acc.id) totalExpense += amt;
        }
      });

      labels.push(acc.name);
      incomes.push(totalIncome);
      expenses.push(totalExpense);
    });

    return {
      labels,
      incomes,
      expenses
    };
  }, [currentMonthInstances, accounts, selectedAccountIds]);

  // 3. Balanço Patrimonial (Ativo vs Passivo)
  const balanceSheetData = useMemo(() => {
    const activeAccs = accounts.filter(a => a.type !== 'credit_card');
    let totalAssets = 0;

    activeAccs.forEach(acc => {
      const initial = Number(acc.initial_balance) || 0;
      const history = expandedInstances.filter(t => 
        isBefore(parseISO(t.instanceDate), endOfMonth(currentMonth)) &&
        ((t.account_id === acc.id) || (t.destination_account_id === acc.id))
      );

      const netChange = history.reduce((sum, t) => {
        if (t.status === 'cancelled') return sum;
        if (onlyConfirmed && t.status !== 'paid') return sum;
        const amt = t.amount;
        if (t.type === 'income') return sum + amt;
        if (t.type === 'expense') return sum - amt;
        if (t.type === 'transfer') {
          if (t.destination_account_id === acc.id) return sum + amt;
          if (t.account_id === acc.id) return sum - amt;
        }
        return sum;
      }, initial);

      totalAssets += netChange;
    });

    const cardAccs = accounts.filter(a => a.type === 'credit_card');
    let totalLiabilities = 0;

    cardAccs.forEach(card => {
      const history = expandedInstances.filter(t => 
        isBefore(parseISO(t.instanceDate), endOfMonth(currentMonth)) &&
        t.account_id === card.id
      );

      const balance = history.reduce((sum, t) => {
        if (t.status === 'cancelled') return sum;
        if (onlyConfirmed && t.status !== 'paid') return sum;
        const amt = t.amount;
        if (t.type === 'expense') return sum + amt;
        if (t.type === 'income') return sum - amt;
        return sum;
      }, 0);

      totalLiabilities += balance;
    });

    const unpaidExpenses = currentMonthInstances
      .filter(t => t.type === 'expense' && t.status === 'pending')
      .reduce((sum, t) => sum + t.amount, 0);

    totalLiabilities += unpaidExpenses;

    return {
      assets: totalAssets,
      liabilities: totalLiabilities,
      equity: totalAssets - totalLiabilities
    };
  }, [expandedInstances, currentMonthInstances, accounts, currentMonth, onlyConfirmed]);

  // 4. Receitas e Despesas por Categoria (Filtros locais independentes por card)
  const categoryChartData = useMemo(() => {
    const expenseMap = new Map<string, number>();
    const incomeMap = new Map<string, number>();

    // Transações de despesas com filtro local
    const expenseInstances = expandedInstances.filter(t => {
      const isCurrentMonth = isSameMonth(parseISO(t.instanceDate), currentMonth);
      if (!isCurrentMonth) return false;
      if (expenseOnlyConfirmed) {
        return t.status === 'paid';
      }
      return t.status === 'paid' || t.status === 'pending';
    });

    // Transações de receitas com filtro local
    const incomeInstances = expandedInstances.filter(t => {
      const isCurrentMonth = isSameMonth(parseISO(t.instanceDate), currentMonth);
      if (!isCurrentMonth) return false;
      if (incomeOnlyConfirmed) {
        return t.status === 'paid';
      }
      return t.status === 'paid' || t.status === 'pending';
    });

    expenseInstances.forEach(t => {
      const catName = t.category_name || 'Sem Categoria';
      if (t.type === 'expense') {
        expenseMap.set(catName, (expenseMap.get(catName) || 0) + t.amount);
      }
    });

    incomeInstances.forEach(t => {
      const catName = t.category_name || 'Sem Categoria';
      if (t.type === 'income') {
        incomeMap.set(catName, (incomeMap.get(catName) || 0) + t.amount);
      }
    });

    const expensesList = Array.from(expenseMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const incomesList = Array.from(incomeMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const totalExpenses = expensesList.reduce((sum, item) => sum + item.value, 0);
    const totalIncomes = incomesList.reduce((sum, item) => sum + item.value, 0);

    // Mapeia os textos da pizza ocultando se a fatia for menor que 5%
    const expenseTexts = expensesList.map(item => {
      const pct = totalExpenses > 0 ? (item.value / totalExpenses) * 100 : 0;
      return pct >= 5 ? `${pct.toFixed(1)}%` : '';
    });

    const incomeTexts = incomesList.map(item => {
      const pct = totalIncomes > 0 ? (item.value / totalIncomes) * 100 : 0;
      return pct >= 5 ? `${pct.toFixed(1)}%` : '';
    });

    return {
      expenses: {
        labels: expensesList.map(item => item.name),
        values: expensesList.map(item => item.value),
        texts: expenseTexts,
        list: expensesList,
        total: totalExpenses
      },
      incomes: {
        labels: incomesList.map(item => item.name),
        values: incomesList.map(item => item.value),
        texts: incomeTexts,
        list: incomesList,
        total: totalIncomes
      }
    };
  }, [expandedInstances, currentMonth, expenseOnlyConfirmed, incomeOnlyConfirmed]);

  // Evento de clique na pizza ou barra com especificação de tipo
  const handleSliceClick = (event: any, type: 'income' | 'expense') => {
    let categoryName = '';
    if (event.points && event.points[0]) {
      const point = event.points[0];
      categoryName = point.label || point.x; 
    }
    if (categoryName) {
      handleCategoryListClick(categoryName, type);
    }
  };

  const handleCategoryListClick = (categoryName: string, type: 'income' | 'expense') => {
    const isOnlyConfirmed = type === 'expense' ? expenseOnlyConfirmed : incomeOnlyConfirmed;
    const filtered = expandedInstances.filter(t => {
      const isCurrentMonth = isSameMonth(parseISO(t.instanceDate), currentMonth);
      if (!isCurrentMonth) return false;
      const matchesCategory = t.category_name === categoryName && t.status !== 'cancelled';
      if (!matchesCategory) return false;
      if (t.type !== type) return false;

      if (isOnlyConfirmed) {
        return t.status === 'paid';
      }
      return t.status === 'paid' || t.status === 'pending';
    });
    setSelectedCategoryName(categoryName);
    setSelectedCategoryTransactions(filtered);
    setIsCategoryModalOpen(true);
  };

  const toggleAccountSelection = (id: string) => {
    setSelectedAccountIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const chartColors = ['#20B2AA', '#1A9D94', '#22C55E', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#10b981', '#6366f1', '#a855f7'];

  return (
    <div className="p-6 space-y-8 bg-slate-50 min-h-screen font-sans">
      {/* Header Dinâmico */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex-1">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight font-manrope">Dashboard Financeiro</h1>
          <p className="text-slate-500 text-sm mt-1">Acompanhe e projete o fluxo de caixa consolidado do seu negócio.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-slate-50/50 p-1.5 rounded-2xl border border-slate-100 self-start md:self-auto">
          {/* Botão de Filtro Confirmados/Previsão Geral */}
          <button
            onClick={() => setOnlyConfirmed(prev => !prev)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-all border cursor-pointer select-none ${
              onlyConfirmed 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm' 
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {onlyConfirmed ? <CheckCircle2 size={13} /> : <Calendar size={13} />}
            {onlyConfirmed ? 'Apenas Confirmados' : 'Previsto + Pago'}
          </button>

          <div className="h-6 w-px bg-slate-200 mx-1" />

          {/* Seletor Temporal Consistente */}
          <div className="flex items-center bg-white px-2.5 py-1.5 rounded-xl shadow-sm border border-slate-200/50">
            <button 
              onClick={handlePrevMonth}
              className="p-1 hover:bg-slate-100 rounded-lg transition-colors text-slate-500"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex items-center gap-1.5 px-3 min-w-[130px] justify-center">
              <span className="text-xs font-black text-slate-800 capitalize select-none">
                {format(currentMonth, "MMMM 'de' yyyy", { locale: ptBR })}
              </span>
            </div>
            <button 
              onClick={handleNextMonth}
              className="p-1 hover:bg-slate-100 rounded-lg transition-colors text-slate-500"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <button 
            onClick={() => {
              setModalType('income');
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 bg-[#20B2AA] hover:bg-[#1A9D94] text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-lg shadow-teal-600/20 active:scale-95 cursor-pointer"
          >
            <Plus size={16} />
            Novo
          </button>
        </div>
      </div>

      {/* Abas Superiores */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('overview')}
          className={`py-3.5 px-6 text-sm font-black border-b-2 transition-all uppercase tracking-wider ${
            activeTab === 'overview'
              ? 'border-[#20B2AA] text-[#20B2AA]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Visão Geral
        </button>
        <button
          onClick={() => setActiveTab('reports')}
          className="flex items-center gap-1.5 py-3.5 px-6 text-sm font-black border-b-2 transition-all uppercase tracking-wider relative"
        >
          <span 
            onClick={() => setActiveTab('reports')}
            className={activeTab === 'reports' ? 'text-[#20B2AA]' : 'text-slate-500 hover:text-slate-800'}
          >
            Relatório Financeiro
          </span>
          {!hasPremiumAccess && (
            <span className="bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase flex items-center gap-0.5 shadow-inner">
              <Lock size={8} /> Pro
            </span>
          )}
          {activeTab === 'reports' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#20B2AA]" />
          )}
        </button>
      </div>

      {/* CONTEÚDO DAS ABAS */}
      {activeTab === 'overview' ? (
        <div className="space-y-8 animate-fadeIn">
          {/* Grid de Indicadores Reais (Saldo, Receitas, Despesas) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Saldo Líquido */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 group hover:shadow-md transition-all">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-teal-50 text-[#20B2AA] rounded-xl group-hover:bg-[#20B2AA] group-hover:text-white transition-all shadow-inner shadow-teal-600/5">
                  <TrendingUp size={24} />
                </div>
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Saldo Líquido do Mês</span>
              </div>
              <div className="space-y-1">
                <h3 className={`text-2xl font-black tracking-tight ${stats.balance >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
                  {formatCurrency(stats.balance)}
                </h3>
                <p className="text-xs text-slate-400 flex items-center gap-1 font-bold">
                  <ChevronRight size={12} className="text-[#20B2AA]" />
                  {onlyConfirmed ? 'Apenas valores confirmados' : 'Projetado e Pago'}
                </p>
              </div>
            </div>

            {/* Receitas */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 group hover:shadow-md transition-all">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl group-hover:bg-emerald-600 group-hover:text-white transition-all shadow-inner">
                  <ArrowUpCircle size={24} />
                </div>
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Receitas do Mês</span>
              </div>
              <div className="space-y-1">
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                  {formatCurrency(stats.income)}
                </h3>
                <p className="text-xs text-emerald-600 font-bold tracking-tight">
                  {onlyConfirmed ? 'Total confirmado' : 'Total previsto e pago'}
                </p>
              </div>
            </div>

            {/* Despesas */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 group hover:shadow-md transition-all">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-rose-50 text-rose-600 rounded-xl group-hover:bg-rose-600 group-hover:text-white transition-all shadow-inner">
                  <ArrowDownCircle size={24} />
                </div>
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Despesas do Mês</span>
              </div>
              <div className="space-y-1">
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                  {formatCurrency(stats.expenses)}
                </h3>
                <p className="text-xs text-rose-600 font-bold tracking-tight">
                  {onlyConfirmed ? 'Total confirmado' : 'Total previsto e pago'}
                </p>
              </div>
            </div>
          </div>

          {/* Painéis de Fluxo e Movimentação */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Gráfico de Caixa Mensal de Barras Duplas (7 meses) */}
            <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h2 className="text-lg font-black text-slate-900 tracking-tight">Fluxo de Caixa Mensal</h2>
                  <p className="text-xs text-slate-400 font-bold mt-0.5">
                    {onlyConfirmed ? 'Distribuição mensal de receitas e despesas confirmadas' : 'Distribuição mensal de receitas e despesas (-3 meses a +3 meses)'}
                  </p>
                </div>
                <div className="flex items-center gap-4 bg-slate-50 px-3 py-1.5 rounded-xl text-[10px] font-black border border-slate-100 shadow-inner">
                  <div className="flex items-center gap-1.5 text-emerald-600">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Receita
                  </div>
                  <div className="flex items-center gap-1.5 text-rose-600">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Despesa
                  </div>
                </div>
              </div>

              <div className="flex-1 min-h-[240px] flex items-end justify-between gap-4 lg:gap-8 px-2 border-b border-slate-100 pb-2">
                {monthlyData.map((m, i) => {
                  const incHeight = (m.income / maxChartValue) * 100;
                  const expHeight = (m.expense / maxChartValue) * 100;
                  
                  const isCurrent = i === 3;

                  return (
                    <div key={i} className="flex-1 flex flex-col items-center h-full justify-end">
                      <div className={`w-full flex items-end justify-center gap-1.5 h-full group relative p-1 rounded-lg ${isCurrent ? 'bg-teal-500/5 border border-dashed border-[#20B2AA]/30' : ''}`}>
                        {/* Barra de Receita */}
                        <div 
                          className={`w-1/2 rounded-t-md hover:bg-emerald-500 transition-all cursor-pointer flex items-end relative min-h-[2px] ${isCurrent ? 'bg-emerald-500' : 'bg-emerald-500/20'}`}
                          style={{ height: `${Math.max(incHeight, 2)}%` }}
                        >
                          <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 font-bold whitespace-nowrap border border-slate-700">
                            Rec: {formatCurrency(m.income)}
                          </div>
                        </div>

                        {/* Barra de Despesa */}
                        <div 
                          className={`w-1/2 rounded-t-md hover:bg-rose-500 transition-all cursor-pointer flex items-end relative min-h-[2px] ${isCurrent ? 'bg-rose-500' : 'bg-rose-500/20'}`}
                          style={{ height: `${Math.max(expHeight, 2)}%` }}
                        >
                          <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 font-bold whitespace-nowrap border border-slate-700">
                            Desp: {formatCurrency(m.expense)}
                          </div>
                        </div>
                      </div>

                      {/* Identificador do Mês */}
                      <p className={`text-[9px] text-center font-black uppercase tracking-wider mt-3 pt-2 border-t border-dashed border-slate-100 w-full ${isCurrent ? 'text-[#20B2AA]' : 'text-slate-400'}`}>
                        {m.label}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Últimas Atividades */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col h-full">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-lg font-black text-slate-900 tracking-tight">Movimentações</h2>
                  <p className="text-xs text-slate-400 font-bold">Lançamentos mais recentes no mês</p>
                </div>
              </div>
              
              <div className="flex-1 space-y-4 overflow-y-auto pr-1">
                {currentMonthInstances.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center py-8">
                    <div className="p-3 bg-slate-50 text-slate-400 rounded-2xl mb-3 border border-dashed border-slate-200">
                      <Inbox size={28} />
                    </div>
                    <p className="text-sm font-bold text-slate-800">Nenhuma movimentação</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-[180px]">Nenhum lançamento foi encontrado neste mês.</p>
                  </div>
                ) : (
                  currentMonthInstances.slice(-5).reverse().map((t) => (
                    <div key={t.id} className="flex items-center gap-3 p-3 bg-slate-50/50 hover:bg-slate-50 border border-slate-100/50 hover:border-slate-200/70 rounded-xl transition-all group cursor-default">
                      <div className={`p-2 rounded-lg shadow-sm transition-all ${t.type === 'income' ? 'bg-emerald-100 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white' : 'bg-rose-100 text-rose-700 group-hover:bg-rose-600 group-hover:text-white'}`}>
                        {t.type === 'income' ? <Plus size={14} className="font-black" /> : <ArrowDownCircle size={14} className="font-black" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-slate-800 truncate group-hover:text-slate-900 capitalize">{t.description || 'Sem Descrição'}</p>
                        <p className="text-[10px] font-bold text-slate-400">
                          {format(parseISO(t.instanceDate!), 'dd/MM/yyyy')}
                          {t.account_type !== 'credit_card' && (
                            <>
                              {' • '}
                              <span className={t.status === 'paid' ? 'text-emerald-600' : 'text-amber-600 font-extrabold'}>
                                {t.status === 'paid' ? 'Pago' : 'Pendente'}
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                      <div className={`text-xs font-black ${t.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {t.type === 'income' ? '+' : '-'} {formatCurrency(t.amount)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* GRÁFICOS DE CATEGORIA (DESPESAS E RECEITAS NA ABA VISÃO GERAL) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* GRÁFICO 1: Despesas por Categoria */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-base font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-rose-500" />
                    Despesas por Categoria
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                    {expenseOnlyConfirmed ? 'Situação Realizada (Confirmado)' : 'Situação Projetada'}
                  </p>
                </div>
                {/* Botões locais */}
                <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/40 p-1 rounded-xl border border-slate-200/50">
                  <button
                    onClick={() => setExpenseOnlyConfirmed(prev => !prev)}
                    title={expenseOnlyConfirmed ? "Exibir previstos e pagos" : "Exibir apenas confirmados"}
                    className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                      expenseOnlyConfirmed 
                        ? 'bg-emerald-500 text-white shadow-sm' 
                        : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <CheckCircle2 size={14} />
                  </button>
                  <button
                    onClick={() => setExpenseChartType(prev => prev === 'pie' ? 'bar' : 'pie')}
                    title={expenseChartType === 'pie' ? "Ver como Gráfico de Barras" : "Ver como Gráfico de Pizza"}
                    className="p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all cursor-pointer"
                  >
                    {expenseChartType === 'pie' ? <BarChart2 size={14} /> : <PieChart size={14} />}
                  </button>
                </div>
              </div>

              {categoryChartData.expenses.values.length > 0 ? (
                <div className="space-y-6">
                  <div className="h-[220px] w-full flex items-center justify-center">
                    {expenseChartType === 'pie' ? (
                      <Plot
                        data={[{
                          values: categoryChartData.expenses.values,
                          labels: categoryChartData.expenses.labels,
                          text: categoryChartData.expenses.texts,
                          textinfo: 'text',
                          textposition: 'inside',
                          type: 'pie',
                          hole: 0.4,
                          marker: { colors: chartColors }
                        }]}
                        layout={{
                          showlegend: false,
                          margin: { l: 10, r: 10, t: 10, b: 10 },
                          height: 220,
                          autosize: true,
                          paper_bgcolor: plotlyColors.paper_bgcolor,
                          plot_bgcolor: plotlyColors.plot_bgcolor,
                          font: plotlyColors.font
                        }}
                        config={{ displayModeBar: false, responsive: true }}
                        onClick={(e) => handleSliceClick(e, 'expense')}
                        useResizeHandler={true}
                        style={{ width: '100%', height: '100%' }}
                      />
                    ) : (
                      <Plot
                        data={[{
                          x: categoryChartData.expenses.labels,
                          y: categoryChartData.expenses.values,
                          type: 'bar',
                          marker: { color: chartColors }
                        }]}
                        layout={{
                          margin: { l: 40, r: 10, t: 10, b: 45 },
                          xaxis: { 
                            tickfont: { size: 9, font: 'bold' },
                            gridcolor: plotlyColors.gridColor
                          },
                          yaxis: { 
                            gridcolor: plotlyColors.gridColor, 
                            tickfont: { size: 9, font: 'bold' } 
                          },
                          height: 220,
                          autosize: true,
                          paper_bgcolor: plotlyColors.paper_bgcolor,
                          plot_bgcolor: plotlyColors.plot_bgcolor,
                          font: plotlyColors.font
                        }}
                        config={{ displayModeBar: false, responsive: true }}
                        onClick={(e) => handleSliceClick(e, 'expense')}
                        useResizeHandler={true}
                        style={{ width: '100%', height: '100%' }}
                      />
                    )}
                  </div>

                  {/* Listagem detalhada das categorias com percentuais e valores */}
                  <div className="space-y-2.5 pt-4 border-t border-slate-100">
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block">Detalhamento das Despesas</span>
                    <div className="max-h-[220px] overflow-y-auto pr-1 space-y-1.5">
                      {categoryChartData.expenses.list.map((item, index) => {
                        const pct = categoryChartData.expenses.total > 0 ? (item.value / categoryChartData.expenses.total) * 100 : 0;
                        const colorIndex = index % chartColors.length;
                        return (
                          <div 
                            key={item.name} 
                            onClick={() => handleCategoryListClick(item.name, 'expense')}
                            className="flex items-center justify-between p-2 rounded-xl bg-slate-50/50 hover:bg-slate-50 hover:border-slate-200 border border-transparent transition-all cursor-pointer group"
                          >
                            <div className="flex items-center gap-2.5">
                              <span 
                                className="w-2.5 h-2.5 rounded-full shadow-inner shrink-0" 
                                style={{ backgroundColor: chartColors[colorIndex] }}
                              />
                              <span className="text-xs font-extrabold text-slate-700 group-hover:text-slate-900 capitalize">{item.name}</span>
                              <span className="text-[10px] font-black text-slate-400 bg-slate-200/50 px-2 py-0.5 rounded-full">{pct.toFixed(1)}%</span>
                            </div>
                            <span className="text-xs font-black text-rose-600">-{formatCurrency(item.value)}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between items-center pt-2.5 border-t border-slate-100 text-xs font-black">
                      <span className="text-slate-600 uppercase tracking-wider text-[10px]">Total Geral</span>
                      <span className="text-rose-600 text-sm">-{formatCurrency(categoryChartData.expenses.total)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-[280px] flex flex-col items-center justify-center text-center p-6 bg-slate-50/50 border border-dashed border-slate-200 rounded-xl">
                  <Inbox size={28} className="text-slate-400 mb-2" />
                  <p className="text-xs font-black text-slate-600">Sem lançamentos de despesas neste mês</p>
                </div>
              )}
            </div>

            {/* GRÁFICO 2: Receitas por Categoria */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-base font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-emerald-500" />
                    Receitas por Categoria
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                    {incomeOnlyConfirmed ? 'Situação Realizada (Confirmado)' : 'Situação Projetada'}
                  </p>
                </div>
                {/* Botões locais */}
                <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/40 p-1 rounded-xl border border-slate-200/50">
                  <button
                    onClick={() => setIncomeOnlyConfirmed(prev => !prev)}
                    title={incomeOnlyConfirmed ? "Exibir previstos e pagos" : "Exibir apenas confirmados"}
                    className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                      incomeOnlyConfirmed 
                        ? 'bg-emerald-500 text-white shadow-sm' 
                        : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <CheckCircle2 size={14} />
                  </button>
                  <button
                    onClick={() => setIncomeChartType(prev => prev === 'pie' ? 'bar' : 'pie')}
                    title={incomeChartType === 'pie' ? "Ver como Gráfico de Barras" : "Ver como Gráfico de Pizza"}
                    className="p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all cursor-pointer"
                  >
                    {incomeChartType === 'pie' ? <BarChart2 size={14} /> : <PieChart size={14} />}
                  </button>
                </div>
              </div>

              {categoryChartData.incomes.values.length > 0 ? (
                <div className="space-y-6">
                  <div className="h-[220px] w-full flex items-center justify-center">
                    {incomeChartType === 'pie' ? (
                      <Plot
                        data={[{
                          values: categoryChartData.incomes.values,
                          labels: categoryChartData.incomes.labels,
                          text: categoryChartData.incomes.texts,
                          textinfo: 'text',
                          textposition: 'inside',
                          type: 'pie',
                          hole: 0.4,
                          marker: { colors: chartColors }
                        }]}
                        layout={{
                          showlegend: false,
                          margin: { l: 10, r: 10, t: 10, b: 10 },
                          height: 220,
                          autosize: true,
                          paper_bgcolor: plotlyColors.paper_bgcolor,
                          plot_bgcolor: plotlyColors.plot_bgcolor,
                          font: plotlyColors.font
                        }}
                        config={{ displayModeBar: false, responsive: true }}
                        onClick={(e) => handleSliceClick(e, 'income')}
                        useResizeHandler={true}
                        style={{ width: '100%', height: '100%' }}
                      />
                    ) : (
                      <Plot
                        data={[{
                          x: categoryChartData.incomes.labels,
                          y: categoryChartData.incomes.values,
                          type: 'bar',
                          marker: { color: chartColors }
                        }]}
                        layout={{
                          margin: { l: 40, r: 10, t: 10, b: 45 },
                          xaxis: { 
                            tickfont: { size: 9, font: 'bold' },
                            gridcolor: plotlyColors.gridColor
                          },
                          yaxis: { 
                            gridcolor: plotlyColors.gridColor, 
                            tickfont: { size: 9, font: 'bold' } 
                          },
                          height: 220,
                          autosize: true,
                          paper_bgcolor: plotlyColors.paper_bgcolor,
                          plot_bgcolor: plotlyColors.plot_bgcolor,
                          font: plotlyColors.font
                        }}
                        config={{ displayModeBar: false, responsive: true }}
                        onClick={(e) => handleSliceClick(e, 'income')}
                        useResizeHandler={true}
                        style={{ width: '100%', height: '100%' }}
                      />
                    )}
                  </div>

                  {/* Listagem detalhada das categorias com percentuais e valores */}
                  <div className="space-y-2.5 pt-4 border-t border-slate-100">
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block">Detalhamento das Receitas</span>
                    <div className="max-h-[220px] overflow-y-auto pr-1 space-y-1.5">
                      {categoryChartData.incomes.list.map((item, index) => {
                        const pct = categoryChartData.incomes.total > 0 ? (item.value / categoryChartData.incomes.total) * 100 : 0;
                        const colorIndex = index % chartColors.length;
                        return (
                          <div 
                            key={item.name} 
                            onClick={() => handleCategoryListClick(item.name, 'income')}
                            className="flex items-center justify-between p-2 rounded-xl bg-slate-50/50 hover:bg-slate-50 hover:border-slate-200 border border-transparent transition-all cursor-pointer group"
                          >
                            <div className="flex items-center gap-2.5">
                              <span 
                                className="w-2.5 h-2.5 rounded-full shadow-inner shrink-0" 
                                style={{ backgroundColor: chartColors[colorIndex] }}
                              />
                              <span className="text-xs font-extrabold text-slate-700 group-hover:text-slate-900 capitalize">{item.name}</span>
                              <span className="text-[10px] font-black text-slate-400 bg-slate-200/50 px-2 py-0.5 rounded-full">{pct.toFixed(1)}%</span>
                            </div>
                            <span className="text-xs font-black text-emerald-600">+{formatCurrency(item.value)}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between items-center pt-2.5 border-t border-slate-100 text-xs font-black">
                      <span className="text-slate-600 uppercase tracking-wider text-[10px]">Total Geral</span>
                      <span className="text-emerald-600 text-sm">+{formatCurrency(categoryChartData.incomes.total)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-[280px] flex flex-col items-center justify-center text-center p-6 bg-slate-50/50 border border-dashed border-slate-200 rounded-xl">
                  <Inbox size={28} className="text-slate-400 mb-2" />
                  <p className="text-xs font-black text-slate-600">Sem lançamentos de receitas neste mês</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-8 animate-fadeIn relative">
          
          {/* Botão de Engrenagem do Menu de Configuração de Widgets (Apenas Relatórios) */}
          <div className="flex justify-end mb-2">
            <button
              onClick={() => setIsConfigDrawerOpen(true)}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white rounded-xl text-xs font-black text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-all shadow-sm cursor-pointer"
            >
              <Settings size={14} />
              Personalizar Painel
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* WIDGETS PROTEGIDOS POR PAYWALL (APENAS PLANO PREMIUM) */}
            
            {/* WIDGET 1: Fluxo de Caixa Acumulado (Projetado) */}
            {dashboardWidgets.fluxoCaixaAcumulado !== false && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col relative overflow-hidden lg:col-span-2">
                <div className="mb-4">
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <TrendingUp size={18} className="text-[#20B2AA]" />
                    Evolução do Saldo Acumulado
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">Fluxo de caixa projetado no mês selecionado (inclui despesas e receitas futuras)</p>
                </div>
                
                {hasPremiumAccess ? (
                  <div className="space-y-6">
                    <div className="h-[240px]">
                      <Plot
                        data={[{
                          x: cumulativeCashFlowData.x,
                          y: cumulativeCashFlowData.y,
                          type: 'scatter',
                          mode: 'lines',
                          fill: 'tozeroy',
                          fillcolor: 'rgba(32, 178, 170, 0.08)',
                          line: { color: '#20B2AA', width: 3 }
                        }]}
                        layout={{
                          margin: { l: 50, r: 20, t: 10, b: 30 },
                          xaxis: { gridcolor: plotlyColors.gridColor, tickfont: { size: 9, font: 'bold' } },
                          yaxis: { gridcolor: plotlyColors.gridColor, tickfont: { size: 9, font: 'bold' } },
                          height: 240,
                          autosize: true,
                          paper_bgcolor: plotlyColors.paper_bgcolor,
                          plot_bgcolor: plotlyColors.plot_bgcolor,
                          font: plotlyColors.font
                        }}
                        config={{ displayModeBar: false, responsive: true }}
                        useResizeHandler={true}
                        style={{ width: '100%', height: '100%' }}
                      />
                    </div>

                    {/* Seleção de contas localizada especificamente sob o gráfico */}
                    <div className="pt-4 border-t border-slate-100">
                      <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block mb-2">Selecionar Contas para o Fluxo</span>
                      <div className="flex flex-wrap gap-3">
                        {accounts.filter(a => a.type !== 'credit_card').map(acc => (
                          <label key={acc.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors text-xs font-bold text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedAccountIds.has(acc.id)}
                              onChange={() => toggleAccountSelection(acc.id)}
                              className="w-3.5 h-3.5 rounded border-slate-300 text-[#20B2AA] focus:ring-[#20B2AA] cursor-pointer"
                            />
                            {acc.name}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-[280px] flex flex-col items-center justify-center text-center p-6 bg-slate-50/50 border border-dashed border-slate-200 rounded-xl">
                    <Lock size={32} className="text-amber-500 mb-3" />
                    <span className="text-xs bg-amber-500/10 text-amber-600 px-2 py-0.5 rounded-full font-black uppercase tracking-wider text-[8px] mb-2">Premium</span>
                    <p className="text-xs font-black text-slate-800">Evolução do Saldo Acumulado</p>
                    <p className="text-[10px] text-slate-400 mt-1 max-w-[200px]">Disponível apenas nos planos Pró ou Premium. Faça o upgrade agora para visualizar.</p>
                  </div>
                )}
              </div>
            )}

            {/* WIDGET 2: Resultados de Caixa */}
            {dashboardWidgets.resultadosCaixa !== false && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col relative overflow-hidden">
                <div className="mb-4">
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <BarChart2 size={18} className="text-[#20B2AA]" />
                    Resultados de Caixa
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">Comparativo de entradas vs saídas por conta selecionada</p>
                </div>
                
                {hasPremiumAccess ? (
                  <div className="space-y-6">
                    <div className="h-[240px]">
                      {accountBalancesData.labels.length > 0 ? (
                        <Plot
                          data={[
                            {
                              x: accountBalancesData.labels,
                              y: accountBalancesData.incomes,
                              name: 'Entradas',
                              type: 'bar',
                              marker: { color: '#22C55E' }
                            },
                            {
                              x: accountBalancesData.labels,
                              y: accountBalancesData.expenses,
                              name: 'Saídas',
                              type: 'bar',
                              marker: { color: '#ef4444' }
                            }
                          ]}
                          layout={{
                            margin: { l: 50, r: 20, t: 10, b: 30 },
                            xaxis: { 
                              tickfont: { size: 9, font: 'bold' },
                              gridcolor: plotlyColors.gridColor
                            },
                            yaxis: { 
                              gridcolor: plotlyColors.gridColor, 
                              tickfont: { size: 9, font: 'bold' } 
                            },
                            barmode: 'group',
                            height: 240,
                            autosize: true,
                            showlegend: false,
                            paper_bgcolor: plotlyColors.paper_bgcolor,
                            plot_bgcolor: plotlyColors.plot_bgcolor,
                            font: plotlyColors.font
                          }}
                          config={{ displayModeBar: false, responsive: true }}
                          useResizeHandler={true}
                          style={{ width: '100%', height: '100%' }}
                        />
                      ) : (
                        <div className="h-full flex items-center justify-center text-xs text-slate-400 font-bold">Nenhuma conta selecionada</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-[280px] flex flex-col items-center justify-center text-center p-6 bg-slate-50/50 border border-dashed border-slate-200 rounded-xl">
                    <Lock size={32} className="text-amber-500 mb-3" />
                    <span className="text-xs bg-amber-500/10 text-amber-600 px-2 py-0.5 rounded-full font-black uppercase tracking-wider text-[8px] mb-2">Premium</span>
                    <p className="text-xs font-black text-slate-800">Resultados de Caixa</p>
                    <p className="text-[10px] text-slate-400 mt-1 max-w-[200px]">Disponível apenas nos planos Pró ou Premium. Faça o upgrade agora para visualizar.</p>
                  </div>
                )}
              </div>
            )}

            {/* WIDGET 3: Balanço Patrimonial */}
            {dashboardWidgets.balancoPatrimonial !== false && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col relative overflow-hidden">
                <div className="mb-4">
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <Wallet size={18} className="text-[#20B2AA]" />
                    Balanço Patrimonial
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">Visão projetada de ativos, passivos e patrimônio líquido</p>
                </div>
                
                {hasPremiumAccess ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center h-[240px]">
                    <div className="h-full">
                      <Plot
                        data={[{
                          x: ['Ativos', 'Passivos'],
                          y: [balanceSheetData.assets, balanceSheetData.liabilities],
                          type: 'bar',
                          marker: { color: ['#22C55E', '#ef4444'] }
                        }]}
                        layout={{
                          margin: { l: 50, r: 20, t: 20, b: 30 },
                          yaxis: { gridcolor: plotlyColors.gridColor, tickfont: { size: 9, font: 'bold' } },
                          xaxis: { gridcolor: plotlyColors.gridColor, tickfont: { size: 9, font: 'bold' } },
                          height: 220,
                          autosize: true,
                          paper_bgcolor: plotlyColors.paper_bgcolor,
                          plot_bgcolor: plotlyColors.plot_bgcolor,
                          font: plotlyColors.font
                        }}
                        config={{ displayModeBar: false, responsive: true }}
                        useResizeHandler={true}
                        style={{ width: '100%', height: '100%' }}
                      />
                    </div>
                    <div className="space-y-4 p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-center">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-500">Ativos Consolidados:</span>
                        <span className="font-black text-emerald-600">{formatCurrency(balanceSheetData.assets)}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-500">Passivos Consolidados:</span>
                        <span className="font-black text-rose-600">{formatCurrency(balanceSheetData.liabilities)}</span>
                      </div>
                      <div className="w-full h-px bg-slate-200 my-1" />
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-extrabold text-slate-700">Patrimônio Líquido:</span>
                        <span className={`font-black ${balanceSheetData.equity >= 0 ? 'text-[#20B2AA]' : 'text-rose-600'}`}>
                          {formatCurrency(balanceSheetData.equity)}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-[240px] flex flex-col items-center justify-center text-center p-6 bg-slate-50/50 border border-dashed border-slate-200 rounded-xl">
                    <Lock size={32} className="text-amber-500 mb-3" />
                    <span className="text-xs bg-amber-500/10 text-amber-600 px-2 py-0.5 rounded-full font-black uppercase tracking-wider text-[8px] mb-2">Premium</span>
                    <p className="text-xs font-black text-slate-800">Balanço Patrimonial</p>
                    <p className="text-[10px] text-slate-400 mt-1 max-w-[200px]">Disponível apenas nos planos Pró ou Premium. Faça o upgrade agora para visualizar.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL CONFIGURADOR LATERAL DE WIDGETS (DRAWER) */}
      {isConfigDrawerOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex justify-end transition-opacity">
          <div className="w-full max-w-sm bg-white h-full p-6 shadow-2xl flex flex-col justify-between border-l border-slate-100 animate-slideLeft">
            <div className="space-y-6">
              <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Gerenciar Widgets</h3>
                  <p className="text-[10px] text-slate-400">Escolha quais relatórios exibir no painel</p>
                </div>
                <button
                  onClick={() => setIsConfigDrawerOpen(false)}
                  className="p-1.5 hover:bg-slate-50 text-slate-500 hover:text-slate-700 rounded-xl transition-all cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-100/50 hover:border-slate-200 rounded-xl cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={dashboardWidgets.fluxoCaixaAcumulado !== false}
                    onChange={(e) => updateDashboardWidgets({ ...dashboardWidgets, fluxoCaixaAcumulado: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-[#20B2AA] focus:ring-[#20B2AA] cursor-pointer"
                  />
                  <div>
                    <p className="text-xs font-black text-slate-800">Evolução do Saldo (Linha)</p>
                    <p className="text-[9px] text-slate-400 font-bold">Saldo acumulado diário projetado.</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-100/50 hover:border-slate-200 rounded-xl cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={dashboardWidgets.resultadosCaixa !== false}
                    onChange={(e) => updateDashboardWidgets({ ...dashboardWidgets, resultadosCaixa: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-[#20B2AA] focus:ring-[#20B2AA] cursor-pointer"
                  />
                  <div>
                    <p className="text-xs font-black text-slate-800">Resultados de Caixa (Barras)</p>
                    <p className="text-[9px] text-slate-400 font-bold">Entradas vs Saídas por conta.</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-100/50 hover:border-slate-200 rounded-xl cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={dashboardWidgets.balancoPatrimonial !== false}
                    onChange={(e) => updateDashboardWidgets({ ...dashboardWidgets, balancoPatrimonial: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-[#20B2AA] focus:ring-[#20B2AA] cursor-pointer"
                  />
                  <div>
                    <p className="text-xs font-black text-slate-800">Balanço Patrimonial</p>
                    <p className="text-[9px] text-slate-400 font-bold">Ativos vs Passivos consolidado.</p>
                  </div>
                </label>
              </div>
            </div>

            <button
              onClick={() => setIsConfigDrawerOpen(false)}
              className="w-full py-3 bg-[#20B2AA] hover:bg-[#1A9D94] text-white font-extrabold text-xs rounded-xl shadow-lg shadow-teal-600/10 cursor-pointer"
            >
              Fechar e Salvar
            </button>
          </div>
        </div>
      )}

      {/* MODAL DETALHAMENTO DE CATEGORIA (PIZZA CLICK) */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] animate-scaleUp">
            <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50/50">
              <div>
                <span className="text-[8px] bg-[#20B2AA]/10 text-[#20B2AA] font-black px-2.5 py-1 rounded-full uppercase tracking-wider block w-max mb-1">Detalhamento</span>
                <h3 className="text-base font-black text-slate-900 tracking-tight capitalize">Categoria: {selectedCategoryName}</h3>
              </div>
              <button
                onClick={() => setIsCategoryModalOpen(false)}
                className="p-1.5 hover:bg-slate-200 text-slate-500 hover:text-slate-700 rounded-xl transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {selectedCategoryTransactions.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400 font-bold">Nenhuma transação encontrada nesta categoria.</div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden bg-white">
                  {selectedCategoryTransactions.map((t) => (
                    <div key={t.id} className="flex items-center justify-between p-3.5 hover:bg-slate-50 transition-colors">
                      <div className="min-w-0 flex-1 pr-3">
                        <p className="text-xs font-black text-slate-800 truncate capitalize">{t.description || 'Sem Descrição'}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[9px] font-bold text-slate-400 mt-0.5 uppercase tracking-wide">
                          <span>{format(parseISO(t.instanceDate!), 'dd/MM/yyyy')}</span>
                          <span>•</span>
                          <span className="text-slate-500 font-black">{t.account_name || 'Sem Conta'}</span>
                          {t.account_type !== 'credit_card' && (
                            <>
                              <span>•</span>
                              <span className={t.status === 'paid' ? 'text-emerald-600' : 'text-amber-500'}>
                                {t.status === 'paid' ? 'Pago' : 'Pendente'}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className={`text-xs font-black shrink-0 ${t.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {t.type === 'income' ? '+' : '-'} {formatCurrency(t.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="p-4 bg-slate-50 border-t border-slate-100 text-right">
              <button
                onClick={() => setIsCategoryModalOpen(false)}
                className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-black text-xs rounded-xl cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Lançamento */}
      <FinancialTransactionModalV2 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchStats}
        initialType={modalType}
      />
    </div>
  );
};

export default DashboardV2;
