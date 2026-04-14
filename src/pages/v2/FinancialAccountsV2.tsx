import { useState, useEffect } from 'react';
import { 
  Plus, Pencil, Trash2, X, Building2, CreditCard, Landmark, TrendingUp,
  ChevronDown, ArrowRight
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-hot-toast';

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
  const [creditLimit, setCreditLimit] = useState('');
  const [closingDay, setClosingDay] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchAccounts = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('financial_accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('name');
    if (error) { console.error(error); }
    setAccounts(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAccounts(); }, [user]);

  const resetForm = () => {
    setName(''); setType('checking'); setInitialBalance('0,00');
    setCreditLimit(''); setClosingDay(''); setDueDay('');
    setEditing(null);
  };

  const openNew = () => { resetForm(); setIsModalOpen(true); };

  const openEdit = (a: Account) => {
    setEditing(a);
    setName(a.name);
    setType(a.type);
    setInitialBalance(a.initial_balance.toFixed(2).replace('.', ','));
    setCreditLimit(a.credit_limit ? String(a.credit_limit) : '');
    setClosingDay(a.closing_day ? String(a.closing_day) : '');
    setDueDay(a.due_day ? String(a.due_day) : '');
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta conta?')) return;
    const { error } = await supabase.from('financial_accounts').delete().eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Conta excluída!');
    fetchAccounts();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('Informe o nome da conta.'); return; }

    setSaving(true);
    const parsedBalance = parseFloat(initialBalance.replace(/\./g, '').replace(',', '.')) || 0;
    
    const payload = {
      user_id: user!.id,
      name: name.trim(),
      type,
      initial_balance: parsedBalance,
      credit_limit: type === 'credit_card' && creditLimit ? parseFloat(creditLimit) : null,
      closing_day: type === 'credit_card' && closingDay ? parseInt(closingDay) : null,
      due_day: type === 'credit_card' && dueDay ? parseInt(dueDay) : null,
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
                    {a.credit_limit && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Limite</span>
                        <span className="font-bold text-purple-600">{formatCurrency(a.credit_limit)}</span>
                      </div>
                    )}
                    {a.closing_day && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Fecha dia</span>
                        <span className="font-bold text-slate-700">{a.closing_day}</span>
                      </div>
                    )}
                    {a.due_day && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Vence dia</span>
                        <span className="font-bold text-slate-700">{a.due_day}</span>
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
          <div className="relative w-full max-w-lg bg-white/95 backdrop-blur-2xl rounded-[2rem] shadow-2xl border border-white/20 overflow-hidden">
            <header className="px-6 py-4 flex items-center justify-between border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900 font-manrope">{editing ? 'Editar Conta' : 'Nova Conta'}</h2>
              <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} className="text-slate-500" /></button>
            </header>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Nome</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Banco Inter" className="w-full px-4 py-3 bg-slate-50 rounded-xl border-none focus:ring-2 focus:ring-teal-500/20 text-sm" required />
              </div>
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
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Saldo Inicial</label>
                <input type="text" value={initialBalance} onChange={e => setInitialBalance(e.target.value)} className="w-full px-4 py-3 bg-slate-50 rounded-xl border-none focus:ring-2 focus:ring-teal-500/20 text-sm" />
              </div>
              {type === 'credit_card' && (
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <p className="text-[10px] font-bold text-purple-600 uppercase tracking-widest">Dados do Cartão</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Limite</label>
                      <input type="number" step="0.01" value={creditLimit} onChange={e => setCreditLimit(e.target.value)} placeholder="5000" className="w-full px-3 py-2.5 bg-slate-50 rounded-xl border-none text-sm focus:ring-2 focus:ring-teal-500/20" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Fecha dia</label>
                      <input type="number" min="1" max="31" value={closingDay} onChange={e => setClosingDay(e.target.value)} placeholder="25" className="w-full px-3 py-2.5 bg-slate-50 rounded-xl border-none text-sm focus:ring-2 focus:ring-teal-500/20" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Vence dia</label>
                      <input type="number" min="1" max="31" value={dueDay} onChange={e => setDueDay(e.target.value)} placeholder="5" className="w-full px-3 py-2.5 bg-slate-50 rounded-xl border-none text-sm focus:ring-2 focus:ring-teal-500/20" />
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
