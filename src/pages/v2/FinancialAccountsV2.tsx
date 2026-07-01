import { useState, useEffect, useMemo } from 'react';
import { 
  Plus, Pencil, Trash2, X, Building2, CreditCard, Landmark, TrendingUp,
  ChevronDown, ArrowRight, Users, HelpCircle
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { usePlanLimits } from '../../hooks/usePlanLimits';
import { toast } from 'react-hot-toast';
import ConfirmModal from '../../components/v2/ConfirmModal';
import { format, subDays, setDate, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BRAZILIAN_BANKS, inferBankDomain } from '../../constants/banks';

interface Account {
  id: string;
  name: string;
  type: 'checking' | 'savings' | 'credit_card' | 'investment';
  initial_balance: number;
  credit_limit: number | null;
  closing_day: number | null;
  due_day: number | null;
  is_active: boolean;
  created_at: string;
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

const typeLabels: Record<string, string> = {
  checking: 'Conta Corrente',
  savings: 'Poupança',
  credit_card: 'Cartão de Crédito',
  investment: 'Investimento'
};

const typeIcons: Record<string, React.ReactNode> = {
  checking: <Building2 size={20} />,
  savings: <Landmark size={20} />,
  credit_card: <CreditCard size={20} />,
  investment: <TrendingUp size={20} />
};

const typeColors: Record<string, string> = {
  checking: 'bg-blue-50 text-blue-700 border-blue-200',
  savings: 'bg-green-50 text-green-700 border-green-200',
  credit_card: 'bg-purple-50 text-purple-700 border-purple-200',
  investment: 'bg-amber-50 text-amber-700 border-amber-200'
};



const CARD_BRANDS = [
  { name: 'Visa', id: 'visa', icon: 'https://cdn.jsdelivr.net/gh/aaronfagan/svg-credit-card-payment-icons@0.1.1/flat/visa.svg' },
  { name: 'Mastercard', id: 'mastercard', icon: 'https://cdn.jsdelivr.net/gh/aaronfagan/svg-credit-card-payment-icons@0.1.1/flat/mastercard.svg' },
  { name: 'Elo', id: 'elo', icon: 'https://cdn.jsdelivr.net/gh/aaronfagan/svg-credit-card-payment-icons@0.1.1/flat/elo.svg' },
  { name: 'American Express', id: 'amex', icon: 'https://cdn.jsdelivr.net/gh/aaronfagan/svg-credit-card-payment-icons@0.1.1/flat/amex.svg' },
  { name: 'Hipercard', id: 'hipercard', icon: 'https://cdn.jsdelivr.net/gh/aaronfagan/svg-credit-card-payment-icons@0.1.1/flat/hipercard.svg' },
  { name: 'Diners Club', id: 'diners', icon: 'https://cdn.jsdelivr.net/gh/aaronfagan/svg-credit-card-payment-icons@0.1.1/flat/diners.svg' },
];

const limitTypeLabels: Record<string, string> = {
  total: 'Total',
  monthly: 'Mensal',
  undefined: 'Indefinido'
};

const pushMaskFormat = (raw: string): string => {
  const clean = raw.replace(/\D/g, "");
  const cents = parseInt(clean || "0");
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true
  }).format(cents / 100);
};

const parsePushMask = (formatted: string): number =>
  parseFloat(formatted.replace(/\./g, '').replace(',', '.')) || 0;

const FinancialAccountsV2 = () => {
  const { user } = useAuth();
  const { checkLimit } = usePlanLimits();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('checking');
  const [initialBalance, setInitialBalance] = useState('0,00');
  const [balanceType, setBalanceType] = useState<'debtor' | 'creditor'>('debtor');
  const [creditLimit, setCreditLimit] = useState('0,00');
  const [limitType, setLimitType] = useState('total');
  const [dueDay, setDueDay] = useState('');
  const [firstInvoiceDueDate, setFirstInvoiceDueDate] = useState('');
  const [closingDaysBefore, setClosingDaysBefore] = useState('10');
  const [invoicePaymentAccountId, setInvoicePaymentAccountId] = useState('');
  const [mainCardName, setMainCardName] = useState('');
  const [secondaryCards, setSecondaryCards] = useState<string[]>([]);
  const [newSecondaryCard, setNewSecondaryCard] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankIcon, setBankIcon] = useState('');
  const [cardBrand, setCardBrand] = useState('');
  const [saving, setSaving] = useState(false);
  const [bankSearch, setBankSearch] = useState('');
  const [showBankOptions, setShowBankOptions] = useState(false);
  const [isDebitAccountDropdownOpen, setIsDebitAccountDropdownOpen] = useState(false);

  // Computed: closing date preview
  const closingDatePreview = useMemo(() => {
    const due = parseInt(dueDay);
    const daysBefore = parseInt(closingDaysBefore);
    if (!due || !daysBefore || due < 1 || due > 31) return null;
    
    try {
      const now = new Date();
      let referenceDate = now;

      // Se houver uma data de primeira fatura, usamos ela como base inicial
      if (firstInvoiceDueDate) {
        const [year, month, day] = firstInvoiceDueDate.split('-').map(Number);
        referenceDate = new Date(year, month - 1, day);
      }

      // Calcula o vencimento baseado na data de referência
      let dueDate = setDate(referenceDate, due);
      let closingDate = subDays(dueDate, daysBefore);

      // Se o fechamento calculado for no passado (em relação a 'now'), 
      // e não houver uma primeira fatura forçando essa data, avançamos para o próximo mês
      if (!firstInvoiceDueDate && closingDate < now) {
        dueDate = setDate(new Date(now.getFullYear(), now.getMonth() + 1, 1), due);
        closingDate = subDays(dueDate, daysBefore);
      }

      return format(closingDate, "dd/MM/yyyy", { locale: ptBR });
    } catch (e) {
      console.error('Erro ao calcular fechamento:', e);
      return null;
    }
  }, [dueDay, closingDaysBefore, firstInvoiceDueDate]);
  
  // Opções para a data da primeira fatura (Dia Fixo)
  const firstInvoiceOptions = useMemo(() => {
    const due = parseInt(dueDay);
    if (!due || due < 1 || due > 31) return [];

    const options = [];
    const now = new Date();
    
    // De -12 meses até +2 meses conforme solicitado
    for (let i = -12; i <= 2; i++) {
      const date = addMonths(now, i);
      try {
        const d = setDate(date, due);
        options.push({
          value: format(d, 'yyyy-MM-dd'),
          label: format(d, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
        });
      } catch {
        // Ignora datas inválidas
      }
    }
    
    return options;
  }, [dueDay]);

  // Efeito para garantir que a data da primeira fatura seja válida quando o dia de vencimento mudar
  // E também auto-selecionar a data mais próxima conforme solicitado pelo usuário
  useEffect(() => {
    if (type === 'credit_card' && dueDay) {
      const due = parseInt(dueDay);
      if (!due || due < 1 || due > 31) return;

      const now = new Date();
      const currentDay = now.getDate();
      
      // Se o dia de vencimento for maior ou igual ao dia atual, sugere o mês atual.
      // Se for menor, sugere o próximo mês.
      const targetDate = due >= currentDay ? now : addMonths(now, 1);
      const newAutoDate = format(setDate(targetDate, due), 'yyyy-MM-dd');

      if (newAutoDate !== firstInvoiceDueDate) {
        setFirstInvoiceDueDate(newAutoDate);
      }
    }
  }, [dueDay, type]);

  // Non-credit-card accounts for the payment account selector
  const paymentAccounts = useMemo(() =>
    accounts.filter(a => a.type !== 'credit_card' && (editing ? a.id !== editing.id : true)),
    [accounts, editing]
  );

  const selectedDebitAccount = useMemo(() => 
    paymentAccounts.find(a => a.id === invoicePaymentAccountId),
    [paymentAccounts, invoicePaymentAccountId]
  );

  const fetchAccounts = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('financial_accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('name');
    if (error) { console.error(error); }
    setAccounts((data as Account[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchAccounts(); }, [user?.id]);

  const resetForm = () => {
    setName(''); setType('checking'); setInitialBalance('0,00'); setBalanceType('debtor');
    setCreditLimit('0,00'); setLimitType('total');
    setDueDay(''); setFirstInvoiceDueDate(''); setClosingDaysBefore('10');
    setInvoicePaymentAccountId(''); setMainCardName('');
    setSecondaryCards([]); setNewSecondaryCard('');
    setBankName(''); setBankIcon(''); setCardBrand('');
    setBankSearch(''); setShowBankOptions(false);
    setIsDebitAccountDropdownOpen(false);
    setEditing(null);
  };

  const openNew = () => { 
    if (!checkLimit('accounts')) return;
    resetForm(); 
    setIsModalOpen(true); 
  };

  const openEdit = (a: Account) => {
    setEditing(a);
    setName(a.name);
    setType(a.type);
    const bal = Math.abs(a.initial_balance);
    setInitialBalance(bal.toFixed(2).replace('.', ','));
    setBalanceType(a.initial_balance >= 0 ? 'debtor' : 'creditor');
    setCreditLimit(a.credit_limit ? a.credit_limit.toFixed(2).replace('.', ',') : '0,00');
    setLimitType(a.limit_type || 'total');
    setDueDay(a.due_day ? String(a.due_day) : '');
    setFirstInvoiceDueDate(a.first_invoice_due_date || '');
    setClosingDaysBefore(a.closing_days_before ? String(a.closing_days_before) : '10');
    setInvoicePaymentAccountId(a.invoice_payment_account_id || '');
    setMainCardName(a.main_card_name || '');
    setSecondaryCards(a.secondary_cards || []);
    setBankName(a.bank_name || '');
    setBankIcon(a.bank_icon || '');
    setCardBrand(a.card_brand || '');
    setBankSearch(a.bank_name || '');
    setIsModalOpen(true);
  };

  const [accountToDeleteId, setAccountToDeleteId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('financial_accounts').delete().eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Conta excluída!');
    setAccountToDeleteId(null);
    fetchAccounts();
  };

  const handleAddSecondaryCard = () => {
    if (!newSecondaryCard.trim()) return;
    setSecondaryCards(prev => [...prev, newSecondaryCard.trim()]);
    setNewSecondaryCard('');
  };

  const handleRemoveSecondaryCard = (index: number) => {
    setSecondaryCards(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('Informe o nome da conta.'); return; }

    if (!editing && !checkLimit('accounts')) {
      return;
    }

    setSaving(true);
    const isCC = type === 'credit_card';
    const parsedBalance = parsePushMask(initialBalance) * (balanceType === 'creditor' ? -1 : 1);
    
    const payload = {
      user_id: user!.id,
      name: name.trim(),
      type: type as any,
      initial_balance: parsedBalance,
      credit_limit: isCC ? parsePushMask(creditLimit) : null,
      closing_day: null,
      due_day: isCC && dueDay ? parseInt(dueDay) : null,
      limit_type: (isCC ? limitType : null) as any,
      first_invoice_due_date: isCC && firstInvoiceDueDate ? firstInvoiceDueDate : null,
      closing_days_before: isCC && closingDaysBefore ? parseInt(closingDaysBefore) : null,
      invoice_payment_account_id: isCC && invoicePaymentAccountId ? invoicePaymentAccountId : null,
      main_card_name: isCC && mainCardName.trim() ? mainCardName.trim() : null,
      secondary_cards: isCC && secondaryCards.length > 0 ? secondaryCards : null,
      bank_name: bankName.trim() || null,
      bank_icon: bankIcon || null,
      card_brand: isCC && cardBrand ? cardBrand : null,
    };

    let error;
    if (editing) {
      ({ error } = await supabase.from('financial_accounts').update(payload).eq('id', editing.id));
    } else {
      ({ error } = await supabase.from('financial_accounts').insert(payload));
    }

    if (error) { toast.error('Erro: ' + error.message); setSaving(false); return; }
    toast.success(editing ? 'Conta atualizada!' : 'Conta criada!');
    setIsModalOpen(false);
    resetForm();
    fetchAccounts();
    setSaving(false);
  };

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-manrope">Contas Financeiras</h1>
          <p className="text-slate-500 text-sm">Gerencie suas contas bancárias e cartões.</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-teal-600/20">
          <Plus size={18} /> Nova Conta
        </button>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
        {loading ? (
          <div className="col-span-full py-12 text-center text-slate-400 italic">Carregando...</div>
        ) : accounts.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-400 italic">Nenhuma conta cadastrada. Clique em "Nova Conta" para começar.</div>
        ) : (
          accounts.map(a => (
            <div key={a.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col gap-4 hover:shadow-md transition-shadow overflow-hidden group">
              <div className="flex items-start justify-between gap-2 overflow-hidden">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center border overflow-hidden shrink-0 ${typeColors[a.type]}`}>
                    {a.bank_icon ? (
                      <div className="w-full h-full relative">
                        <img 
                          src={`https://www.google.com/s2/favicons?domain=${a.bank_icon}&sz=64`} 
                          alt={a.bank_name || ''} 
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.classList.add('hidden');
                            if (target.nextElementSibling) {
                              target.nextElementSibling.classList.remove('hidden');
                            }
                          }}
                        />
                        <div className="hidden absolute inset-0 flex items-center justify-center font-bold text-lg text-white" style={{ backgroundColor: BRAZILIAN_BANKS.find(b => b.domain === a.bank_icon)?.color || '#94a3b8' }}>
                          {a.bank_name?.charAt(0) || typeIcons[a.type]}
                        </div>
                      </div>
                    ) : (
                      <div className="text-slate-400">{typeIcons[a.type]}</div>
                    )}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-slate-900 break-words leading-tight pr-2">{a.name}</h3>
                    <div className="flex flex-wrap gap-1 items-center mt-0.5 min-w-0">
                      <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium border whitespace-nowrap shrink-0 ${typeColors[a.type]}`}>
                        {typeLabels[a.type]}
                      </span>
                      {a.bank_name && (
                        <span className="text-[10px] text-slate-400 flex items-center gap-1 truncate">
                          em <span className="font-bold text-slate-500 truncate">{a.bank_name}</span>
                        </span>
                      )}
                      {a.card_brand && (
                        <div className="flex items-center gap-1 ml-1 shrink-0">
                          {CARD_BRANDS.find(b => b.id === a.card_brand)?.icon ? (
                            <img 
                              src={CARD_BRANDS.find(b => b.id === a.card_brand)?.icon} 
                              alt={a.card_brand} 
                              className="h-3 w-auto object-contain brightness-90"
                            />
                          ) : (
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{a.card_brand}</span>
                          )}
                        </div>
                      )}
                    </div>
                </div>
                <div className="flex gap-1 shrink-0 transition-all">
                  <button onClick={() => openEdit(a)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Editar">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => setAccountToDeleteId(a.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Excluir">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Saldo Inicial</span>
                  <span className="font-bold text-slate-700">{formatCurrency(a.initial_balance)}</span>
                </div>
                {a.type === 'credit_card' && (
                  <>
                    {a.credit_limit != null && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Limite ({limitTypeLabels[a.limit_type || 'total']})</span>
                        <span className="font-bold text-purple-600">{formatCurrency(a.credit_limit)}</span>
                      </div>
                    )}
                    {a.due_day && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Vence dia</span>
                        <span className="font-bold text-slate-700">{a.due_day}</span>
                      </div>
                    )}
                    {a.closing_days_before && a.due_day && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Fecha</span>
                        <span className="font-bold text-slate-700">{a.closing_days_before} dias antes (dia {Math.max(1, a.due_day - a.closing_days_before)})</span>
                      </div>
                    )}
                    {a.main_card_name && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Titular</span>
                        <span className="font-bold text-slate-700">{a.main_card_name}</span>
                      </div>
                    )}
                    {a.secondary_cards && a.secondary_cards.length > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Adicionais</span>
                        <span className="font-bold text-slate-700">{a.secondary_cards.length}</span>
                      </div>
                    )}
                    {a.card_brand && (
                      <div className="flex justify-between text-sm pt-2 border-t border-slate-50 mt-2">
                        <span className="text-slate-400">Bandeira</span>
                        <span className="font-bold text-slate-700 capitalize">{a.card_brand}</span>
                      </div>
                    )}
                  </>
                )}
                {a.type !== 'credit_card' && a.bank_name && (
                   <div className="flex justify-between text-sm pt-2 border-t border-slate-50 mt-2">
                    <span className="text-slate-400">Instituição</span>
                    <span className="font-bold text-slate-700">{a.bank_name}</span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => { setIsModalOpen(false); resetForm(); }} />
          <div className="relative w-full max-w-lg bg-white/95 backdrop-blur-2xl rounded-[2rem] shadow-2xl border border-white/20 overflow-hidden max-h-[90vh] overflow-y-auto">
            <header className="px-6 py-4 flex items-center justify-between border-b border-slate-100 sticky top-0 bg-white/95 backdrop-blur-xl z-10">
              <h2 className="text-lg font-bold text-slate-900 font-manrope">{editing ? 'Editar Conta' : 'Nova Conta'}</h2>
              <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} className="text-slate-500" /></button>
            </header>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* Nome */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Nome da Conta / Cartão</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Principal, Cashback Master, Reserva" className="w-full px-4 py-3 bg-slate-50 rounded-xl border-none focus:ring-2 focus:ring-teal-500/20 text-sm" required />
              </div>

              {/* Instituição / Banco */}
              <div className="space-y-1.5 relative">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Banco / Instituição</label>
                <div className="relative">
                  <input 
                    type="text" 
                    value={bankSearch} 
                    onChange={e => {
                      const val = e.target.value;
                      setBankSearch(val);
                      setBankName(val);
                      setShowBankOptions(true);
                      
                      if (val === '') { 
                        setBankIcon(''); 
                      } else {
                        // Se for correspondente exato, pega o ícone oficial
                        const officialBank = BRAZILIAN_BANKS.find(b => b.name.toLowerCase() === val.toLowerCase());
                        if (officialBank) {
                          setBankIcon(officialBank.domain);
                        } else {
                          // Se for customizado, infere o domínio inicial
                          setBankIcon(inferBankDomain(val));
                        }
                      }
                    }} 
                    onFocus={() => setShowBankOptions(true)}
                    placeholder="Busque ou digite o nome do banco" 
                    className="w-full px-4 py-3 bg-slate-50 rounded-xl border-none focus:ring-2 focus:ring-teal-500/20 text-sm"
                  />
                  {bankIcon && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg overflow-hidden border border-slate-200">
                      <img 
                        src={`https://www.google.com/s2/favicons?domain=${bankIcon}&sz=64`} 
                        alt="" 
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.classList.add('hidden');
                          if (target.nextElementSibling) {
                            target.nextElementSibling.classList.remove('hidden');
                          }
                        }}
                      />
                      <div className="hidden absolute inset-0 flex items-center justify-center font-bold text-slate-400 bg-white">
                        {bankName?.charAt(0)}
                      </div>
                    </div>
                  )}
                </div>

                {showBankOptions && (
                  <div className="absolute top-full left-0 right-0 z-20 mt-2 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden max-h-64 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-2 grid grid-cols-1 gap-1">
                      {BRAZILIAN_BANKS.filter(b => b.name.toLowerCase().includes(bankSearch.toLowerCase())).map(b => (
                        <button
                          key={b.domain}
                          type="button"
                          onClick={() => {
                            setBankName(b.name);
                            setBankIcon(b.domain);
                            setBankSearch(b.name);
                            setShowBankOptions(false);
                          }}
                          className="flex items-center gap-3 w-full px-4 py-3 hover:bg-slate-50 rounded-xl transition-colors text-left"
                        >
                          <div className="w-8 h-8 rounded-lg overflow-hidden border border-slate-100 shrink-0 relative bg-white flex items-center justify-center">
                            <img 
                              src={`https://www.google.com/s2/favicons?domain=${b.domain}&sz=64`} 
                              alt="" 
                              className="w-full h-full object-cover" 
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.classList.add('hidden');
                                if (target.nextElementSibling) {
                                  target.nextElementSibling.classList.remove('hidden');
                                }
                              }}
                            />
                            <div className="hidden absolute inset-0 flex items-center justify-center font-bold text-white text-[10px]" style={{ backgroundColor: b.color || '#94a3b8' }}>
                              {b.name.charAt(0)}
                            </div>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900">{b.name}</p>
                            <p className="text-[10px] text-slate-400 uppercase tracking-tighter">{b.domain}</p>
                          </div>
                        </button>
                      ))}
                      <button 
                         type="button" 
                         onClick={() => setShowBankOptions(false)}
                         className="p-2 text-center text-[10px] text-slate-400 hover:bg-slate-50 uppercase font-bold tracking-widest"
                      >
                         Fechar lista
                      </button>
                    </div>
                  </div>
                )}

                {/* Input de site do banco customizado se não for da lista oficial */}
                {bankSearch && !BRAZILIAN_BANKS.some(b => b.name.toLowerCase() === bankSearch.toLowerCase()) && (
                  <div className="mt-2 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="flex items-center gap-1 px-1">
                      <label className="text-[9px] font-bold text-teal-600 uppercase tracking-wider">Site/Domínio do Banco (para o ícone)</label>
                    </div>
                    <input 
                      type="text"
                      value={bankIcon}
                      onChange={e => setBankIcon(e.target.value.toLowerCase().trim())}
                      placeholder="Ex: portoseguro.com.br"
                      className="w-full px-4 py-2.5 bg-teal-50/50 border border-teal-100 rounded-lg focus:ring-1 focus:ring-teal-500/30 text-xs text-slate-600 placeholder-slate-400 transition-all"
                    />
                  </div>
                )}
              </div>
              {/* Tipo */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tipo</label>
                <div className="relative">
                  <select value={type} onChange={e => setType(e.target.value)} className="w-full px-4 py-3 bg-slate-50 rounded-xl border-none focus:ring-2 focus:ring-teal-500/20 text-sm appearance-none cursor-pointer" style={{ appearance: 'none' }}>
                    <option value="checking">Conta Corrente</option>
                    <option value="savings">Poupança</option>
                    <option value="credit_card">Cartão de Crédito</option>
                    <option value="investment">Investimento</option>
                  </select>
                  <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Saldo Inicial (for non-credit-card) OR Saldo da Fatura (for credit card) */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  {type === 'credit_card' ? 'Saldo da Fatura Anterior (R$)' : 'Saldo Inicial'}
                </label>
                <div className="flex gap-3 items-center">
                  <input 
                    type="text" 
                    value={initialBalance} 
                    onChange={e => setInitialBalance(pushMaskFormat(e.target.value))} 
                    placeholder="0,00"
                    className="flex-1 px-4 py-3 bg-slate-50 rounded-xl border-none focus:ring-2 focus:ring-teal-500/20 text-sm" 
                  />
                  {type === 'credit_card' && (
                    <div className="flex gap-2 text-xs shrink-0">
                      <label className={`flex items-center gap-1.5 px-3 py-2 rounded-lg cursor-pointer transition-colors ${balanceType === 'creditor' ? 'bg-green-100 text-green-700 font-bold' : 'bg-slate-50 text-slate-400'}`}>
                        <input type="radio" name="balanceType" value="creditor" checked={balanceType === 'creditor'} onChange={() => setBalanceType('creditor')} className="sr-only" />
                        Credor
                      </label>
                      <label className={`flex items-center gap-1.5 px-3 py-2 rounded-lg cursor-pointer transition-colors ${balanceType === 'debtor' ? 'bg-rose-100 text-rose-700 font-bold' : 'bg-slate-50 text-slate-400'}`}>
                        <input type="radio" name="balanceType" value="debtor" checked={balanceType === 'debtor'} onChange={() => setBalanceType('debtor')} className="sr-only" />
                        Devedor
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {/* === Credit Card Fields === */}
              {type === 'credit_card' && (
                <div className="space-y-5 pt-4 border-t border-slate-100">
                  <p className="text-[10px] font-bold text-purple-600 uppercase tracking-widest">Dados do Cartão</p>

                  {/* Bandeira do Cartão */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Bandeira</label>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                       {CARD_BRANDS.map(brand => (
                         <button
                           key={brand.id}
                           type="button"
                           onClick={() => setCardBrand(brand.id)}
                           className={`flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl border-2 transition-all ${
                             cardBrand === brand.id 
                               ? 'border-purple-600 bg-purple-50 text-purple-700 shadow-sm' 
                               : 'border-slate-100 bg-white text-slate-400 hover:border-purple-100 hover:bg-slate-50'
                           }`}
                         >
                           <div className="h-6 w-10 flex items-center justify-center">
                             {brand.icon ? (
                               <img src={brand.icon} alt={brand.name} className="max-h-full max-w-full object-contain" />
                             ) : (
                               <CreditCard size={14} />
                             )}
                           </div>
                           <span className="text-[9px] font-bold uppercase tracking-tight">{brand.name}</span>
                         </button>
                       ))}
                    </div>
                  </div>

                  {/* Limite + Tipo de Limite */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Limite (R$)</label>
                      <input 
                        type="text" 
                        value={creditLimit} 
                        onChange={e => setCreditLimit(pushMaskFormat(e.target.value))} 
                        placeholder="0,00" 
                        className="w-full px-3 py-2.5 bg-slate-50 rounded-xl border-none text-sm focus:ring-2 focus:ring-teal-500/20" 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Tipo do Limite</label>
                      <div className="relative">
                        <select value={limitType} onChange={e => setLimitType(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 rounded-xl border-none text-sm focus:ring-2 focus:ring-teal-500/20 appearance-none cursor-pointer" style={{ appearance: 'none' }}>
                          <option value="total">Total</option>
                          <option value="monthly">Mensal</option>
                          <option value="undefined">Indefinido</option>
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  {/* Dia Vencimento + Vencimento da Primeira Fatura */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Dia Vencimento</label>
                      <input type="number" min="1" max="31" value={dueDay} onChange={e => setDueDay(e.target.value)} placeholder="20" className="w-full px-3 py-2.5 bg-slate-50 rounded-xl border-none text-sm focus:ring-2 focus:ring-teal-500/20" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">1ª Fatura (vencimento)</label>
                      <div className="relative">
                        <select 
                          value={firstInvoiceDueDate} 
                          onChange={e => setFirstInvoiceDueDate(e.target.value)} 
                          className="w-full px-3 py-2.5 bg-slate-50 rounded-xl border-none text-sm focus:ring-2 focus:ring-teal-500/20 appearance-none cursor-pointer pr-10"
                          style={{ appearance: 'none' }}
                        >
                          <option value="">Selecione...</option>
                          {firstInvoiceOptions.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  {/* Fechamento da Fatura */}
                  <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <span>Fechamento da fatura:</span>
                      <input 
                        type="number" min="1" max="28" 
                        value={closingDaysBefore} 
                        onChange={e => setClosingDaysBefore(e.target.value)} 
                        className="w-16 px-2 py-1.5 bg-white rounded-lg border border-slate-200 text-sm text-center font-bold focus:ring-2 focus:ring-teal-500/20"
                      />
                      <span>dias antes do vencimento</span>
                      <div className="group relative">
                        <HelpCircle size={14} className="text-slate-400 cursor-help" />
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-800 text-white text-[11px] rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 shadow-xl">
                          Define o período de competência da fatura. Compras até o dia do fechamento entram na fatura atual; após, na próxima.
                        </div>
                      </div>
                    </div>
                    {closingDatePreview && (
                      <p className="text-xs text-slate-400">
                        Próximo fechamento: <span className="font-bold text-slate-600">{closingDatePreview}</span>
                      </p>
                    )}
                  </div>

                  {/* Prever débito na conta */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Prever Débito na Conta</label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setIsDebitAccountDropdownOpen(!isDebitAccountDropdownOpen)}
                        className="w-full px-3 py-2.5 bg-slate-50 rounded-xl border-none text-sm flex items-center justify-between text-left focus:ring-2 focus:ring-teal-500/20 hover:bg-slate-100/60 transition-colors duration-200"
                      >
                        {selectedDebitAccount ? (
                          <div className="flex items-center gap-2 truncate">
                            <div className={`w-6 h-6 rounded-lg flex items-center justify-center border overflow-hidden shrink-0 ${typeColors[selectedDebitAccount.type]} border-slate-200/60`}>
                              {selectedDebitAccount.bank_icon ? (
                                <div className="w-full h-full relative flex items-center justify-center">
                                  <img 
                                    src={`https://www.google.com/s2/favicons?domain=${selectedDebitAccount.bank_icon}&sz=64`} 
                                    alt="" 
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      const target = e.target as HTMLImageElement;
                                      target.classList.add('hidden');
                                      if (target.nextElementSibling) target.nextElementSibling.classList.remove('hidden');
                                    }}
                                  />
                                  <div className="hidden absolute inset-0 flex items-center justify-center font-bold text-[9px] text-white" style={{ backgroundColor: BRAZILIAN_BANKS.find(b => b.domain === selectedDebitAccount.bank_icon)?.color || '#94a3b8' }}>
                                    {selectedDebitAccount.bank_name?.charAt(0) || '?'}
                                  </div>
                                </div>
                              ) : (
                                <div className="text-current scale-75">{typeIcons[selectedDebitAccount.type]}</div>
                              )}
                            </div>
                            <div className="truncate leading-none py-0.5">
                              <span className="font-medium text-slate-700 block text-xs leading-tight truncate">{selectedDebitAccount.name}</span>
                              <span className="text-[9px] text-slate-400 block font-medium uppercase tracking-wider leading-none mt-0.5">{typeLabels[selectedDebitAccount.type]}</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">Nenhuma</span>
                        )}
                        <ChevronDown size={14} className="text-slate-400 shrink-0 ml-2" />
                      </button>

                      {isDebitAccountDropdownOpen && (
                        <>
                          {/* Backdrop invisível para fechar ao clicar fora */}
                          <div className="fixed inset-0 z-40" onClick={() => setIsDebitAccountDropdownOpen(false)} />
                          
                          {/* Painel flutuante */}
                          <div className="absolute z-50 mt-1 w-full bg-white rounded-2xl shadow-xl border border-slate-100 max-h-56 overflow-y-auto p-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
                            <button
                              type="button"
                              onClick={() => {
                                setInvoicePaymentAccountId('');
                                setIsDebitAccountDropdownOpen(false);
                              }}
                              className="flex items-center w-full px-3 py-2 text-left rounded-xl hover:bg-slate-50 text-slate-500 text-xs font-medium hover:text-slate-700 transition-colors mb-0.5"
                            >
                              Nenhuma
                            </button>
                            
                            {paymentAccounts.map(a => (
                              <button
                                key={a.id}
                                type="button"
                                onClick={() => {
                                  setInvoicePaymentAccountId(a.id);
                                  setIsDebitAccountDropdownOpen(false);
                                }}
                                className={`flex items-center gap-2.5 w-full px-2.5 py-2 text-left rounded-xl transition-all duration-200 mb-0.5 ${
                                  invoicePaymentAccountId === a.id 
                                    ? 'bg-teal-50 text-teal-700 ring-1 ring-teal-600/10' 
                                    : 'hover:bg-slate-50 text-slate-600'
                                }`}
                              >
                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center border overflow-hidden shrink-0 ${typeColors[a.type]} border-slate-200/60`}>
                                  {a.bank_icon ? (
                                    <div className="w-full h-full relative flex items-center justify-center">
                                      <img 
                                        src={`https://www.google.com/s2/favicons?domain=${a.bank_icon}&sz=64`} 
                                        alt="" 
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                          const target = e.target as HTMLImageElement;
                                          target.classList.add('hidden');
                                          if (target.nextElementSibling) target.nextElementSibling.classList.remove('hidden');
                                        }}
                                      />
                                      <div className="hidden absolute inset-0 flex items-center justify-center font-bold text-[10px] text-white" style={{ backgroundColor: BRAZILIAN_BANKS.find(b => b.domain === a.bank_icon)?.color || '#94a3b8' }}>
                                        {a.bank_name?.charAt(0) || '?'}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="text-current scale-75">{typeIcons[a.type]}</div>
                                  )}
                                </div>
                                
                                <div className="truncate">
                                  <span className={`block text-xs leading-tight truncate ${invoicePaymentAccountId === a.id ? 'font-bold' : 'font-medium'}`}>{a.name}</span>
                                  <span className={`block text-[9px] mt-0.5 tracking-wider uppercase ${invoicePaymentAccountId === a.id ? 'text-teal-600/70' : 'text-slate-400'}`}>{typeLabels[a.type]}</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Nome do cartão principal + Adicionais */}
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Nome do Cartão Principal</label>
                      <input type="text" value={mainCardName} onChange={e => setMainCardName(e.target.value)} placeholder="Ex: Nome Impresso no Cartão" className="w-full px-3 py-2.5 bg-slate-50 rounded-xl border-none text-sm focus:ring-2 focus:ring-teal-500/20" />
                    </div>

                    {/* Secondary cards */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1.5">
                        <Users size={12} /> Cartões Adicionais
                      </label>
                      {secondaryCards.map((card, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="flex-1 px-3 py-2 bg-slate-50 rounded-lg text-sm text-slate-700">{card}</span>
                          <button type="button" onClick={() => handleRemoveSecondaryCard(i)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                      <div className="flex items-center gap-2">
                        <input 
                          type="text" 
                          value={newSecondaryCard} 
                          onChange={e => setNewSecondaryCard(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddSecondaryCard(); } }}
                          placeholder="Nome do cartão adicional" 
                          className="flex-1 px-3 py-2 bg-slate-50 rounded-lg border-none text-sm focus:ring-2 focus:ring-teal-500/20" 
                        />
                        <button type="button" onClick={handleAddSecondaryCard} className="px-3 py-2 text-xs font-bold text-teal-600 hover:bg-teal-50 rounded-lg transition-colors">
                          + adicional
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => { setIsModalOpen(false); resetForm(); }} className="flex-1 px-4 py-3 text-sm font-bold text-slate-400 hover:text-slate-900 transition-all rounded-xl">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 px-4 py-3 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-teal-600/20 transition-all">
                  {saving ? 'Salvando...' : (editing ? 'Salvar' : 'Criar Conta')} <ArrowRight size={16} />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!accountToDeleteId}
        onClose={() => setAccountToDeleteId(null)}
        onConfirm={() => accountToDeleteId && handleDelete(accountToDeleteId)}
        title="Excluir conta"
        message="Excluir esta conta?"
        confirmLabel="Excluir"
        confirmColor="red"
      />
    </div>
  );
};

export default FinancialAccountsV2;
