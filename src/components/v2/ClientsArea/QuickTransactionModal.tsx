import React, { useState, useEffect } from 'react';
import { X, DollarSign, Calendar, Repeat, Wallet, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../../contexts/AuthContext';
import { criarTransacao } from '../../../lib/financeiro/criarTransacao';
import { getOrCreateContaPrincipal, listarContas } from '../../../lib/financeiro/contaPrincipal';
import type { Database } from '../../../types/supabase';

type Client = Database['public']['Tables']['clients']['Row'];

interface Account {
  id: string;
  name: string;
  type: string;
  is_default: boolean;
}

interface QuickTransactionModalProps {
  client: Client;
  onClose: () => void;
  onSuccess?: () => void;
}

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

export function QuickTransactionModal({ client, onClose, onSuccess }: QuickTransactionModalProps) {
  const { user } = useAuth();

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [firstDate, setFirstDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [period, setPeriod] = useState<'monthly' | 'weekly' | 'quarterly' | 'yearly' | 'daily'>('monthly');
  const [installments, setInstallments] = useState(0);
  const [accountId, setAccountId] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [saving, setSaving] = useState(false);
  const [amountRaw, setAmountRaw] = useState('');

  useEffect(() => {
    if (!user) return;
    setLoadingAccounts(true);
    listarContas(user.id)
      .then((data) => {
        setAccounts(data as Account[]);
        const def = data.find((a: Account) => a.is_default);
        if (def) setAccountId(def.id);
      })
      .catch(() => toast.error('Erro ao carregar contas'))
      .finally(() => setLoadingAccounts(false));
  }, [user]);

  const formatCurrency = (value: string) => {
    const digits = value.replace(/\D/g, '');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!description.trim()) return toast.error('Informe a descrição.');
    if (parsedAmount <= 0) return toast.error('Informe um valor válido.');
    if (!firstDate) return toast.error('Informe a data do primeiro pagamento.');

    setSaving(true);
    try {
      const resolvedAccountId = accountId || await getOrCreateContaPrincipal(user.id);

      if (installments === 0) {
        const { error } = await criarTransacao({
          description: description.trim(),
          amount: parsedAmount,
          type: 'income',
          date: firstDate,
          client_id: client.id,
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
          client_id: client.id,
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
          client_id: client.id,
          account_id: resolvedAccountId,
          modalidade: 'parcelada',
          installment_total: installments,
          recurrence_period: period,
        });
        if (error) throw error;
      }

      toast.success('Lançamento criado com sucesso!');
      onSuccess?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao criar lançamento.');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm font-medium text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all";
  const selectClass = "w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm font-medium text-slate-100 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all cursor-pointer";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1e293b] border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-teal-500/10">
          <div>
            <h2 className="text-lg font-bold text-teal-400 font-manrope">Novo Lançamento</h2>
            <p className="text-slate-300 text-sm mt-0.5 truncate max-w-[260px]">
              Para: <span className="font-semibold text-white">{client.name}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Descrição */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Descrição *
            </label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Ex: Mensalidade, Serviço de consultoria..."
              className={inputClass}
              required
            />
          </div>

          {/* Valor */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Valor *
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <span className="text-slate-500 text-sm font-bold">R$</span>
              </div>
              <input
                type="text"
                value={amount}
                onChange={handleAmountChange}
                placeholder="0,00"
                className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm font-semibold text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                inputMode="numeric"
                required
              />
            </div>
          </div>

          {/* Data do 1º pagamento */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Data do 1º pagamento *
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Calendar size={16} className="text-slate-500" />
              </div>
              <input
                type="date"
                value={firstDate}
                onChange={e => setFirstDate(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm font-medium text-slate-100 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                required
              />
            </div>
          </div>

          {/* Periodicidade e Parcelas */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Repeat size={12} /> Periodicidade
              </label>
              <select
                value={period}
                onChange={e => setPeriod(e.target.value as typeof period)}
                className={selectClass}
              >
                {PERIOD_OPTIONS.map(o => (
                  <option key={o.value} value={o.value} className="bg-slate-900 text-slate-100">{o.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Quantidade
              </label>
              <select
                value={installments}
                onChange={e => setInstallments(Number(e.target.value))}
                className={selectClass}
              >
                {INSTALLMENT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value} className="bg-slate-900 text-slate-100">{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Conta */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Wallet size={12} /> Conta
            </label>
            {loadingAccounts ? (
              <div className="flex items-center gap-2 py-3 px-4 bg-slate-800/60 rounded-xl border border-slate-700">
                <Loader2 size={14} className="animate-spin text-slate-400" />
                <span className="text-sm text-slate-400">Carregando contas...</span>
              </div>
            ) : (
              <select
                value={accountId}
                onChange={e => setAccountId(e.target.value)}
                className={selectClass}
              >
                {accounts.length === 0 && (
                  <option value="" className="bg-slate-900 text-slate-100">Conta Principal (será criada)</option>
                )}
                {accounts.map(a => (
                  <option key={a.id} value={a.id} className="bg-slate-900 text-slate-100">
                    {a.name}{a.is_default ? ' (Principal)' : ''}
                  </option>
                ))}
              </select>
            )}
            {accounts.length === 0 && !loadingAccounts && (
              <p className="flex items-center gap-1.5 text-xs text-amber-400">
                <AlertCircle size={12} />
                Uma "Conta Principal" será criada automaticamente.
              </p>
            )}
          </div>

          {/* Resumo */}
          {parsedAmount > 0 && (
            <div className="p-4 bg-teal-950/30 rounded-xl border border-teal-900/50">
              <p className="text-xs font-bold text-teal-400 uppercase tracking-wider mb-1">Resumo</p>
              <p className="text-sm text-teal-200 font-medium">
                {installments === 0
                  ? `Recorrência ${PERIOD_OPTIONS.find(o => o.value === period)?.label.toLowerCase()} de R$ ${amount}`
                  : installments === 1
                  ? `Lançamento único de R$ ${amount}`
                  : `${installments}x de R$ ${amount} (${PERIOD_OPTIONS.find(o => o.value === period)?.label.toLowerCase()})`
                }
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-slate-700 text-sm font-bold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || parsedAmount <= 0}
              className="flex-1 py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold transition-all shadow-lg shadow-teal-600/20 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {saving ? (
                <><Loader2 size={16} className="animate-spin" /> Salvando...</>
              ) : (
                'Criar Lançamento'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default QuickTransactionModal;
