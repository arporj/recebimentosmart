import React, { useState, useEffect, useCallback } from 'react';
import {
  Search, TrendingUp, AlertTriangle, CheckCircle2, Clock,
  DollarSign, Bell, Filter, Calendar, Loader2, Send
} from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, subMonths, addMonths, addDays, addWeeks, addYears, isBefore, isSameDay, isAfter, isSameMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import ConfirmModal from '../../../components/v2/ConfirmModal';

interface Transaction {
  id: string;
  amount: number;
  date: string;
  description: string | null;
  status: 'paid' | 'pending' | 'cancelled';
  client_id: string;
  client_name: string;
  client_email: string | null;
  type: 'income' | 'expense';
}

type TxStatus = 'all' | 'pending' | 'paid' | 'overdue';

export default function CobrancasV2() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<TxStatus>('all');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [sendingNotifFor, setSendingNotifFor] = useState<string | null>(null);
  const [markPaidTx, setMarkPaidTx] = useState<Transaction | null>(null);

  const fetchTransactions = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [{ data: txData, error: txError }, { data: templateData, error: tmplError }] = await Promise.all([
        supabase
          .from('financial_transactions')
          .select('id, amount, date, description, status, client_id, type, parent_id, client:clients!financial_transactions_client_id_fkey(name)')
          .eq('user_id', user.id)
          .not('client_id', 'is', null)
          .neq('status', 'cancelled')
          .eq('is_template', false)
          .eq('type', 'income')
          .gte('date', start)
          .lte('date', end)
          .order('date', { ascending: true }),
        supabase
          .from('financial_transactions')
          .select('id, amount, date, description, status, client_id, type, recurrence_period, recurrence_interval, recurrence_end_date, client:clients!financial_transactions_client_id_fkey(name)')
          .eq('user_id', user.id)
          .not('client_id', 'is', null)
          .neq('status', 'cancelled')
          .eq('is_template', true)
          .eq('recurrence_enabled', true)
          .eq('type', 'income'),
      ]);

      if (txError) throw txError;
      if (tmplError) throw tmplError;

      const mappedPhysical: Transaction[] = (txData || []).map((t: any) => ({
        id: t.id,
        amount: Number(t.amount),
        date: t.date,
        description: t.description,
        status: t.status,
        client_id: t.client_id,
        client_name: t.client?.name || 'Cliente desconhecido',
        client_email: null,
        type: t.type,
      }));

      const endMonthDate = endOfMonth(currentMonth);
      const physicalDatesByParent = new Map<string, Set<string>>();
      (txData || []).forEach((t: any) => {
        if (t.parent_id) {
          if (!physicalDatesByParent.has(t.parent_id)) physicalDatesByParent.set(t.parent_id, new Set());
          physicalDatesByParent.get(t.parent_id)!.add(t.date);
        }
      });

      const virtualOccurrences: Transaction[] = [];
      (templateData || []).forEach((tmpl: any) => {
        const interval = tmpl.recurrence_interval || 1;
        const period = tmpl.recurrence_period || 'monthly';
        const recEndDate = tmpl.recurrence_end_date ? parseISO(tmpl.recurrence_end_date) : null;
        let cursor = parseISO(tmpl.date);
        const parentId = tmpl.id;

        while (isBefore(cursor, endMonthDate) || isSameDay(cursor, endMonthDate)) {
          if (recEndDate && isAfter(cursor, recEndDate)) break;

          const dateStr = format(cursor, 'yyyy-MM-dd');
          if (isSameMonth(cursor, currentMonth)) {
            const alreadyHasPhysical = physicalDatesByParent.get(parentId)?.has(dateStr);
            if (!alreadyHasPhysical) {
              virtualOccurrences.push({
                id: `virtual-${tmpl.id}-${dateStr}`,
                amount: Number(tmpl.amount),
                date: dateStr,
                description: tmpl.description,
                status: 'pending',
                client_id: tmpl.client_id,
                client_name: tmpl.client?.name || 'Cliente desconhecido',
                client_email: null,
                type: tmpl.type,
              });
            }
          }

          switch (period) {
            case 'daily': cursor = addDays(cursor, interval); break;
            case 'weekly': cursor = addWeeks(cursor, interval); break;
            case 'monthly': cursor = addMonths(cursor, interval); break;
            case 'yearly': cursor = addYears(cursor, interval); break;
            default: cursor = addMonths(cursor, interval);
          }
        }
      });

      const allTxs = [...mappedPhysical, ...virtualOccurrences].sort((a, b) => a.date.localeCompare(b.date));
      setTransactions(allTxs);
    } catch {
      toast.error('Erro ao carregar cobranças.');
    } finally {
      setLoading(false);
    }
  }, [user, currentMonth]);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isOverdue = (tx: Transaction) =>
    tx.status === 'pending' && new Date(tx.date + 'T00:00:00') < today;

  const filtered = transactions.filter(tx => {
    const matchesSearch = tx.client_name.toLowerCase().includes(searchTerm.toLowerCase())
      || tx.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' ? true
      : statusFilter === 'overdue' ? isOverdue(tx)
      : statusFilter === 'pending' ? tx.status === 'pending' && !isOverdue(tx)
      : tx.status === 'paid';
    return matchesSearch && matchesStatus;
  });

  const totalReceived = transactions.filter(t => t.status === 'paid').reduce((s, t) => s + t.amount, 0);
  const totalPending = transactions.filter(t => t.status === 'pending' && !isOverdue(t)).reduce((s, t) => s + t.amount, 0);
  const totalOverdue = transactions.filter(t => isOverdue(t)).reduce((s, t) => s + t.amount, 0);
  const totalAll = transactions.reduce((s, t) => s + t.amount, 0);

  const formatCurrency = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const handleSendNotif = async (tx: Transaction) => {
    setSendingNotifFor(tx.id);
    try {
      const { data, error } = await supabase.functions.invoke('send-client-notification-manual', {
        body: { client_id: tx.client_id },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(`E-mail enviado para ${data.sentTo}`);
      } else {
        toast.error(data?.error || 'Não foi possível enviar o e-mail.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao enviar notificação.');
    } finally {
      setSendingNotifFor(null);
    }
  };

  const handleMarkAsPaid = async () => {
    if (!markPaidTx) return;
    try {
      const { error } = await supabase
        .from('financial_transactions')
        .update({ status: 'paid' })
        .eq('id', markPaidTx.id);
      if (error) throw error;
      toast.success('Cobrança marcada como paga!');
      setMarkPaidTx(null);
      fetchTransactions();
    } catch {
      toast.error('Erro ao atualizar cobrança.');
    }
  };

  const monthLabel = format(currentMonth, 'MMMM yyyy', { locale: ptBR });

  return (
    <div className="p-6 space-y-6 min-h-screen">
      {/* ─── Header ─── */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 font-manrope">Cobranças</h1>
          <p className="text-slate-400 text-sm mt-1">Lançamentos de receita vinculados a clientes.</p>
        </div>

        {/* Month navigation */}
        <div className="flex items-center gap-2 bg-[#1e293b] border border-slate-800 rounded-xl px-4 py-2.5 shadow-sm">
          <button
            onClick={() => setCurrentMonth(m => subMonths(m, 1))}
            className="p-1 text-slate-400 hover:text-slate-200 transition-colors"
          >
            ‹
          </button>
          <span className="text-sm font-bold text-slate-200 capitalize min-w-[140px] text-center">
            {monthLabel}
          </span>
          <button
            onClick={() => setCurrentMonth(m => addMonths(m, 1))}
            className="p-1 text-slate-400 hover:text-slate-200 transition-colors"
          >
            ›
          </button>
        </div>
      </div>

      {/* ─── KPI Cards ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total do Mês', value: formatCurrency(totalAll), icon: DollarSign, color: 'text-slate-300', bg: 'bg-slate-800' },
          { label: 'Recebido', value: formatCurrency(totalReceived), icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: 'A Vencer', value: formatCurrency(totalPending), icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500/10' },
          { label: 'Em Atraso', value: formatCurrency(totalOverdue), icon: AlertTriangle, color: 'text-rose-400', bg: 'bg-rose-500/10' },
        ].map(kpi => (
          <div key={kpi.label} className="bg-[#1e293b] rounded-2xl p-4 shadow-sm border border-slate-800 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl ${kpi.bg} flex items-center justify-center shrink-0`}>
              <kpi.icon size={18} className={kpi.color} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{kpi.label}</p>
              <p className={`text-lg font-black ${kpi.color} font-manrope`}>{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Filters ─── */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar por cliente ou descrição..."
            className="w-full pl-11 pr-4 py-3 bg-[#1e293b] rounded-xl border border-slate-800 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-sm font-medium text-slate-100 placeholder:text-slate-500 transition-all shadow-sm"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'pending', 'overdue', 'paid'] as TxStatus[]).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                statusFilter === f
                  ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/20'
                  : 'bg-[#1e293b] text-slate-300 border border-slate-800 hover:border-slate-700'
              }`}
            >
              {{ all: 'Todos', pending: 'A vencer', overdue: 'Em atraso', paid: 'Pagos' }[f]}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Table ─── */}
      <div className="bg-[#1e293b] rounded-2xl shadow-sm border border-slate-800 overflow-hidden">
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center text-slate-400 space-y-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
            <span className="text-sm font-medium">Carregando cobranças...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <DollarSign size={32} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium text-sm">
              {searchTerm || statusFilter !== 'all'
                ? 'Nenhuma cobrança encontrada com esses filtros.'
                : `Nenhuma cobrança em ${monthLabel}.`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900/50 border-b border-slate-800">
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Cliente</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Descrição</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Vencimento</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Valor</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map(tx => {
                  const overdue = isOverdue(tx);
                  return (
                    <tr key={tx.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-100 text-sm">{tx.client_name}</p>
                        {tx.client_email && (
                          <p className="text-xs text-slate-400 mt-0.5">{tx.client_email}</p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-slate-300 max-w-[200px] truncate">{tx.description || '—'}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className={`text-sm font-semibold ${overdue ? 'text-rose-400' : 'text-slate-200'}`}>
                          {format(parseISO(tx.date), 'dd/MM/yyyy')}
                        </p>
                        {overdue && (
                          <p className="text-xs text-rose-400 font-medium">Vencido</p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <p className={`font-black text-sm ${overdue ? 'text-rose-400' : 'text-slate-100'}`}>
                          {formatCurrency(tx.amount)}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {tx.status === 'paid' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 size={10} /> Pago
                          </span>
                        ) : overdue ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            <AlertTriangle size={10} /> Atrasado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            <Clock size={10} /> Pendente
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1">
                          {tx.status !== 'paid' && (
                            <button
                              onClick={() => setMarkPaidTx(tx)}
                              className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-xl transition-all"
                              title="Marcar como pago"
                            >
                              <CheckCircle2 size={15} />
                            </button>
                          )}
                          <button
                            onClick={() => handleSendNotif(tx)}
                            disabled={sendingNotifFor === tx.id}
                            className="p-2 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-xl transition-all disabled:opacity-50"
                            title="Enviar notificação por e-mail"
                          >
                            {sendingNotifFor === tx.id ? (
                              <Loader2 size={15} className="animate-spin" />
                            ) : (
                              <Send size={15} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="px-6 py-4 border-t border-slate-100">
              <p className="text-sm text-slate-500">
                <span className="font-semibold text-slate-800">{filtered.length}</span> lançamento{filtered.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ─── Mark Paid Confirm ─── */}
      <ConfirmModal
        isOpen={!!markPaidTx}
        onClose={() => setMarkPaidTx(null)}
        onConfirm={() => markPaidTx && handleMarkPaid(markPaidTx)}
        title="Confirmar Recebimento"
        message={
          <div className="space-y-1">
            <p>Marcar como <strong className="text-emerald-700">recebido</strong> o lançamento de</p>
            <p className="font-bold text-slate-900">{markPaidTx?.client_name}</p>
            <p className="text-teal-700 font-black text-lg">{markPaidTx ? formatCurrency(markPaidTx.amount) : ''}</p>
          </div>
        }
        confirmLabel="Confirmar Recebimento"
        confirmColor="green"
      />
    </div>
  );
}
