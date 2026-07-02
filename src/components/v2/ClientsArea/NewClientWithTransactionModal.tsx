import React, { useState, useEffect } from 'react';
import { X, User, Phone, Mail, CheckCircle, Loader2, ChevronRight, ChevronLeft, ArrowRight } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { usePlanLimits } from '../../../hooks/usePlanLimits';
import { criarTransacao } from '../../../lib/financeiro/criarTransacao';
import { getOrCreateContaPrincipal, listarContas } from '../../../lib/financeiro/contaPrincipal';

interface Account {
  id: string;
  name: string;
  is_default: boolean;
}

interface NewClientWithTransactionModalProps {
  onClose: () => void;
  onSuccess?: () => void;
}

type Step = 'client' | 'transaction';

const PERIOD_OPTIONS = [
  { value: 'monthly', label: 'Mensal' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'yearly', label: 'Anual' },
  { value: 'daily', label: 'Diária' },
] as const;

const INSTALLMENT_OPTIONS = [
  { value: 0, label: 'Recorrente (sem fim)' },
  ...Array.from({ length: 24 }, (_, i) => ({ value: i + 1, label: `${i + 1}x` })),
];

export function NewClientWithTransactionModal({ onClose, onSuccess }: NewClientWithTransactionModalProps) {
  const { user } = useAuth();
  const { checkLimit, refreshLimits } = usePlanLimits();
  const [step, setStep] = useState<Step>('client');
  const [saving, setSaving] = useState(false);
  const [createdClientId, setCreatedClientId] = useState<string | null>(null);

  // Step 1 — Client data
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientStatus, setClientStatus] = useState(true);

  // Step 2 — Transaction data
  const [description, setDescription] = useState('');
  const [amountRaw, setAmountRaw] = useState('');
  const [amount, setAmount] = useState('');
  const [firstDate, setFirstDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [period, setPeriod] = useState<'monthly' | 'weekly' | 'quarterly' | 'yearly' | 'daily'>('monthly');
  const [installments, setInstallments] = useState(0);
  const [accountId, setAccountId] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  useEffect(() => {
    if (step === 'transaction' && user) {
      setLoadingAccounts(true);
      listarContas(user.id)
        .then(data => {
          setAccounts(data as Account[]);
          const def = data.find((a: Account) => a.is_default);
          if (def) setAccountId(def.id);
        })
        .catch(() => toast.error('Erro ao carregar contas'))
        .finally(() => setLoadingAccounts(false));
    }
  }, [step, user]);

  const formatCurrency = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (!digits) return '';
    const num = Number(digits) / 100;
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    setAmountRaw(raw);
    setAmount(formatCurrency(raw));
  };

  const parsedAmount = amountRaw ? Number(amountRaw) / 100 : 0;

  // Step 1 — Save client, proceed to step 2
  const handleSaveClient = async () => {
    if (!user) return;
    if (!clientName.trim()) return toast.error('Informe o nome do cliente.');
    if (!checkLimit('clients')) return;

    setSaving(true);
    try {
      const { data: newClient, error } = await supabase
        .from('clients')
        .insert({
          user_id: user.id,
          name: clientName.trim(),
          phone: clientPhone.trim() || null,
          email: clientEmail.trim() || null,
          status: clientStatus,
        })
        .select('id')
        .single();

      if (error) throw error;
      setCreatedClientId(newClient.id);
      refreshLimits();
      setStep('transaction');
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao criar cliente.');
    } finally {
      setSaving(false);
    }
  };

  // Step 2 — Save transaction (or skip)
  const handleSaveTransaction = async () => {
    if (!user || !createdClientId) return;
    if (!description.trim()) return toast.error('Informe a descrição.');
    if (parsedAmount <= 0) return toast.error('Informe um valor válido.');

    setSaving(true);
    try {
      const resolvedAccountId = accountId || await getOrCreateContaPrincipal(user.id);

      if (installments === 0) {
        const { error } = await criarTransacao({
          description: description.trim(),
          amount: parsedAmount,
          type: 'income',
          date: firstDate,
          client_id: createdClientId,
          account_id: resolvedAccountId,
          modalidade: 'recorrente',
          recurrence_period: period,
          recurrence_interval: 1,
        });
        if (error) throw error;
      } else if (installments === 1) {
        const { error } = await criarTransacao({
          description: description.trim(),
          amount: parsedAmount,
          type: 'income',
          date: firstDate,
          client_id: createdClientId,
          account_id: resolvedAccountId,
          modalidade: 'unica',
        });
        if (error) throw error;
      } else {
        const { error } = await criarTransacao({
          description: description.trim(),
          amount: parsedAmount,
          type: 'income',
          date: firstDate,
          client_id: createdClientId,
          account_id: resolvedAccountId,
          modalidade: 'parcelada',
          installment_total: installments,
          recurrence_period: period,
        });
        if (error) throw error;
      }

      toast.success('Cliente e lançamento criados com sucesso!');
      onSuccess?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao criar lançamento.');
    } finally {
      setSaving(false);
    }
  };

  const handleSkipTransaction = () => {
    toast.success('Cliente criado com sucesso!');
    onSuccess?.();
    onClose();
  };

  const inputClass = "w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-teal-600 to-teal-700">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-white font-manrope">Novo Cliente</h2>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-teal-100 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
          {/* Steps indicator */}
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 ${step === 'client' ? 'text-white' : 'text-teal-300'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                step === 'client' ? 'bg-white text-teal-700' :
                createdClientId ? 'bg-teal-500 text-white border-2 border-teal-300' : 'bg-teal-500/40 text-teal-100'
              }`}>
                {createdClientId && step !== 'client' ? <CheckCircle size={14} /> : '1'}
              </div>
              <span className="text-xs font-semibold">Dados do Cliente</span>
            </div>
            <ChevronRight size={14} className="text-teal-300" />
            <div className={`flex items-center gap-1.5 ${step === 'transaction' ? 'text-white' : 'text-teal-300'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                step === 'transaction' ? 'bg-white text-teal-700' : 'bg-teal-500/40 text-teal-100'
              }`}>
                2
              </div>
              <span className="text-xs font-semibold">Lançamento Inicial</span>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* ─── STEP 1: Client Data ─── */}
          {step === 'client' && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <User size={12} /> Nome *
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={e => setClientName(e.target.value)}
                  placeholder="Nome completo do cliente"
                  className={inputClass}
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <Phone size={12} /> Telefone
                  </label>
                  <input
                    type="tel"
                    value={clientPhone}
                    onChange={e => setClientPhone(e.target.value)}
                    placeholder="(11) 99999-9999"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <Mail size={12} /> E-mail
                  </label>
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={e => setClientEmail(e.target.value)}
                    placeholder="email@exemplo.com"
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setClientStatus(s => !s)}
                  className={`relative w-10 h-6 rounded-full transition-colors ${clientStatus ? 'bg-teal-500' : 'bg-slate-300'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${clientStatus ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
                <span className="text-sm font-medium text-slate-700">
                  Cliente {clientStatus ? <span className="text-teal-600 font-bold">ativo</span> : <span className="text-slate-400">inativo</span>}
                </span>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveClient}
                  disabled={saving || !clientName.trim()}
                  className="flex-1 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold transition-all shadow-lg shadow-teal-600/20 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <><Loader2 size={16} className="animate-spin" /> Criando...</>
                  ) : (
                    <>Próximo <ArrowRight size={16} /></>
                  )}
                </button>
              </div>
            </>
          )}

          {/* ─── STEP 2: Transaction ─── */}
          {step === 'transaction' && (
            <>
              <p className="text-xs text-slate-500 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200">
                ✅ Cliente criado. Agora adicione um lançamento recorrente ou pule essa etapa.
              </p>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Descrição *</label>
                <input
                  type="text"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Ex: Mensalidade de julho..."
                  className={inputClass}
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Valor *</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="text-slate-400 text-sm font-bold">R$</span>
                    </div>
                    <input
                      type="text"
                      value={amount}
                      onChange={handleAmountChange}
                      placeholder="0,00"
                      className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                      inputMode="numeric"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">1º Pagamento *</label>
                  <input
                    type="date"
                    value={firstDate}
                    onChange={e => setFirstDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Periodicidade</label>
                  <select
                    value={period}
                    onChange={e => setPeriod(e.target.value as typeof period)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all cursor-pointer"
                  >
                    {PERIOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Quantidade</label>
                  <select
                    value={installments}
                    onChange={e => setInstallments(Number(e.target.value))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all cursor-pointer"
                  >
                    {INSTALLMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Conta</label>
                {loadingAccounts ? (
                  <div className="flex items-center gap-2 py-3 px-4 bg-slate-50 rounded-xl border border-slate-200">
                    <Loader2 size={14} className="animate-spin text-slate-400" />
                    <span className="text-sm text-slate-400">Carregando...</span>
                  </div>
                ) : (
                  <select
                    value={accountId}
                    onChange={e => setAccountId(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all cursor-pointer"
                  >
                    {accounts.length === 0 && <option value="">Conta Principal (será criada)</option>}
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.name}{a.is_default ? ' (Principal)' : ''}</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleSkipTransaction}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Pular etapa
                </button>
                <button
                  type="button"
                  onClick={handleSaveTransaction}
                  disabled={saving || parsedAmount <= 0 || !description.trim()}
                  className="flex-1 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold transition-all shadow-lg shadow-teal-600/20 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <><Loader2 size={16} className="animate-spin" /> Salvando...</>
                  ) : 'Criar Lançamento'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default NewClientWithTransactionModal;
