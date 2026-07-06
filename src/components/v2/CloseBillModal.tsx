import { useState, useEffect } from 'react';
import { X, Calendar, CreditCard, DollarSign, Scale } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { format, addMonths, parseISO } from 'date-fns';

interface CloseBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  cardId: string;
  invoiceMonth: string; // 'YYYY-MM'
  totalAmount: number;
  dueDate?: string; // 'YYYY-MM-DD' - data de vencimento da fatura sendo fechada
}

interface Account {
  id: string;
  name: string;
  bank_icon?: string | null;
}

const ACERTO_SALDO_CATEGORY_NAME = 'Acerto de Saldo';

const formatCurrencyInput = (value: string) => {
  const cleanValue = value.replace(/\D/g, '');
  const cents = parseInt(cleanValue || '0');
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
};

const parseCurrencyInput = (value: string) =>
  parseFloat(value.replace(/\./g, '').replace(',', '.')) || 0;

export default function CloseBillModal({
  isOpen,
  onClose,
  onSuccess,
  cardId,
  invoiceMonth,
  totalAmount,
  dueDate
}: CloseBillModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);

  // Form states
  const [paymentDate, setPaymentDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [amountInput, setAmountInput] = useState('0,00');

  // Step de decisão sobre a diferença (quando o valor final é menor que o total da fatura)
  const [step, setStep] = useState<'form' | 'ask-next-month'>('form');
  const [pendingDiff, setPendingDiff] = useState<{ amount: number; nextInvoiceMonth: string; monthLabel: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStep('form');
      setPendingDiff(null);
      setPaymentDate(dueDate || format(new Date(), 'yyyy-MM-dd'));
      setPaymentAccountId('');
      setAmountInput(
        new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totalAmount)
      );
      fetchAccounts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, totalAmount, dueDate]);

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

  const getAcertoSaldoCategoryId = async (): Promise<string | null> => {
    if (!user) return null;
    const { data, error } = await supabase
      .from('financial_categories')
      .select('id')
      .eq('user_id', user.id)
      .eq('name', ACERTO_SALDO_CATEGORY_NAME)
      .is('parent_id', null)
      .maybeSingle();

    if (error) {
      console.error(error);
      return null;
    }
    if (data) return data.id;

    const { data: created, error: createError } = await supabase
      .from('financial_categories')
      .insert({ user_id: user.id, name: ACERTO_SALDO_CATEGORY_NAME, icon: '⚖️' })
      .select('id')
      .single();

    if (createError) {
      console.error(createError);
      return null;
    }
    return created.id;
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmountInput(formatCurrencyInput(e.target.value));
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

    const finalAmount = parseCurrencyInput(amountInput);
    // Positivo = fatura foi reduzida (sobra crédito); negativo = fatura foi aumentada
    const diff = Math.round((totalAmount - finalAmount) * 100) / 100;

    setLoading(true);
    try {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const isFutureDate = paymentDate > todayStr;

      const { error: transferError } = await supabase.from('financial_transactions').insert({
        user_id: user.id,
        type: 'transfer',
        amount: finalAmount,
        date: paymentDate,
        description: `Pagamento Fatura - ${invoiceMonth}`,
        account_id: paymentAccountId, // Origin
        destination_account_id: cardId, // Destination (Credit Card)
        status: isFutureDate ? 'pending' : 'paid',
        paid_date: isFutureDate ? null : paymentDate,
        auto_confirm: isFutureDate,
        invoice_month: invoiceMonth
      });

      if (transferError) throw transferError;

      if (Math.abs(diff) >= 0.01) {
        const categoryId = await getAcertoSaldoCategoryId();
        const { error: adjustError } = await supabase.from('financial_transactions').insert({
          user_id: user.id,
          type: diff > 0 ? 'income' : 'expense',
          amount: Math.abs(diff),
          date: paymentDate,
          description: ACERTO_SALDO_CATEGORY_NAME,
          account_id: cardId,
          category_id: categoryId,
          status: 'paid',
          paid_date: paymentDate,
          invoice_month: invoiceMonth
        });

        if (adjustError) throw adjustError;
      }

      toast.success(isFutureDate ? 'Fatura fechada e pagamento agendado!' : 'Fatura fechada e confirmada!');

      if (diff >= 0.01) {
        const invoiceDate = parseISO(`${invoiceMonth}-01`);
        setPendingDiff({
          amount: diff,
          nextInvoiceMonth: format(addMonths(invoiceDate, 1), 'yyyy-MM'),
          monthLabel: format(invoiceDate, 'MM/yy')
        });
        setStep('ask-next-month');
      } else {
        onSuccess();
      }
    } catch (err) {
      console.error('Erro ao fechar fatura:', err);
      toast.error('Não foi possível fechar a fatura');
    } finally {
      setLoading(false);
    }
  };

  const handleDiscardDiff = () => {
    onSuccess();
  };

  const handlePushDiffToNextMonth = async () => {
    if (!user || !pendingDiff) return;
    setLoading(true);
    try {
      const categoryId = await getAcertoSaldoCategoryId();
      const { error } = await supabase.from('financial_transactions').insert({
        user_id: user.id,
        type: 'expense',
        amount: pendingDiff.amount,
        date: `${pendingDiff.nextInvoiceMonth}-01`,
        description: `Acerto de conta do mês ${pendingDiff.monthLabel}`,
        account_id: cardId,
        category_id: categoryId,
        status: 'pending',
        invoice_month: pendingDiff.nextInvoiceMonth
      });

      if (error) throw error;
      toast.success('Lançamento criado na fatura do mês seguinte!');
      onSuccess();
    } catch (err) {
      console.error('Erro ao lançar diferença no mês seguinte:', err);
      toast.error('Não foi possível criar o lançamento no mês seguinte');
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
              {step === 'form' ? 'Fechar Fatura' : 'Diferença de Saldo'}
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Fatura {invoiceMonth}
            </p>
          </div>
          <button
            onClick={step === 'ask-next-month' ? handleDiscardDiff : onClose}
            className="p-2 hover:bg-slate-800 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {step === 'form' ? (
          <>
            {/* Content */}
            <div className="flex-1 overflow-y-auto w-full p-6 bg-slate-50">
              <form id="close-bill-form" onSubmit={handleSubmit} className="space-y-6 max-w-sm mx-auto">

                {/* Valor da Fatura (editável) */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 text-center space-y-2">
                  <p className="text-xs font-black uppercase tracking-widest text-[#14b8a6]">Valor da Fatura</p>
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-slate-400 font-bold text-2xl">R$</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={amountInput}
                      onChange={handleAmountChange}
                      className="w-40 text-center bg-transparent text-4xl font-black text-slate-800 tracking-tight focus:outline-none focus:ring-2 focus:ring-[#14b8a6]/20 rounded-xl"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 font-medium">
                    Total calculado: {totalAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}. Altere para registrar um Acerto de Saldo.
                  </p>
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
                  {loading ? 'Fechando...' : (paymentDate <= format(new Date(), 'yyyy-MM-dd') ? 'Fechar e Confirmar' : 'Fechar e Agendar')}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Content: pergunta sobre o que fazer com a diferença */}
            <div className="flex-1 overflow-y-auto w-full p-6 bg-slate-50">
              <div className="max-w-sm mx-auto space-y-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 text-center space-y-3">
                  <Scale className="mx-auto text-[#14b8a6]" size={32} />
                  <p className="text-sm text-slate-600">
                    A fatura foi fechada com um Acerto de Saldo de{' '}
                    <span className="font-bold text-slate-800">
                      {pendingDiff?.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>.
                  </p>
                  <p className="text-sm text-slate-600">
                    Deseja lançar essa diferença como despesa na fatura de {pendingDiff?.monthLabel}, ou descartá-la?
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-100 bg-white shrink-0">
              <div className="flex gap-3 max-w-sm mx-auto">
                <button
                  type="button"
                  onClick={handleDiscardDiff}
                  disabled={loading}
                  className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Descartar
                </button>
                <button
                  type="button"
                  onClick={handlePushDiffToNextMonth}
                  disabled={loading}
                  className={`flex-1 px-4 py-3 bg-[#14b8a6] hover:bg-teal-600 text-white rounded-xl font-bold shadow-lg shadow-teal-500/30 transition-all ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {loading ? 'Lançando...' : 'Lançar no próximo mês'}
                </button>
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
