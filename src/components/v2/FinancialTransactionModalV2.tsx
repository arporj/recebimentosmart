import React, { useState, useEffect } from 'react';
import { 
  X, 
  Search, 
  Calendar as CalendarIcon, 
  Plus, 
  Tag as TagIcon,
  CheckSquare,
  Square,
  ArrowRight,
  TrendingUp,
  ChevronDown,
  User,
  AlertCircle,
  CreditCard,
  DollarSign
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface Client {
  id: string;
  name: string;
}

interface FinancialTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialType?: 'income' | 'expense';
}

const FinancialTransactionModalV2: React.FC<FinancialTransactionModalProps> = ({ 
  isOpen, 
  onClose, 
  onSuccess,
  initialType = 'income' 
}) => {
  const { user } = useAuth();
  const [type, setType] = useState<'income' | 'expense'>(initialType);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [description, setDescription] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState('monthly');
  const [dayOfMonth, setDayOfMonth] = useState('10');
  const [clientId, setClientId] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  
  const [clients, setClients] = useState<Client[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      fetchClients();
      fetchTags();
      setType(initialType);
    }
  }, [isOpen, user, initialType]);

  const fetchClients = async () => {
    const { data } = await supabase
      .from('clients')
      .select('id, name')
      .eq('user_id', user?.id)
      .order('name');
    if (data) setClients(data);
  };

  const fetchTags = async () => {
    const { data } = await supabase
      .from('financial_tags')
      .select('*')
      .eq('user_id', user?.id)
      .order('name');
    if (data) setTags(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!amount || parseFloat(amount.replace(',', '.')) <= 0) {
      toast.error('Informe um valor válido');
      return;
    }

    try {
      setLoading(true);
      
      const { data: transaction, error: tError } = await supabase
        .from('financial_transactions')
        .insert({
          user_id: user.id,
          type,
          amount: parseFloat(amount.replace(',', '.')),
          date,
          description,
          status: 'pending',
          client_id: clientId || null,
          is_recurring: isRecurring,
          frequency: isRecurring ? frequency : null,
          day_of_month: isRecurring ? parseInt(dayOfMonth) : null
        })
        .select()
        .single();

      if (tError) throw tError;

      if (selectedTags.length > 0 && transaction) {
        const tagRelations = selectedTags.map(tagId => ({
          transaction_id: transaction.id,
          tag_id: tagId
        }));
        const { error: tagError } = await supabase
          .from('transaction_tags')
          .insert(tagRelations);
        
        if (tagError) throw tagError;
      }

      toast.success('Lançamento realizado com sucesso!');
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error('Erro ao salvar lançamento: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className="relative w-full max-w-2xl bg-white/90 backdrop-blur-2xl rounded-[2rem] shadow-2xl overflow-hidden border border-white/20 animate-in fade-in zoom-in duration-300">
        <header className="px-6 py-4 flex justify-between items-center border-b border-slate-100 bg-white/50">
          <div className="flex items-center gap-3">
            <button 
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors"
            >
              <X size={20} className="text-slate-500" />
            </button>
            <h2 className="text-lg font-bold text-slate-900 font-manrope">Nova Transação</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-extrabold text-teal-600 tracking-widest uppercase opacity-60">Recebimento $mart</span>
          </div>
        </header>

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
            </div>
          </div>

          {/* Amount Input */}
          <div className="text-center space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Valor do Lançamento</label>
            <div className="flex items-baseline justify-center gap-2">
              <span className={`text-2xl font-bold opacity-60 ${type === 'income' ? 'text-teal-600' : 'text-rose-600'}`}>R$</span>
              <input 
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                className="bg-transparent border-none focus:ring-0 text-5xl md:text-6xl font-extrabold text-slate-900 text-center w-full max-w-md placeholder-slate-200"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Client Select */}
            <div className="space-y-2">
              <div className="flex justify-between items-center px-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Cliente (Opcional)</label>
                <button type="button" className="text-[10px] font-bold uppercase tracking-widest text-teal-600 hover:underline">+ Novo</button>
              </div>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <select 
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-teal-500/20 text-sm appearance-none"
                >
                  <option value="">Nenhum cliente selecionado</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              </div>
            </div>

            {/* Date Input */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 px-1">Data de Vencimento</label>
              <div className="relative">
                <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-teal-500/20 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 px-1">Descrição</label>
            <input 
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Aluguel, Venda de Equipamento..."
              className="w-full px-4 py-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-teal-500/20 text-sm"
            />
          </div>

          {/* Tags */}
          <div className="space-y-3">
            <div className="flex justify-between items-center px-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Tags / Categorias</label>
              <button type="button" className="text-[10px] font-bold uppercase tracking-widest text-teal-600 hover:underline">+ Nova Tag</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => {
                    setSelectedTags(prev => 
                      prev.includes(tag.id) ? prev.filter(id => id !== tag.id) : [...prev, tag.id]
                    );
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
                    selectedTags.includes(tag.id) 
                      ? 'bg-slate-900 text-white border-slate-900 shadow-md' 
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />
                  {tag.name}
                </button>
              ))}
              {tags.length === 0 && <span className="text-xs text-slate-400 italic">Nenhuma tag cadastrada.</span>}
            </div>
          </div>

          {/* Recurrence */}
          <div className="p-6 bg-slate-50 rounded-3xl space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button 
                  type="button"
                  onClick={() => setIsRecurring(!isRecurring)}
                  className={`p-1 rounded-lg transition-all ${isRecurring ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/20' : 'bg-white text-slate-300 border border-slate-200'}`}
                >
                  {isRecurring ? <CheckSquare size={20} /> : <Square size={20} />}
                </button>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Transação Recorrente</h3>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Gerar cobranças automáticas</p>
                </div>
              </div>
              <AlertCircle size={20} className="text-teal-600 opacity-40" />
            </div>

            {isRecurring && (
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200 animate-in slide-in-from-top-2 duration-300">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Frequência</label>
                  <select 
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value)}
                    className="w-full px-4 py-3 bg-white rounded-xl border-none text-sm focus:ring-2 focus:ring-teal-500/20 shadow-sm"
                  >
                    <option value="weekly">Semanal</option>
                    <option value="monthly">Mensal</option>
                    <option value="yearly">Anual</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Dia do Mês</label>
                  <select 
                    value={dayOfMonth}
                    onChange={(e) => setDayOfMonth(e.target.value)}
                    className="w-full px-4 py-3 bg-white rounded-xl border-none text-sm focus:ring-2 focus:ring-teal-500/20 shadow-sm"
                  >
                    {Array.from({ length: 31 }, (_, i) => (
                      <option key={i+1} value={i+1}>Dia {i+1}</option>
                    ))}
                    <option value="99">Último dia</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </form>

        <footer className="p-6 bg-slate-50/80 backdrop-blur-md border-t border-slate-100 flex flex-col md:flex-row gap-4 items-center justify-between">
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
              type === 'income' 
                ? 'bg-teal-600 hover:bg-teal-700 shadow-teal-600/20' 
                : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
            }`}
          >
            {loading ? 'Salvando...' : 'Confirmar Lançamento'}
            <ArrowRight size={18} />
          </button>
        </footer>
      </div>
    </div>
  );
};

export default FinancialTransactionModalV2;
