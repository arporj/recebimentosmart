import { useState, useEffect, useMemo } from 'react';
import { 
  Plus, Pencil, Trash2, X, Building2, CreditCard, Landmark, TrendingUp,
  ChevronDown, ArrowRight, Users, HelpCircle
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { format, subDays, setDate } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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
    maximumFractionDigits: 2
  }).format(cents / 100);
};

const parsePushMask = (formatted: string): number =>
  parseFloat(formatted.replace(/\./g, '').replace(',', '.')) || 0;

const FinancialAccountsV2 = () => {
  const { user } = useAuth();
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
  const [saving, setSaving] = useState(false);

  // Computed: closing date preview
  const closingDatePreview = useMemo(() => {
    const due = parseInt(dueDay);
    const daysBefore = parseInt(closingDaysBefore);
    if (!due || !daysBefore || due < 1 || due > 31) return null;
    try {
      const now = new Date();
      const dueDate = setDate(now, due);
      const closingDate = subDays(dueDate, daysBefore);
      return format(closingDate, "dd/MM/yyyy", { locale: ptBR });
    } catch {
      return null;
    }
  }, [dueDay, closingDaysBefore]);

  // Non-credit-card accounts for the payment account selector
  const paymentAccounts = useMemo(() =>
    accounts.filter(a => a.type !== 'credit_card' && (editing ? a.id !== editing.id : true)),
    [accounts, editing]
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

  useEffect(() => { fetchAccounts(); }, [user]);

  const resetForm = () => {
    setName(''); setType('checking'); setInitialBalance('0,00'); setBalanceType('debtor');
    setCreditLimit('0,00'); setLimitType('total');
    setDueDay(''); setFirstInvoiceDueDate(''); setClosingDaysBefore('10');
    setInvoicePaymentAccountId(''); setMainCardName('');
    setSecondaryCards([]); setNewSecondaryCard('');
    setEditing(null);
  };

  const openNew = () => { resetForm(); setIsModalOpen(true); };

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
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta conta?')) return;
    const { error } = await supabase.from('financial_accounts').delete().eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Conta excluída!');
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

    setSaving(true);
    const isCC = type === 'credit_card';
    const parsedBalance = parsePushMask(initialBalance) * (balanceType === 'creditor' ? -1 : 1);
    
    const payload: Record<string, unknown> = {
      user_id: user!.id,
      name: name.trim(),
      type,
      initial_balance: parsedBalance,
      credit_limit: isCC ? parsePushMask(creditLimit) : null,
      closing_day: null, // Deprecated: now using closing_days_before
      due_day: isCC && dueDay ? parseInt(dueDay) : null,
      limit_type: isCC ? limitType : null,
      first_invoice_due_date: isCC && firstInvoiceDueDate ? firstInvoiceDueDate : null,
      closing_days_before: isCC && closingDaysBefore ? parseInt(closingDaysBefore) : null,
      invoice_payment_account_id: isCC && invoicePaymentAccountId ? invoicePaymentAccountId : null,
      main_card_name: isCC && mainCardName.trim() ? mainCardName.trim() : null,
      secondary_cards: isCC && secondaryCards.length > 0 ? secondaryCards : null,
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full py-12 text-center text-slate-400 italic">Carregando...</div>
        ) : accounts.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-400 italic">Nenhuma conta cadastrada. Clique em "Nova Conta" para começar.</div>
        ) : (
          accounts.map(a => (
            <div key={a.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col gap-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${typeColors[a.type]}`}>
                    {typeIcons[a.type]}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">{a.name}</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium border ${typeColors[a.type]}`}>
                      {typeLabels[a.type]}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(a)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => handleDelete(a.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
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
                  </>
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
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Nome</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Nubank, Carteira, Itaú" className="w-full px-4 py-3 bg-slate-50 rounded-xl border-none focus:ring-2 focus:ring-teal-500/20 text-sm" required />
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
                      <input type="date" value={firstInvoiceDueDate} onChange={e => setFirstInvoiceDueDate(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 rounded-xl border-none text-sm focus:ring-2 focus:ring-teal-500/20" />
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
                      <select 
                        value={invoicePaymentAccountId} 
                        onChange={e => setInvoicePaymentAccountId(e.target.value)} 
                        className="w-full px-3 py-2.5 bg-slate-50 rounded-xl border-none text-sm focus:ring-2 focus:ring-teal-500/20 appearance-none cursor-pointer" 
                        style={{ appearance: 'none' }}
                      >
                        <option value="">Nenhuma</option>
                        {paymentAccounts.map(a => (
                          <option key={a.id} value={a.id}>{a.name} ({typeLabels[a.type]})</option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
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
    </div>
  );
};

export default FinancialAccountsV2;
