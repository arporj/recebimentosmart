import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { format } from 'date-fns';
import { Search, CheckCircle, XCircle, DollarSign, ChevronDown, ChevronUp, Trash2, UserPlus } from 'lucide-react';
import { useClients } from '../../../contexts/ClientContext';
import { PaymentModalV2 } from '../PaymentModalV2';
import { DeleteModalV2 } from '../DeleteModalV2';
import { PaymentHistoryV2 } from '../PaymentHistoryV2';
import { ClientFormV2 } from '../ClientFormV2';

import type { Database } from '../../../types/supabase';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../../contexts/AuthContext';
import { usePlanLimits } from '../../../hooks/usePlanLimits';

type Client = Database['public']['Tables']['clients']['Row'];
type CustomField = Database['public']['Tables']['custom_fields']['Row'];

interface FinancialTransaction {
    id: string;
    type: 'income' | 'expense';
    amount: number;
    date: string;
    description: string | null;
    client_id: string | null;
    recurrence_enabled: boolean;
    recurrence_period: string | null;
    recurrence_interval: number | null;
    status: string;
}

interface ClientWithCustomFields extends Client {
    custom_field_values?: { [key: string]: string };
}

const RECURRENCE_LABELS: Record<string, string> = {
    daily: 'Diária',
    weekly: 'Semanal',
    monthly: 'Mensal',
    quarterly: 'Trimestral',
    yearly: 'Anual',
};



function getClientFinancialSummary(clientId: string, transactions: FinancialTransaction[]) {
    const clientTransactions = transactions.filter(t => t.client_id === clientId);
    if (clientTransactions.length === 0) {
        return { hasTransactions: false, totalValue: 0, nextDue: null, recurrenceLabel: '', pendingCount: 0, lateCount: 0 };
    }

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const pending = clientTransactions.filter(t => t.status !== 'paid');
    const late = pending.filter(t => new Date(t.date + 'T00:00:00') < hoje);

    // Pega a recorrência da transação mais recente (se existir)
    const recurring = clientTransactions.find(t => t.recurrence_enabled);
    let recurrenceLabel = '';
    if (recurring?.recurrence_period) {
        const interval = recurring.recurrence_interval ?? 1;
        recurrenceLabel = interval > 1
            ? `A cada ${interval} ${RECURRENCE_LABELS[recurring.recurrence_period]?.toLowerCase() || recurring.recurrence_period}`
            : RECURRENCE_LABELS[recurring.recurrence_period] || recurring.recurrence_period;
    }

    // Valor total de receita pendente
    const totalValue = clientTransactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + Number(t.amount), 0);

    // Próximo vencimento
    const nextPending = pending
        .sort((a, b) => a.date.localeCompare(b.date))[0];

    return {
        hasTransactions: true,
        totalValue,
        nextDue: nextPending ? nextPending.date : null,
        recurrenceLabel,
        pendingCount: pending.length,
        lateCount: late.length,
        transactions: clientTransactions,
    };
}

// ─── Main Component ───
export function ClientListV2() {
    const { clients, refreshClients } = useClients();
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
    const [paymentFilter, setPaymentFilter] = useState<'all' | 'ok' | 'late' | 'none'>('all');
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [expandedClient, setExpandedClient] = useState<string | null>(null);
    const [editingClient, setEditingClient] = useState<Client | null>(null);
    const [deletingClient, setDeletingClient] = useState<Client | null>(null);

    const [refreshPayments, setRefreshPayments] = useState(0);
    const [customFields, setCustomFields] = useState<CustomField[]>([]);
    const [clientsWithCustomFields, setClientsWithCustomFields] = useState<ClientWithCustomFields[]>([]);
    const [showNewClientForm, setShowNewClientForm] = useState(false);
    const [financialTransactions, setFinancialTransactions] = useState<FinancialTransaction[]>([]);

    const { user } = useAuth();
    const { checkLimit } = usePlanLimits();

    const fetchCustomFields = useCallback(async () => {
        if (!user) return;
        const { data, error } = await supabase.from('custom_fields').select('*').eq('user_id', user.id).order('name', { ascending: true });
        if (error) {
            console.error('Erro ao carregar campos personalizados:', error);
            toast.error('Erro ao carregar campos personalizados.');
        } else {
            setCustomFields(data);
        }
    }, [user]);

    useEffect(() => { fetchCustomFields(); }, [fetchCustomFields]);

    // Buscar transações financeiras
    const fetchFinancialTransactions = useCallback(async () => {
        if (!user) return;
        const { data, error } = await supabase
            .from('financial_transactions')
            .select('*')
            .eq('user_id', user.id)
            .not('client_id', 'is', null);
        if (error) {
            console.error('Erro ao buscar transações:', error);
        } else {
            setFinancialTransactions(data as FinancialTransaction[]);
        }
    }, [user]);

    useEffect(() => { fetchFinancialTransactions(); }, [fetchFinancialTransactions]);



    useEffect(() => {
        const combineClientData = async () => {
            if (clients.length === 0) { setClientsWithCustomFields(clients); return; }
            const clientIds = clients.map(c => c.id);
            const { data: customValues, error } = await supabase.from('client_custom_field_values').select('client_id, field_id, value').in('client_id', clientIds);
            if (error) { console.error('Erro:', error); setClientsWithCustomFields(clients); return; }
            const valuesMap = customValues.reduce((acc, cv) => {
                const clientId = cv.client_id as string;
                const fieldId = cv.field_id as string;
                if (!acc[clientId]) acc[clientId] = {};
                acc[clientId][fieldId] = cv.value ?? '';
                return acc;
            }, {} as { [clientId: string]: { [fieldId: string]: string } });
            setClientsWithCustomFields(clients.map(client => ({ ...client, custom_field_values: valuesMap[client.id] || {} })));
        };
        combineClientData();
    }, [clients, customFields]);

    const filteredClients = clientsWithCustomFields.filter(client => {
        const matchesSearch = client.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'all' ? true : statusFilter === 'active' ? client.status : !client.status;
        
        if (paymentFilter === 'all') return matchesSearch && matchesStatus;
        
        const summary = getClientFinancialSummary(client.id, financialTransactions);
        if (paymentFilter === 'none') return matchesSearch && matchesStatus && !summary.hasTransactions;
        if (paymentFilter === 'late') return matchesSearch && matchesStatus && summary.lateCount > 0;
        if (paymentFilter === 'ok') return matchesSearch && matchesStatus && summary.hasTransactions && summary.lateCount === 0;
        
        return matchesSearch && matchesStatus;
    });

    async function registerPayment(clientId: string, monthlyPayment: number, paymentDate: string, referenceMonth: string) {
        try {
            const { data } = await supabase.auth.getUser();
            const userId = data.user?.id ?? null;
            const { error } = await supabase.from('payments').insert([{ client_id: clientId, amount: monthlyPayment, payment_date: paymentDate, reference_month: referenceMonth, user_id: userId }]);
            if (error) throw error;
            await refreshClients();
            setRefreshPayments(prev => prev + 1);
            toast.success('Pagamento registrado com sucesso!');
        } catch (error: unknown) {
            toast.error('Erro ao registrar pagamento: ' + (error instanceof Error ? error.message : String(error)));
            console.error(error);
        }
    }

    const handleDeleteClient = async (client: Client) => {
        try {
            const { error } = await supabase
                .from('clients')
                .update({ deleted_at: new Date().toISOString() })
                .eq('id', client.id);

            if (error) throw error;

            await refreshClients();
            toast.success('Cliente excluído com sucesso!');
            setDeletingClient(null);
        } catch {
            toast.error('Erro ao excluir cliente');
        }
    };

    return (
        <div className="space-y-6">
            {/* ─── Header ─── */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Clientes - Legado</h1>
                    <p className="text-slate-500 text-sm mt-1">Visualização histórica de clientes no formato antigo.</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-amber-800 text-xs font-medium flex items-center gap-2">
                    <span className="font-bold text-amber-600 uppercase">Modo Leitura:</span>
                    Novas transações e recorrências devem ser feitas no menu financeiro.
                </div>
            </header>

            {/* ─── Search and Filters ─── */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row items-center gap-4">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-custom/20 transition-all"
                        placeholder="Buscar clientes pelo nome..."
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
                        className="bg-slate-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-custom/20 py-2 px-4 cursor-pointer w-full md:w-40"
                    >
                        <option value="all">Todos os status</option>
                        <option value="active">Ativos</option>
                        <option value="inactive">Inativos</option>
                    </select>
                    <select
                        value={paymentFilter}
                        onChange={(e) => setPaymentFilter(e.target.value as 'all' | 'ok' | 'late' | 'none')}
                        className="bg-slate-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-custom/20 py-2 px-4 cursor-pointer w-full md:w-48"
                    >
                        <option value="all">Todos</option>
                        <option value="ok">Em dia</option>
                        <option value="late">Em atraso</option>
                        <option value="none">Sem lançamentos</option>
                    </select>
                </div>
            </div>

            {/* ─── Table ─── */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider w-10">Status</th>
                                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Cliente</th>
                                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Valor</th>
                                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Recorrência</th>
                                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Próx. Vencimento</th>
                                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredClients.map((client) => {
                                const summary = getClientFinancialSummary(client.id, financialTransactions);
                                const isExpanded = expandedClient === client.id;

                                return (
                                    <React.Fragment key={client.id}>
                                        <tr className="group">
                                            {/* Status ativo/inativo */}
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                {client.status ? (
                                                    <CheckCircle className="text-custom" size={20} />
                                                ) : (
                                                    <XCircle className="text-red-500" size={20} />
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <button
                                                        onClick={() => setEditingClient(client)}
                                                        className="font-semibold text-slate-900 hover:text-custom text-left transition-colors"
                                                    >
                                                        {client.name}
                                                    </button>
                                                    {/* Custom fields inline */}
                                                    {customFields.map(field => {
                                                        const value = client.custom_field_values?.[field.id];
                                                        return value ? (
                                                            <span key={field.id} className="text-xs text-slate-400 mt-0.5">{field.name}: {value}</span>
                                                        ) : null;
                                                    })}
                                                    {/* Info de atraso */}
                                                    {summary.lateCount > 0 && (
                                                        <div className="flex items-center gap-1 mt-1">
                                                            <XCircle className="text-red-500 flex-shrink-0" size={12} />
                                                            <span className="text-[11px] text-red-500 font-medium">
                                                                {summary.lateCount} lançamento{summary.lateCount > 1 ? 's' : ''} em atraso
                                                            </span>
                                                        </div>
                                                    )}
                                                    {!summary.hasTransactions && (
                                                        <span className="text-[11px] text-slate-400 italic mt-1">Sem lançamentos vinculados</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-700">
                                                {summary.hasTransactions
                                                    ? `R$ ${summary.totalValue.toFixed(2).replace('.', ',')}`
                                                    : <span className="text-slate-300">—</span>
                                                }
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                {summary.recurrenceLabel ? (
                                                    <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
                                                        {summary.recurrenceLabel}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-300">—</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-slate-600 text-sm">
                                                {summary.nextDue
                                                    ? format(new Date(summary.nextDue + 'T00:00:00'), 'dd/MM/yyyy')
                                                    : <span className="text-slate-300">—</span>
                                                }
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    {/* Status badge */}
                                                    {summary.lateCount > 0 && (
                                                        <span className="px-2 py-0.5 rounded bg-red-50 text-red-600 text-[10px] font-bold uppercase mr-1">Em atraso</span>
                                                    )}
                                                    {summary.hasTransactions && summary.lateCount === 0 && summary.pendingCount > 0 && (
                                                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-600 text-[10px] font-bold uppercase mr-1">A vencer</span>
                                                    )}
                                                    {summary.hasTransactions && summary.pendingCount === 0 && (
                                                        <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-600 text-[10px] font-bold uppercase mr-1">Em dia</span>
                                                    )}
                                                    {/* Expandir */}
                                                    <button
                                                        onClick={() => setExpandedClient(isExpanded ? null : client.id)}
                                                        className="text-slate-400 hover:text-custom p-1 transition-colors"
                                                        title={isExpanded ? 'Recolher' : 'Expandir'}
                                                    >
                                                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                        {/* Expanded row para histórico */}
                                        {isExpanded && (
                                            <tr>
                                                <td colSpan={6} className="px-6 py-6 bg-slate-50/50 border-t border-slate-100">
                                                    <div className="flex items-center justify-between mb-4">
                                                        <div className="flex items-center gap-3">
                                                            <h3 className="text-lg font-bold text-slate-900">{client.name}</h3>
                                                            {summary.hasTransactions && summary.lateCount === 0 && (
                                                                <span className="px-3 py-1 bg-teal-50 text-[#14b8a6] text-xs font-bold rounded-full border border-teal-100">EM DIA</span>
                                                            )}
                                                            {summary.lateCount > 0 && (
                                                                <span className="px-3 py-1 bg-red-50 text-red-700 text-xs font-bold rounded-full border border-red-100">EM ATRASO</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {summary.hasTransactions && (
                                                        <div className="grid grid-cols-3 gap-8 text-sm mb-6">
                                                            <p className="text-slate-500">Receitas: <span className="font-semibold text-slate-900">R$ {summary.totalValue.toFixed(2).replace('.', ',')}</span></p>
                                                            {summary.recurrenceLabel && <p className="text-slate-500">Recorrência: <span className="font-medium text-slate-900">{summary.recurrenceLabel}</span></p>}
                                                            {summary.nextDue && <p className="text-slate-500">Próx. Vencimento: <span className="font-medium text-slate-900">{format(new Date(summary.nextDue + 'T00:00:00'), 'dd/MM/yyyy')}</span></p>}
                                                        </div>
                                                    )}
                                                    <PaymentHistoryV2 client={client} refreshKey={refreshPayments} />
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                            {filteredClients.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400 text-sm">
                                        Nenhum cliente encontrado com os filtros selecionados.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                {/* Footer com contagem */}
                <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
                    <p className="text-sm text-slate-500">
                        Mostrando <span className="font-medium text-slate-900">{filteredClients.length}</span> de{' '}
                        <span className="font-medium text-slate-900">{clientsWithCustomFields.length}</span> clientes
                    </p>
                </div>
            </div>

            {/* ─── Modais ─── */}
            {selectedClient && <PaymentModalV2 client={selectedClient} onClose={() => setSelectedClient(null)} onConfirm={registerPayment} />}
            {editingClient && (
                <ClientFormV2
                    client={editingClient}
                    onClose={() => setEditingClient(null)}
                />
            )}
            {showNewClientForm && (
                <ClientFormV2
                    key="new-client-form"
                    onClose={() => setShowNewClientForm(false)}
                />
            )}
            {deletingClient && <DeleteModalV2 client={deletingClient} onClose={() => setDeletingClient(null)} onConfirm={() => handleDeleteClient(deletingClient)} />}
        </div>
    );
}

export default ClientListV2;

