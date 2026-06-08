import { useState, useEffect } from 'react';
import { X, Calendar, CreditCard, DollarSign } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';

interface CloseBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  cardId: string;
  invoiceMonth: string; // 'YYYY-MM'
  totalAmount: number;
}

interface Account {
  id: string;
  name: string;
  bank_icon?: string | null;
}

export default function CloseBillModal({
  isOpen,
  onClose,
  onSuccess,
  cardId,
  invoiceMonth,
  totalAmount
}: CloseBillModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);

  // Form states
  const [paymentDate, setPaymentDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [amount, setAmount] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setPaymentDate(format(new Date(), 'yyyy-MM-dd'));
      setPaymentAccountId('');
      setAmount(totalAmount);
      fetchAccounts();
    }
  }, [isOpen, totalAmount]);

  const fetchAccounts = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('financial_accounts')
        .select('*')
        .eq('user_id', user.id)
        .in('type', ['checking', 'savings'])
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      setAccounts(data || []);
      if (data && data.length > 0) {
        setPaymentAccountId(data[0].id);
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar contas bancárias');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!paymentAccountId) {
      toast.error('Selecione uma conta bancária');
      return;
    }
    if (!paymentDate) {
      toast.error('Selecione a data de agendamento');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('financial_transactions').insert({
        user_id: user.id,
        type: 'transfer',
        amount: amount,
        date: paymentDate,
        description: `Pagamento Fatura - ${invoiceMonth}`,
        account_id: paymentAccountId, // Origin
        destination_account_id: cardId, // Destination (Credit Card)
        status: 'pending', // Pagamento agendado
        invoice_month: invoiceMonth
      });

      if (error) throw error;

      toast.success('Fatura fechada e pagamento agendado!');
      onSuccess();
    } catch (err) {
      console.error('Erro ao fechar fatura:', err);
      toast.error('Não foi possível fechar a fatura');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
      <div 
        className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-slide-left"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-900 text-white shrink-0">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <CreditCard className="text-[#14b8a6]" size={24} />
              Fechar Fatura
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Fatura {invoiceMonth}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto w-full p-6 bg-slate-50">
          <form id="close-bill-form" onSubmit={handleSubmit} className="space-y-6 max-w-sm mx-auto">

            {/* Total Amount (Read-only) */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 text-center">
              <p className="text-xs font-black uppercase tracking-widest text-[#14b8a6] mb-2">Valor da Fatura</p>
              <div className="flex items-center justify-center gap-1">
                <span className="text-slate-400 font-bold">R$</span>
                <span className="text-4xl font-black text-slate-800 tracking-tight">
                  {amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Configs */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-5">
              
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                  <Calendar size={14} className="text-[#14b8a6]" />
                  Data de Agendamento
                </label>
                <input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-[#14b8a6]/20 transition-all"
                />
                <p className="text-[10px] text-slate-500 font-medium">Esta é a data em que o pagamento da fatura será agendado.</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                  <DollarSign size={14} className="text-[#14b8a6]" />
                  Conta de Origem
                </label>
                <select
                  required
                  value={paymentAccountId}
                  onChange={(e) => setPaymentAccountId(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-[#14b8a6]/20 transition-all appearance-none"
                >
                  <option value="" disabled>Selecione a conta...</option>
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500 font-medium">De onde sairá o dinheiro para pagar esta fatura?</p>
              </div>

            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 bg-white shrink-0">
          <div className="flex gap-3 max-w-sm mx-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="close-bill-form"
              disabled={loading}
              className={`flex-1 px-4 py-3 bg-[#14b8a6] hover:bg-teal-600 text-white rounded-xl font-bold shadow-lg shadow-teal-500/30 transition-all ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {loading ? 'Fechando...' : 'Fechar e Agendar'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
