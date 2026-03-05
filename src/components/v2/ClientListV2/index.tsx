import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { isSameDay, addMonths, format, startOfMonth } from 'date-fns';
import { Search, CheckCircle, XCircle, DollarSign, ChevronDown, ChevronUp, Trash2, UserPlus } from 'lucide-react';
import { useClients } from '../../../contexts/ClientContext';
import { PaymentModalV2 } from '../PaymentModalV2';
import { PaymentHistoryV2 } from '../PaymentHistoryV2';
import { ClientFormV2 } from '../ClientFormV2';

import type { Database } from '../../../types/supabase';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../../contexts/AuthContext';

type Client = Database['public']['Tables']['clients']['Row'];
type Payment = Database['public']['Tables']['payments']['Row'];
type CustomField = Database['public']['Tables']['custom_fields']['Row'];

interface ClientWithCustomFields extends Client {
    custom_field_values?: { [key: string]: string };
}

const PAYMENT_FREQUENCY_LABELS: Record<string, string> = {
    monthly: 'Mensal',
    bimonthly: 'Bimestral',
    quarterly: 'Trimestral',
    semiannual: 'Semestral',
    annual: 'Anual',
};

const FREQUENCY_MONTHS = { monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, annual: 12 };

function gerarPeriodosDevidos(startDate: string, frequency: keyof typeof FREQUENCY_MONTHS): string[] {
    const mesesPorPeriodo = FREQUENCY_MONTHS[frequency];
    const periodos: string[] = [];
    const [year, month, day] = startDate.split('-').map(Number);
    let atual = startOfMonth(new Date(year, month - 1, day));
    const hoje = startOfMonth(new Date());
    while (format(atual, 'yyyy-MM') <= format(hoje, 'yyyy-MM')) {
        periodos.push(format(atual, 'yyyy-MM'));
        atual = addMonths(atual, mesesPorPeriodo);
    }
    return periodos;
}

function getPeriodosPendentes(client: Client, payments: Payment[]): string[] {
    const periodosDevidos = gerarPeriodosDevidos(client.start_date, client.payment_frequency);
    const periodosPagos = payments.filter(p => p.client_id === client.id && p.reference_month).map(p => p.reference_month!);
    return periodosDevidos.filter(periodo => !periodosPagos.includes(periodo));
}

function getClientPaymentStatus(client: Client, payments: Payment[]): 'paid' | 'late' | 'due-today' {
    const pendentes = getPeriodosPendentes(client, payments);
    if (pendentes.length === 0) return 'paid';
    const periodoMaisAntigo = pendentes[0];
    const [ano, mes] = periodoMaisAntigo.split('-').map(Number);
    const vencimento = new Date(ano, mes - 1, client.payment_due_day);
    const hoje = new Date();
    if (isSameDay(vencimento, hoje)) return 'due-today';
    if (vencimento < hoje) return 'late';
    return 'paid';
}

function formatarMesAnoCurto(yyyyMM: string) {
    if (!yyyyMM) return '';
    const [ano, mes] = yyyyMM.split('-');
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return `${meses[parseInt(mes, 10) - 1]}/${ano.slice(2)}`;
}

// ─── Delete Modal ───
function DeleteModal({ client, onClose, onConfirm }: { client: Client; onClose: () => void; onConfirm: () => void }) {
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Confirmar Exclusão</h3>
                <p className="text-sm text-slate-600 mb-6">
                    Tem certeza que deseja excluir o cliente <span className="font-bold text-slate-900">{client.name}</span>?
                    Esta ação não pode ser desfeita e todos os pagamentos associados serão removidos.
                </p>
                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                        Cancelar
                    </button>
                    <button onClick={onConfirm} className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors">
                        Excluir
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Main Component ───
export function ClientListV2() {
    const { clients, refreshClients } = useClients();
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
    const [paymentFilter, setPaymentFilter] = useState<'all' | 'paid' | 'late' | 'due-today'>('all');
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [expandedClient, setExpandedClient] = useState<string | null>(null);
    const [editingClient, setEditingClient] = useState<Client | null>(null);
    const [deletingClient, setDeletingClient] = useState<Client | null>(null);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [refreshPayments, setRefreshPayments] = useState(0);
    const [customFields, setCustomFields] = useState<CustomField[]>([]);
    const [clientsWithCustomFields, setClientsWithCustomFields] = useState<ClientWithCustomFields[]>([]);
    const [showNewClientForm, setShowNewClientForm] = useState(false);

    const { user } = useAuth();

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

    useEffect(() => {
        const fetchPayments = async () => {
            const { data, error } = await supabase.from('payments').select('*');
            if (error) { console.error('Error fetching payments:', error); return; }
            setPayments(data);
        };
        fetchPayments();
    }, []);

    useEffect(() => {
        const combineClientData = async () => {
            if (clients.length === 0) { setClientsWithCustomFields(clients); return; }
            const clientIds = clients.map(c => c.id);
            const { data: customValues, error } = await supabase.from('client_custom_field_values').select('client_id, field_id, value').in('client_id', clientIds);
            if (error) { console.error('Erro:', error); setClientsWithCustomFields(clients); return; }
            const valuesMap = customValues.reduce((acc, cv) => {
                if (!acc[cv.client_id]) acc[cv.client_id] = {};
                acc[cv.client_id][cv.field_id] = cv.value;
                return acc;
            }, {} as { [clientId: string]: { [fieldId: string]: string } });
            setClientsWithCustomFields(clients.map(client => ({ ...client, custom_field_values: valuesMap[client.id] || {} })));
        };
        combineClientData();
    }, [clients, customFields]);

    const filteredClients = clientsWithCustomFields.filter(client => {
        const matchesSearch = client.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'all' ? true : statusFilter === 'active' ? client.status : !client.status;
        const clientStatus = getClientPaymentStatus(client, payments);
        const matchesPayment = paymentFilter === 'all' ? true : paymentFilter === clientStatus;
        return matchesSearch && matchesStatus && matchesPayment;
    });

    async function registerPayment(clientId: string, monthlyPayment: number, paymentDate: string, referenceMonth: string) {
        try {
            const { data } = await supabase.auth.getUser();
            const userId = data.user?.id ?? null;
            const { error } = await supabase.from('payments').insert([{ client_id: clientId, amount: monthlyPayment, payment_date: paymentDate, reference_month: referenceMonth, user_id: userId }]);
            if (error) throw error;
            await refreshClients();
            const { data: newPayments, error: paymentsError } = await supabase.from('payments').select('*');
            if (!paymentsError && newPayments) { setPayments(newPayments); setRefreshPayments(prev => prev + 1); }
            toast.success('Pagamento registrado com sucesso!');
        } catch (error: unknown) {
            toast.error('Erro ao registrar pagamento: ' + (error instanceof Error ? error.message : String(error)));
            console.error(error);
        }
    }

    const handleDeleteClient = async (client: Client) => {
        try {
            const { error } = await supabase.from('clients').delete().eq('id', client.id);
            if (error) throw error;
            await refreshClients();
            const { data: newPayments, error: paymentsError } = await supabase.from('payments').select('*');
            if (!paymentsError && newPayments) setPayments(newPayments);
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
                    <h1 className="text-2xl font-bold text-slate-900">Listagem de Clientes</h1>
                    <p className="text-slate-500 text-sm mt-1">Gerencie seus recebimentos e status de clientes.</p>
                </div>
                <button
                    onClick={() => setShowNewClientForm(true)}
                    className="bg-custom hover:bg-custom-hover text-white px-5 py-2.5 rounded-lg font-semibold flex items-center gap-2 transition-all shadow-sm"
                >
                    <UserPlus size={18} /> Novo Cliente
                </button>
            </header>

            {/* ─── Search and Filters ─── */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row items-center gap-4">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-custom/20 transition-all"
                        placeholder="Buscar clientes pelo nome, e-mail ou CPF..."
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
                        onChange={(e) => setPaymentFilter(e.target.value as 'all' | 'paid' | 'late' | 'due-today')}
                        className="bg-slate-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-custom/20 py-2 px-4 cursor-pointer w-full md:w-48"
                    >
                        <option value="all">Todos os pagamentos</option>
                        <option value="paid">Em dia</option>
                        <option value="due-today">Vencendo hoje</option>
                        <option value="late">Em atraso</option>
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
                                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Frequência</th>
                                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Vencimento</th>
                                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredClients.map((client) => {
                                const status = getClientPaymentStatus(client, payments);
                                const isExpanded = expandedClient === client.id;
                                const periodosPendentes = getPeriodosPendentes(client, payments);

                                return (
                                    <React.Fragment key={client.id}>
                                        <tr className="group">
                                            {/* Linha principal */}
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
                                                    {/* Atrasos */}
                                                    {periodosPendentes.length > 0 && (
                                                        <div className="flex items-center gap-1 mt-1">
                                                            <XCircle className="text-red-500 flex-shrink-0" size={12} />
                                                            <span className="text-[11px] text-red-500 font-medium truncate max-w-[400px]">
                                                                Em atraso: {periodosPendentes.map(formatarMesAnoCurto).join(', ')}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-700">
                                                R$ {client.monthly_payment.toFixed(2).replace('.', ',')}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
                                                    {PAYMENT_FREQUENCY_LABELS[client.payment_frequency]}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-slate-600 text-sm">
                                                Dia {client.payment_due_day}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    {/* Status badge */}
                                                    {status === 'late' && (
                                                        <span className="px-2 py-0.5 rounded bg-red-50 text-red-600 text-[10px] font-bold uppercase mr-1">Em atraso</span>
                                                    )}
                                                    {status === 'due-today' && (
                                                        <span className="px-2 py-0.5 rounded bg-yellow-50 text-yellow-600 text-[10px] font-bold uppercase mr-1">Vence hoje</span>
                                                    )}
                                                    {/* Pagar */}
                                                    <button
                                                        onClick={() => setSelectedClient(client)}
                                                        className="bg-custom hover:bg-custom-hover text-white text-xs font-bold py-1.5 px-3 rounded flex items-center gap-1 transition-colors"
                                                        title="Registrar Pagamento"
                                                    >
                                                        <DollarSign size={14} /> Pagar
                                                    </button>
                                                    {/* Excluir */}
                                                    <button
                                                        onClick={() => setDeletingClient(client)}
                                                        className="text-slate-400 hover:text-red-500 p-1 transition-colors"
                                                        title="Excluir"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
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
                                        {/* Expanded row para histórico — tr separado */}
                                        {isExpanded && (
                                            <tr>
                                                <td colSpan={6} className="px-6 py-6 bg-slate-50/50 border-t border-slate-100">
                                                    {/* Client detail header */}
                                                    <div className="flex items-center justify-between mb-4">
                                                        <div className="flex items-center gap-3">
                                                            <h3 className="text-lg font-bold text-slate-900">{client.name}</h3>
                                                            {getClientPaymentStatus(client, payments) === 'paid' && (
                                                                <span className="px-3 py-1 bg-teal-50 text-[#14b8a6] text-xs font-bold rounded-full border border-teal-100">EM DIA</span>
                                                            )}
                                                            {getClientPaymentStatus(client, payments) === 'late' && (
                                                                <span className="px-3 py-1 bg-red-50 text-red-700 text-xs font-bold rounded-full border border-red-100">EM ATRASO</span>
                                                            )}
                                                            {getClientPaymentStatus(client, payments) === 'due-today' && (
                                                                <span className="px-3 py-1 bg-yellow-50 text-yellow-700 text-xs font-bold rounded-full border border-yellow-100">VENCE HOJE</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-3 gap-8 text-sm mb-6">
                                                        <p className="text-slate-500">Valor: <span className="font-semibold text-slate-900">R$ {client.monthly_payment.toFixed(2).replace('.', ',')}</span></p>
                                                        <p className="text-slate-500">Frequência: <span className="font-medium text-slate-900">{PAYMENT_FREQUENCY_LABELS[client.payment_frequency]}</span></p>
                                                        <p className="text-slate-500">Vencimento: <span className="font-medium text-slate-900">Dia {client.payment_due_day}</span></p>
                                                    </div>
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
            {deletingClient && <DeleteModal client={deletingClient} onClose={() => setDeletingClient(null)} onConfirm={() => handleDeleteClient(deletingClient)} />}
        </div>
    );
}

export default ClientListV2;
