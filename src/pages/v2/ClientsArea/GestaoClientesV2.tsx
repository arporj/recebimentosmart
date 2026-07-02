import React, { useState, useEffect, useCallback } from 'react';
import {
  Search, UserPlus, Bell, Plus, Filter, AlertTriangle,
  CheckCircle2, Users, TrendingUp, Clock, Globe, MoreVertical,
  Pencil, Trash2, Eye, User, Phone, Mail, BellOff
} from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, subMonths, addMonths, addDays, addWeeks, addYears, isBefore, isSameDay, isAfter, isSameMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { usePlanLimits } from '../../../hooks/usePlanLimits';
import { toast } from 'react-hot-toast';
import ConfirmModal from '../../../components/v2/ConfirmModal';
import { NewClientWithTransactionModal } from '../../../components/v2/ClientsArea/NewClientWithTransactionModal';
import { QuickTransactionModal } from '../../../components/v2/ClientsArea/QuickTransactionModal';
import { ClientNotificationConfig } from '../../../components/v2/ClientsArea/ClientNotificationConfig';
import { GlobalNotificationSettings } from '../../../components/v2/ClientsArea/GlobalNotificationSettings';
import ClientStatementModalV2 from '../../../components/v2/ClientStatementModalV2';
import { gerarOcorrencias } from '../../../lib/financeiro/gerarOcorrencias';
import type { Database } from '../../../types/supabase';

type Client = Database['public']['Tables']['clients']['Row'];

interface ClientSummary {
  client: Client;
  pendingCount: number;
  overdueCount: number;
  totalIncomePending: number;
  totalExpensePending: number;
  netPending: number;
  nextDueDate: string | null;
  hasNotificationConfig: boolean;
}

type PaymentFilter = 'all' | 'ok' | 'overdue' | 'none';
type StatusFilter = 'all' | 'active' | 'inactive';

export default function GestaoClientesV2() {
  const { user } = useAuth();
  const { checkLimit, refreshLimits } = usePlanLimits();

  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [clients, setClients] = useState<Client[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [notifConfigs, setNotifConfigs] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all');

  // Modals state
  const [showNewClientModal, setShowNewClientModal] = useState(false);
  const [quickTxClient, setQuickTxClient] = useState<Client | null>(null);
  const [notifClient, setNotifClient] = useState<Client | null>(null);
  const [statementClient, setStatementClient] = useState<{ id: string; name: string } | null>(null);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [showGlobalNotif, setShowGlobalNotif] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const start = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
      const end = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

      const [{ data: clientsData }, { data: txData }, { data: templateData }, { data: notifData }] = await Promise.all([
        supabase
          .from('clients')
          .select('*')
          .eq('user_id', user.id)
          .is('deleted_at', null)
          .order('name', { ascending: true }),
        supabase
          .from('financial_transactions')
          .select('id, amount, date, status, client_id, type, parent_id')
          .eq('user_id', user.id)
          .not('client_id', 'is', null)
          .neq('status', 'cancelled')
          .eq('is_template', false)
          .gte('date', start)
          .lte('date', end),
        supabase
          .from('financial_transactions')
          .select('id, amount, date, status, client_id, type, recurrence_period, recurrence_interval, recurrence_end_date')
          .eq('user_id', user.id)
          .not('client_id', 'is', null)
          .neq('status', 'cancelled')
          .eq('is_template', true)
          .eq('recurrence_enabled', true),
        supabase
          .from('client_notification_settings')
          .select('client_id')
          .eq('user_id', user.id)
          .not('client_id', 'is', null)
          .eq('is_active', true),
      ]);

      // Process virtual occurrences from templates for currentMonth
      const endMonthDate = endOfMonth(currentMonth);
      const physicalMonthsByParent = new Map<string, Set<string>>();
      (txData || []).forEach((t: any) => {
        if (t.parent_id) {
          if (!physicalMonthsByParent.has(t.parent_id)) physicalMonthsByParent.set(t.parent_id, new Set());
          physicalMonthsByParent.get(t.parent_id)!.add(t.date.substring(0, 7));
        }
      });

      const virtualOccurrences: any[] = [];
      (templateData || []).forEach((tmpl: any) => {
        const interval = tmpl.recurrence_interval || 1;
        const period = tmpl.recurrence_period || 'monthly';
        const recEndDate = tmpl.recurrence_end_date ? parseISO(tmpl.recurrence_end_date) : null;
        let cursor = parseISO(tmpl.date);
        const parentId = tmpl.id;

        while (isBefore(cursor, endMonthDate) || isSameDay(cursor, endMonthDate)) {
          if (recEndDate && isAfter(cursor, recEndDate)) break;

          const dateStr = format(cursor, 'yyyy-MM-dd');
          const monthKey = dateStr.substring(0, 7);
          if (isSameMonth(cursor, currentMonth)) {
            const alreadyHasPhysicalInMonth = physicalMonthsByParent.get(parentId)?.has(monthKey);
            if (!alreadyHasPhysicalInMonth) {
              virtualOccurrences.push({
                id: `virtual-${tmpl.id}-${dateStr}`,
                amount: Number(tmpl.amount),
                date: dateStr,
                status: 'pending',
                client_id: tmpl.client_id,
                type: tmpl.type,
                isVirtual: true,
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

      setClients(clientsData || []);
      setTransactions([...(txData || []), ...virtualOccurrences]);

      const notifMap: Record<string, boolean> = {};
      (notifData || []).forEach((n: any) => {
        if (n.client_id) notifMap[n.client_id] = true;
      });
      setNotifConfigs(notifMap);
    } catch {
      toast.error('Erro ao carregar dados dos clientes.');
    } finally {
      setLoading(false);
    }
  }, [user, currentMonth]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleDeleteClient = async (client: Client) => {
    try {
      const { error } = await supabase
        .from('clients')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', client.id);
      if (error) throw error;
      toast.success('Cliente removido.');
      setClientToDelete(null);
      fetchAll();
      refreshLimits();
    } catch {
      toast.error('Erro ao remover cliente.');
    }
  };

  // Build summaries (agora inclui income e expense!)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const summaries: ClientSummary[] = clients.map(client => {
    const clientTxs = transactions.filter(t => t.client_id === client.id);
    const pending = clientTxs.filter(t => t.status !== 'paid');
    const overdue = pending.filter(t => new Date(t.date + 'T00:00:00') < today);

    const totalIncomePending = pending
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const totalExpensePending = pending
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const netPending = totalIncomePending - totalExpensePending;
    const sorted = [...pending].sort((a, b) => a.date.localeCompare(b.date));

    return {
      client,
      pendingCount: pending.length,
      overdueCount: overdue.length,
      totalIncomePending,
      totalExpensePending,
      netPending,
      nextDueDate: sorted[0]?.date || null,
      hasNotificationConfig: !!notifConfigs[client.id],
    };
  });

  const filtered = summaries.filter(s => {
    const matchesSearch = s.client.name.toLowerCase().includes(searchTerm.toLowerCase())
      || (s.client.phone && s.client.phone.includes(searchTerm));
    const matchesStatus = statusFilter === 'all' ? true
      : statusFilter === 'active' ? s.client.status
      : !s.client.status;
    const matchesPayment = paymentFilter === 'all' ? true
      : paymentFilter === 'overdue' ? s.overdueCount > 0
      : paymentFilter === 'ok' ? s.pendingCount > 0 && s.overdueCount === 0
      : s.pendingCount === 0;
    return matchesSearch && matchesStatus && matchesPayment;
  });

  // KPI totals
  const totalClients = clients.filter(c => c.status).length;
  const totalOverdue = summaries.filter(s => s.overdueCount > 0).length;
  const totalIncomeAll = summaries.reduce((sum, s) => sum + s.totalIncomePending, 0);
  const totalExpenseAll = summaries.reduce((sum, s) => sum + s.totalExpensePending, 0);
  const totalWithNotif = Object.keys(notifConfigs).length;

  const formatCurrency = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const monthLabel = format(currentMonth, 'MMMM yyyy', { locale: ptBR });

  return (
    <div className="p-6 space-y-6 min-h-screen">
      {/* ─── Header ─── */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 font-manrope">Gestão de Clientes</h1>
          <p className="text-slate-400 text-sm mt-1">Visão consolidada de entradas e saídas por cliente.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Month selector */}
          <div className="flex items-center gap-2 bg-[#1e293b] border border-slate-800 rounded-xl px-4 py-2 shadow-sm">
            <button
              onClick={() => setCurrentMonth(m => subMonths(m, 1))}
              className="p-1 text-slate-400 hover:text-slate-200 transition-colors"
            >
              ‹
            </button>
            <span className="text-sm font-bold text-slate-200 capitalize min-w-[130px] text-center">
              {monthLabel}
            </span>
            <button
              onClick={() => setCurrentMonth(m => addMonths(m, 1))}
              className="p-1 text-slate-400 hover:text-slate-200 transition-colors"
            >
              ›
            </button>
          </div>

          <button
            onClick={() => setShowGlobalNotif(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-800 bg-[#1e293b] text-sm font-bold text-slate-300 hover:border-slate-700 hover:text-white transition-all shadow-sm"
          >
            <Globe size={16} /> Notif. Global
          </button>
          <button
            onClick={() => { if (checkLimit('clients')) setShowNewClientModal(true); }}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-teal-600/20"
          >
            <UserPlus size={16} /> Novo Cliente
          </button>
        </div>
      </div>

      {/* ─── KPI Cards ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Clientes Ativos', value: totalClients, icon: Users, color: 'text-teal-400', bg: 'bg-teal-500/10', sub: 'cadastrados' },
          { label: 'Em Atraso', value: totalOverdue, icon: AlertTriangle, color: 'text-rose-400', bg: 'bg-rose-500/10', sub: 'clientes' },
          { label: 'A Receber (Mês)', value: formatCurrency(totalIncomeAll), icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-500/10', sub: monthLabel },
          { label: 'A Pagar (Mês)', value: formatCurrency(totalExpenseAll), icon: Clock, color: 'text-rose-400', bg: 'bg-rose-500/10', sub: monthLabel },
        ].map(kpi => (
          <div key={kpi.label} className="bg-[#1e293b] rounded-2xl p-4 shadow-sm border border-slate-800 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl ${kpi.bg} flex items-center justify-center shrink-0`}>
              <kpi.icon size={18} className={kpi.color} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{kpi.label}</p>
              <p className={`text-xl font-black ${kpi.color} font-manrope`}>{kpi.value}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{kpi.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Search and Filters ─── */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome ou telefone..."
            className="w-full pl-11 pr-4 py-3 bg-[#1e293b] rounded-xl border border-slate-800 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-sm font-medium text-slate-100 placeholder:text-slate-500 transition-all shadow-sm"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as StatusFilter)}
            className="px-4 py-3 bg-[#1e293b] border border-slate-800 rounded-xl text-sm font-medium text-slate-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all shadow-sm cursor-pointer"
          >
            <option value="all" className="bg-slate-900 text-slate-100">Todos status</option>
            <option value="active" className="bg-slate-900 text-slate-100">Ativos</option>
            <option value="inactive" className="bg-slate-900 text-slate-100">Inativos</option>
          </select>
          <select
            value={paymentFilter}
            onChange={e => setPaymentFilter(e.target.value as PaymentFilter)}
            className="px-4 py-3 bg-[#1e293b] border border-slate-800 rounded-xl text-sm font-medium text-slate-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all shadow-sm cursor-pointer"
          >
            <option value="all" className="bg-slate-900 text-slate-100">Situação</option>
            <option value="ok" className="bg-slate-900 text-slate-100">Em dia</option>
            <option value="overdue" className="bg-slate-900 text-slate-100">Em atraso</option>
            <option value="none" className="bg-slate-900 text-slate-100">Sem lançamentos</option>
          </select>
        </div>
      </div>

      {/* ─── Table ─── */}
      <div className="bg-[#1e293b] rounded-2xl shadow-sm border border-slate-800 overflow-hidden">
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center text-slate-400 space-y-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500" />
            <span className="text-sm font-medium">Carregando clientes...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-800/60 text-slate-400">
              <User size={28} />
            </div>
            <p className="text-slate-400 font-medium text-sm">
              {searchTerm || statusFilter !== 'all' || paymentFilter !== 'all'
                ? 'Nenhum cliente encontrado com esses filtros.'
                : 'Nenhum cliente cadastrado ainda.'}
            </p>
            {!searchTerm && statusFilter === 'all' && paymentFilter === 'all' && (
              <button
                onClick={() => { if (checkLimit('clients')) setShowNewClientModal(true); }}
                className="text-xs font-bold text-teal-400 hover:text-teal-300 underline uppercase tracking-wider"
              >
                Cadastrar meu primeiro cliente
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900/60 border-b border-slate-800">
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Cliente</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Próx. Vencimento</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Total Pendente</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map(({ client, pendingCount, overdueCount, totalIncomePending, totalExpensePending, nextDueDate, hasNotificationConfig }) => (
                  <tr key={client.id} className="hover:bg-slate-700/80 transition-colors duration-150 group">
                    {/* Client name */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
                          client.status ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20' : 'bg-slate-800 text-slate-500 border border-slate-700'
                        }`}>
                          <User size={18} />
                        </div>
                        <div>
                          <p className="font-bold text-slate-100 group-hover:text-teal-400 transition-colors">{client.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {client.phone && (
                              <span className="text-xs text-slate-400 flex items-center gap-1">
                                <Phone size={10} /> {client.phone}
                              </span>
                            )}
                            {hasNotificationConfig ? (
                              <span className="text-xs text-teal-400 flex items-center gap-1">
                                <Bell size={10} /> Notif. ativa
                              </span>
                            ) : (
                              <span className="text-xs text-slate-500 flex items-center gap-1">
                                <BellOff size={10} /> Sem notif.
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Next due */}
                    <td className="px-6 py-4">
                      {nextDueDate ? (
                        <div>
                          <p className={`text-sm font-semibold ${overdueCount > 0 ? 'text-rose-400' : 'text-slate-200'}`}>
                            {format(parseISO(nextDueDate), 'dd/MM/yyyy')}
                          </p>
                          {overdueCount > 0 && (
                            <p className="text-xs text-rose-400 font-medium">
                              {overdueCount} em atraso
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500 italic">Sem lançamentos</span>
                      )}
                    </td>

                    {/* Total pending (Income & Expense) */}
                    <td className="px-6 py-4 text-right">
                      {pendingCount > 0 ? (
                        <div className="space-y-0.5">
                          {totalIncomePending > 0 && (
                            <p className="font-bold text-sm text-emerald-400">
                              + {formatCurrency(totalIncomePending)} <span className="text-[10px] text-slate-400 font-normal">a receber</span>
                            </p>
                          )}
                          {totalExpensePending > 0 && (
                            <p className="font-bold text-sm text-rose-400">
                              - {formatCurrency(totalExpensePending)} <span className="text-[10px] text-slate-400 font-normal">a pagar</span>
                            </p>
                          )}
                          <p className="text-[11px] text-slate-400">{pendingCount} lançamento{pendingCount > 1 ? 's' : ''}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
                    </td>

                    {/* Status badge */}
                    <td className="px-6 py-4 text-center">
                      {overdueCount > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          <AlertTriangle size={10} /> Em atraso
                        </span>
                      ) : pendingCount > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <Clock size={10} /> A vencer
                        </span>
                      ) : client.status ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 size={10} /> Em dia
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700">
                          Inativo
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setStatementClient({ id: client.id, name: client.name })}
                          className="p-2 text-slate-400 hover:text-teal-400 hover:bg-slate-800 rounded-xl transition-all"
                          title="Ver extrato"
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          onClick={() => setQuickTxClient(client)}
                          className="p-2 text-slate-400 hover:text-teal-400 hover:bg-slate-800 rounded-xl transition-all"
                          title="Adicionar lançamento"
                        >
                          <Plus size={15} />
                        </button>
                        <button
                          onClick={() => setNotifClient(client)}
                          className={`p-2 rounded-xl transition-all ${
                            hasNotificationConfig
                              ? 'text-teal-400 hover:bg-teal-500/10'
                              : 'text-slate-400 hover:text-teal-400 hover:bg-slate-800'
                          }`}
                          title="Configurar notificação"
                        >
                          <Bell size={15} />
                        </button>
                        <button
                          onClick={() => setClientToDelete(client)}
                          className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-xl transition-all"
                          title="Remover cliente"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/30">
              <p className="text-sm text-slate-400">
                Mostrando <span className="font-bold text-slate-200">{filtered.length}</span> de{' '}
                <span className="font-bold text-slate-200">{clients.length}</span> clientes
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ─── Modals ─── */}
      {showNewClientModal && (
        <NewClientWithTransactionModal
          onClose={() => setShowNewClientModal(false)}
          onSuccess={fetchAll}
        />
      )}

      {quickTxClient && (
        <QuickTransactionModal
          client={quickTxClient}
          onClose={() => setQuickTxClient(null)}
          onSuccess={fetchAll}
        />
      )}

      {notifClient && (
        <ClientNotificationConfig
          client={notifClient}
          onClose={() => { setNotifClient(null); fetchAll(); }}
        />
      )}

      {showGlobalNotif && (
        <GlobalNotificationSettings
          onClose={() => setShowGlobalNotif(false)}
        />
      )}

      {statementClient && (
        <ClientStatementModalV2
          clientId={statementClient.id}
          clientName={statementClient.name}
          onClose={() => setStatementClient(null)}
        />
      )}

      <ConfirmModal
        isOpen={!!clientToDelete}
        onClose={() => setClientToDelete(null)}
        onConfirm={() => clientToDelete && handleDeleteClient(clientToDelete)}
        title="Remover Cliente"
        message={
          <div className="space-y-2">
            <p>Deseja remover o cliente <strong className="text-slate-900">"{clientToDelete?.name}"</strong>?</p>
            <p className="text-xs text-slate-400 italic">Os lançamentos vinculados ao cliente serão mantidos, mas ele deixará de aparecer nas listagens.</p>
          </div>
        }
        confirmLabel="Remover Cliente"
        confirmColor="red"
      />
    </div>
  );
}
