import { useState, useEffect } from 'react';
import { X, Calendar, CreditCard, DollarSign, Scale, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { format, addMonths, parseISO } from 'date-fns';
import { pagarFatura, editarFatura, lancarDiferencaProximoMes } from '../../lib/financeiro/pagarFatura';

export interface BillTransferInfo {
  id: string;
  amount: number;
  date: string;              // 'YYYY-MM-DD'
  account_id: string | null; // conta de origem do pagamento
  status: string;
}

interface CloseBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  cardId: string;
  invoiceMonth: string; // 'YYYY-MM'
  totalAmount: number;
  dueDate?: string; // 'YYYY-MM-DD' - data de vencimento da fatura sendo fechada
  /** 'edit' altera uma fatura já fechada, sem exigir reabertura. Exige billTransfer. */
  mode?: 'create' | 'edit';
  billTransfer?: BillTransferInfo | null;
}

interface Account {
  id: string;
  name: string;
  bank_icon?: string | null;
}

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
  dueDate,
  mode = 'create',
  billTransfer = null,
}: CloseBillModalProps) {
  const isEdit = mode === 'edit' && !!billTransfer;
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
      setPaymentDate((isEdit ? billTransfer!.date : dueDate) || format(new Date(), 'yyyy-MM-dd'));
      setPaymentAccountId('');
      setAmountInput(
        new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          .format(isEdit ? billTransfer!.amount : totalAmount)
      );
      fetchAccounts(isEdit ? billTransfer!.account_id : null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, totalAmount, dueDate, isEdit, billTransfer?.id]);

  const fetchAccounts = async (preferredAccountId: string | null) => {
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
        // Na edição, mantém a conta que já pagou a fatura; ela pode não ser a primeira da lista.
        const preferred = preferredAccountId && data.some(a => a.id === preferredAccountId)
          ? preferredAccountId
          : data[0].id;
        setPaymentAccountId(preferred);
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar contas bancárias');
    }
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

    setLoading(true);
    try {
      const result = isEdit
        ? await editarFatura({
            transferId: billTransfer!.id,
            cardId,
            invoiceMonth,
            invoiceTotal: totalAmount,
            amount: finalAmount,
            paymentDate,
            paymentAccountId,
          })
        : await pagarFatura({
            cardId,
            invoiceMonth,
            invoiceTotal: totalAmount,
            amount: finalAmount,
            paymentDate,
            paymentAccountId,
          });

      const { data: paymentResult, diff, error } = result;
      if (error || !paymentResult) {
        throw error || new Error(isEdit ? 'Falha ao editar a fatura' : 'Falha ao fechar a fatura');
      }

      if (isEdit) {
        toast.success(paymentResult.isFutureDate ? 'Fatura atualizada e pagamento reagendado!' : 'Fatura atualizada!');
      } else {
        toast.success(paymentResult.isFutureDate ? 'Fatura fechada e pagamento agendado!' : 'Fatura fechada e confirmada!');
      }

      // Acerto do mês seguinte já existente e já pago: não dá para ajustar sozinho.
      const nextMonthLocked = isEdit && (result as { nextMonthLocked?: boolean }).nextMonthLocked;
      if (nextMonthLocked) {
        toast('O acerto lançado no mês seguinte já foi pago e não foi alterado.', { icon: '⚠️' });
      }

      // Só pergunta sobre a diferença quando ainda não existe um acerto no mês seguinte —
      // na edição, um acerto pré-existente já foi atualizado/removido por editarFatura.
      const alreadyHandled = isEdit && (result as { nextMonthHandled?: boolean }).nextMonthHandled;
      if (diff >= 0.01 && !alreadyHandled) {
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
      console.error(isEdit ? 'Erro ao editar fatura:' : 'Erro ao fechar fatura:', err);
      toast.error(isEdit ? 'Não foi possível editar a fatura' : 'Não foi possível fechar a fatura');
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
      const { error } = await lancarDiferencaProximoMes(cardId, pendingDiff.amount, invoiceMonth);
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
              {step === 'form' ? (isEdit ? 'Editar Fatura' : 'Fechar Fatura') : 'Diferença de Saldo'}
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

                {/* Aviso: editar um pagamento já confirmado altera o saldo já realizado da conta */}
                {isEdit && billTransfer!.status === 'paid' && (
                  <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
                    <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-[11px] font-medium text-amber-800 leading-relaxed">
                      Este pagamento já está confirmado. Alterar o valor ou a data muda um movimento
                      já realizado e recalcula o saldo da conta de origem.
                    </p>
                  </div>
                )}

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
                    {isEdit
                      ? 'Alterar o valor recalcula o Acerto de Saldo desta fatura, sem duplicar o acerto anterior.'
                      : `Total calculado: ${totalAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}. Altere para registrar um Acerto de Saldo.`}
                  </p>
                </div>

                {/* Configs */}
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-5">

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                      <Calendar size={14} className="text-[#14b8a6]" />
                      {isEdit ? 'Data do Pagamento' : 'Data de Agendamento'}
                    </label>
                    <input
                      type="date"
                      required
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-[#14b8a6]/20 transition-all"
                    />
                    <p className="text-[10px] text-slate-500 font-medium">
                      {isEdit
                        ? 'Data futura reagenda o pagamento; data de hoje ou passada mantém o pagamento confirmado.'
                        : 'Esta é a data em que o pagamento da fatura será agendado.'}
                    </p>
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
                  {isEdit
                    ? (loading ? 'Salvando...' : 'Salvar Alterações')
                    : (loading ? 'Fechando...' : (paymentDate <= format(new Date(), 'yyyy-MM-dd') ? 'Fechar e Confirmar' : 'Fechar e Agendar'))}
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
                    A fatura foi {isEdit ? 'atualizada' : 'fechada'} com um Acerto de Saldo de{' '}
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
