import React, { useState, useEffect, useCallback } from 'react';
import { useClients } from '../../../contexts/ClientContext';
import { formatToSP, toSPDate, getCurrentSPDate } from '../../../lib/dates';
import {
    isAfter,
    isBefore,
    isSameMonth,
    isSameDay,
    startOfMonth,
    endOfMonth,
    startOfDay,
    endOfDay,
    addDays,
    isWithinInterval,
    subMonths,
    addMonths,
} from 'date-fns';
import { supabase } from '../../../lib/supabase';
import { toast } from 'react-hot-toast';
import type { Database } from '../../../types/supabase';
import { useAuth } from '../../../contexts/AuthContext';
// Componente de modal V2 (será criado a seguir, por enquanto importa o base se existir ou null)
import { PaymentModal } from '../../../components/PaymentModal';

type Client = Database['public']['Tables']['clients']['Row'];
type PaymentStatus = 'pago' | 'pendente' | 'atrasado' | 'a-vencer' | 'vencendo-hoje';

type ClientData = {
    name: string;
    next_payment_date: string;
};

type PaymentWithClient = {
    id: string;
    amount: number;
    payment_date: string;
    client_id: string;
    clients: ClientData | null;
};

type PaymentListItem = {
    id: string;
    payment_date: string;
    client_id: string;
    client_name: string;
    amount: number;
    status: PaymentStatus;
    vencimento: string | null;
};

const PAYMENT_FREQUENCY_LABELS: Record<string, string> = {
    monthly: 'Mensal',
    bimonthly: 'Bimestral',
    quarterly: 'Trimestral',
    semiannual: 'Semestral',
    annual: 'Anual',
};

export function MonthlyPaymentsV2() {
    const { clients, refreshClients } = useClients();
    const [selectedDate, setSelectedDate] = useState(getCurrentSPDate());
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const { user } = useAuth();

    // Resumos
    const [expectedRevenue, setExpectedRevenue] = useState(0);
    const [receivedRevenue, setReceivedRevenue] = useState(0);
    const [lateRevenue, setLateRevenue] = useState(0);
    const [activeClientsCount, setActiveClientsCount] = useState(0);
    const [lateClientsCount, setLateClientsCount] = useState(0);
    const [paymentsList, setPaymentsList] = useState<PaymentListItem[]>([]);
    const [pagosNoMes, setPagosNoMes] = useState<PaymentWithClient[]>([]);

    const today = startOfDay(getCurrentSPDate());
    const fiveDaysLater = endOfDay(addDays(today, 5));

    const getClientPaymentStatus = useCallback((client: Client, pagos: PaymentWithClient[], todayDate: Date, selectedMonth: Date): PaymentStatus | null => {
        if (!client.status || !client.next_payment_date) return null;
        const nextPayment = toSPDate(client.next_payment_date);
        if (!isSameMonth(nextPayment, selectedMonth)) return null;

        const paymentDone = pagos.some(p =>
            p.client_id === client.id &&
            isSameDay(toSPDate(p.payment_date), nextPayment)
        );

        if (paymentDone) return 'pago';
        if (isBefore(nextPayment, todayDate)) return 'atrasado';
        if (isSameDay(nextPayment, todayDate)) return 'vencendo-hoje';
        if (isAfter(nextPayment, todayDate)) return 'a-vencer';
        return null;
    }, []);

    const fetchPayments = useCallback(async () => {
        if (!user) return;
        const periodStart = startOfMonth(selectedDate);
        const periodEnd = endOfMonth(selectedDate);

        const { data, error } = await supabase
            .from('payments')
            .select('id, amount, payment_date, client_id, clients(name, next_payment_date)')
            .eq('user_id', user.id)
            .gte('payment_date', periodStart.toISOString())
            .lte('payment_date', periodEnd.toISOString())
            .order('payment_date', { ascending: false });

        if (error) {
            toast.error('Erro ao buscar extrato de pagamentos');
            return;
        }

        const fetchedPayments = (data || []) as PaymentWithClient[];
        setPagosNoMes(fetchedPayments);

        const pagos: PaymentListItem[] = fetchedPayments.map((p) => ({
            id: p.id,
            payment_date: p.payment_date,
            client_id: p.client_id,
            client_name: p.clients?.name || '',
            amount: p.amount,
            status: 'pago' as PaymentStatus,
            vencimento: p.clients?.next_payment_date || null,
        }));

        const periodClients = clients.filter(client => {
            if (!client.status || !client.next_payment_date) return false;
            const nextPayment = toSPDate(client.next_payment_date);
            return isSameMonth(nextPayment, selectedDate);
        });

        const pagosIds = pagos.map(p => p.client_id + formatToSP(p.payment_date, 'yyyy-MM-dd'));
        const pendentesOuAtrasados: PaymentListItem[] = periodClients
            .filter(client => {
                const vencimentoKey = client.id + formatToSP(client.next_payment_date!, 'yyyy-MM-dd');
                return !pagosIds.includes(vencimentoKey);
            })
            .map(client => {
                const nextPayment = toSPDate(client.next_payment_date!);
                let status: PaymentStatus = 'pendente';
                if (isBefore(nextPayment, today)) status = 'atrasado';
                if (isSameDay(nextPayment, today)) status = 'vencendo-hoje';
                if (isAfter(nextPayment, today)) status = 'a-vencer';
                return {
                    id: client.id + client.next_payment_date,
                    payment_date: client.next_payment_date!,
                    client_id: client.id,
                    client_name: client.name,
                    amount: client.monthly_payment,
                    status,
                    vencimento: client.next_payment_date,
                };
            });

        setPaymentsList([...pagos, ...pendentesOuAtrasados].sort((a, b) => (a.payment_date < b.payment_date ? 1 : -1)));
    }, [user, selectedDate, clients, today]);

    const calculateRevenueAndSummary = useCallback(() => {
        const expectedClients = clients.filter(client => {
            if (!client.status || !client.next_payment_date) return false;
            const nextPayment = toSPDate(client.next_payment_date);
            return isSameMonth(nextPayment, selectedDate);
        });
        const expected = expectedClients.reduce((sum, client) => sum + client.monthly_payment, 0);
        setExpectedRevenue(expected);

        const received = pagosNoMes.reduce((sum, payment) => sum + payment.amount, 0);
        setReceivedRevenue(received);

        const lateClientsList = clients.filter(client => {
            const status = getClientPaymentStatus(client, pagosNoMes, today, selectedDate);
            return status === 'atrasado';
        });
        setLateClientsCount(lateClientsList.length);
        setLateRevenue(lateClientsList.reduce((sum, c) => sum + c.monthly_payment, 0));

        setActiveClientsCount(expectedClients.length);
    }, [clients, pagosNoMes, selectedDate, getClientPaymentStatus, today]);

    useEffect(() => {
        fetchPayments();
    }, [clients, selectedDate, fetchPayments]);

    useEffect(() => {
        calculateRevenueAndSummary();
    }, [calculateRevenueAndSummary]);

    async function registerPayment(clientId: string, monthlyPayment: number, paymentDate: string, referenceMonth: string) {
        try {
            const { data } = await supabase.auth.getUser();
            const userId = data.user?.id ?? null;

            const { error } = await supabase
                .from('payments')
                .insert([{
                    client_id: clientId,
                    amount: monthlyPayment,
                    payment_date: paymentDate,
                    reference_month: referenceMonth,
                    user_id: userId
                }]);

            if (error) throw error;

            await refreshClients();
            await fetchPayments();
            toast.success('Pagamento registrado com sucesso!');
        } catch (error) {
            toast.error('Erro ao registrar pagamento');
            console.error(error);
        }
    }

    const handlePreviousMonth = () => setSelectedDate(subMonths(selectedDate, 1));
    const handleNextMonth = () => setSelectedDate(addMonths(selectedDate, 1));

    const clientsWithStatus = clients.map(client => ({
        ...client,
        paymentStatus: getClientPaymentStatus(client, pagosNoMes, today, selectedDate),
    }));

    const latePaymentsList = clientsWithStatus.filter(c => c.paymentStatus === 'atrasado');
    const dueNextFiveDaysPayments = clientsWithStatus.filter(client => {
        if (!client.next_payment_date) return false;
        const nextPayment = toSPDate(client.next_payment_date);
        return (
            isWithinInterval(nextPayment, { start: today, end: fiveDaysLater }) &&
            ['a-vencer', 'vencendo-hoje'].includes(client.paymentStatus || '')
        );
    }).sort((a, b) => a.next_payment_date! > b.next_payment_date! ? 1 : -1);

    const conversionPercentage = expectedRevenue > 0 ? ((receivedRevenue / expectedRevenue) * 100).toFixed(0) : 0;

    // Utilizando o layout V2
    return (
        <div className="text-slate-900 w-full max-w-7xl mx-auto font-['Inter']">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight">Pagamentos do Mês</h2>
                    <p className="text-slate-500 text-sm mt-1">Visão proativa das receitas e alertas críticos.</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="relative group">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#14b8a6] transition-colors">search</span>
                        <input className="pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-[#14b8a6]/10 focus:border-[#14b8a6] outline-none w-72 transition-all shadow-sm" placeholder="Buscar cliente ou fatura..." type="text" />
                    </div>
                </div>
            </header>

            {/* Seletor de Mês */}
            <div className="mb-8 bg-white border border-slate-200 rounded-2xl p-2 shadow-sm flex items-center justify-between gap-2 max-w-fit mx-auto md:mx-0">
                <button onClick={handlePreviousMonth} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 transition-colors">
                    <span className="material-symbols-outlined">chevron_left</span>
                </button>
                <div className="flex items-center font-bold text-slate-700 px-4">
                    {formatToSP(selectedDate, 'MMMM / yyyy').replace(/^\w/, c => c.toUpperCase())}
                </div>
                <button onClick={handleNextMonth} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 transition-colors">
                    <span className="material-symbols-outlined">chevron_right</span>
                </button>
            </div>

            {/* Cards de Métricas (Tela 2 format) */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Receita Esperada</p>
                    <div className="flex items-end justify-between">
                        <h3 className="text-2xl font-black text-slate-900">R$ {expectedRevenue.toFixed(2)}</h3>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Receita Recebida</p>
                    <div className="flex items-end justify-between">
                        <h3 className="text-2xl font-black text-slate-900">R$ {receivedRevenue.toFixed(2)}</h3>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Em Atraso (Total)</p>
                    <div className="flex items-end justify-between">
                        <h3 className="text-2xl font-black text-red-600">R$ {lateRevenue.toFixed(2)}</h3>
                        {lateClientsCount > 0 && <span className="text-red-600 text-[10px] font-bold bg-red-50 px-2 py-0.5 rounded-full">{lateClientsCount} Clientes</span>}
                    </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Conversão</p>
                    <div className="mt-2">
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-bold text-slate-700">{conversionPercentage}%</span>
                        </div>
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div className="bg-[#14b8a6] h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(Number(conversionPercentage), 100)}%` }}></div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 items-start">
                {/* Pagamentos em Atraso */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-red-100 overflow-hidden shadow-sm flex flex-col h-[540px]">
                    <div className="p-4 bg-red-50/30 border-b border-red-50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-red-500 text-xl">warning</span>
                            <h4 className="font-bold text-slate-800">Pagamentos em Atraso (Pendentes)</h4>
                        </div>
                        <span className="bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded uppercase">{latePaymentsList.length} Itens Críticos</span>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {latePaymentsList.length === 0 ? (
                            <div className="flex flex-col items-center justify-center text-slate-400 h-full p-6">
                                <span className="material-symbols-outlined text-4xl mb-2">check_circle</span>
                                <p className="text-sm font-medium">Nenhum pagamento em atraso neste mês.</p>
                            </div>
                        ) : (
                            <table className="w-full text-left">
                                <thead className="sticky top-0 bg-white border-b border-slate-100 shadow-sm z-10">
                                    <tr className="text-[10px] uppercase font-bold text-slate-400">
                                        <th className="px-6 py-3">Cliente</th>
                                        <th className="px-6 py-3">Vencimento</th>
                                        <th className="px-6 py-3">Valor</th>
                                        <th className="px-6 py-3 text-right">Ação</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {latePaymentsList.map(client => {
                                        const daysLate = Math.floor((today.getTime() - toSPDate(client.next_payment_date!).getTime()) / (1000 * 3600 * 24));
                                        return (
                                            <tr key={client.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-6 py-3 text-sm font-semibold text-slate-900">{client.name}</td>
                                                <td className="px-6 py-3 text-xs text-red-500 font-medium">
                                                    {formatToSP(client.next_payment_date!, 'dd/MM')} ({daysLate} dias)
                                                </td>
                                                <td className="px-6 py-3 text-sm font-black text-slate-900">R$ {client.monthly_payment.toFixed(2)}</td>
                                                <td className="px-6 py-3 text-right">
                                                    <button
                                                        onClick={() => setSelectedClient(client)}
                                                        className="bg-[#14b8a6] text-white px-3 py-1.5 rounded-lg hover:bg-[#0f8c7e] transition-all text-xs font-bold"
                                                    >
                                                        Registrar
                                                    </button>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* Próximos Vencimentos (5 dias) */}
                <div className="bg-white rounded-xl border border-amber-100 shadow-sm flex flex-col h-[540px]">
                    <div className="p-4 border-b border-amber-50 flex items-center justify-between bg-amber-50/30 rounded-t-xl">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-amber-500 text-xl">event_upcoming</span>
                            <h4 className="font-bold text-slate-800">Próximos 5 Dias</h4>
                        </div>
                        <span className="bg-amber-100 text-amber-700 text-[10px] font-black px-2 py-0.5 rounded uppercase">{dueNextFiveDaysPayments.length} Itens</span>
                    </div>
                    <div className="flex-1 p-4 overflow-y-auto custom-scrollbar space-y-4">
                        {dueNextFiveDaysPayments.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center opacity-30 text-slate-400 py-10">
                                <span className="material-symbols-outlined text-4xl mb-2">inbox</span>
                                <p className="text-xs font-medium">Nenhum vencimento próximo</p>
                            </div>
                        ) : (
                            dueNextFiveDaysPayments.map(client => {
                                const daysToDue = Math.floor((toSPDate(client.next_payment_date!).getTime() - today.getTime()) / (1000 * 3600 * 24));
                                const dueLabel = daysToDue === 0 ? 'Hoje' : daysToDue === 1 ? 'Amanhã' : `Em ${daysToDue} dias`;
                                return (
                                    <div key={client.id} className="p-4 border border-slate-100 rounded-lg hover:border-amber-200 transition-colors bg-slate-50/50">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="text-sm font-bold text-slate-900">{client.name}</span>
                                            <span className="bg-amber-100 text-amber-800 text-[10px] px-2 py-0.5 rounded font-bold uppercase">{dueLabel}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <p className="text-[11px] text-slate-500">Vence em {formatToSP(client.next_payment_date!, 'dd/MM')}</p>
                                                <p className="text-lg font-black text-slate-900">R$ {client.monthly_payment.toFixed(2)}</p>
                                            </div>
                                            <button
                                                onClick={() => setSelectedClient(client)}
                                                className="bg-white border border-slate-200 p-2 rounded-lg text-[#14b8a6] hover:bg-[#14b8a6] hover:text-white transition-all shadow-sm"
                                                title="Registrar Pagamento"
                                            >
                                                <span className="material-symbols-outlined text-xl">payments</span>
                                            </button>
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>
                </div>
            </div>

            {/* Extrato Histórico no Mês */}
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#14b8a6]">history</span>
                        Últimas Conciliações
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-50 text-[10px] uppercase tracking-wider font-bold text-slate-500">
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Cliente</th>
                                <th className="px-6 py-4">Vencimento Original</th>
                                <th className="px-6 py-4">Data Pagamento</th>
                                <th className="px-6 py-4">Valor</th>
                                <th className="px-6 py-4">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {paymentsList.map(payment => (
                                <tr key={payment.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        {payment.status === 'pago' ? (
                                            <span className="size-2 rounded-full bg-emerald-500 inline-block" title="Confirmado"></span>
                                        ) : payment.status === 'atrasado' ? (
                                            <span className="size-2 rounded-full bg-red-500 inline-block" title="Atrasado"></span>
                                        ) : payment.status === 'vencendo-hoje' ? (
                                            <span className="size-2 rounded-full bg-amber-500 inline-block" title="Vencendo Hoje"></span>
                                        ) : (
                                            <span className="size-2 rounded-full bg-slate-300 inline-block" title="Pendente"></span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-sm font-semibold text-slate-900">{payment.client_name}</td>
                                    <td className="px-6 py-4 text-xs text-slate-500">{payment.vencimento ? formatToSP(payment.vencimento, 'dd/MM/yyyy') : '-'}</td>
                                    <td className="px-6 py-4 text-xs text-slate-500">{payment.status === 'pago' && payment.payment_date ? formatToSP(payment.payment_date, 'dd/MM/yyyy') : '-'}</td>
                                    <td className="px-6 py-4 text-sm font-black text-slate-900">R$ {payment.amount.toFixed(2)}</td>
                                    <td className="px-6 py-4">
                                        {payment.status !== 'pago' && (
                                            <button
                                                onClick={() => setSelectedClient(clients.find(c => c.id === payment.client_id) || null)}
                                                className="text-[#14b8a6] text-[11px] font-bold border border-[#14b8a6]/20 px-3 py-1.5 rounded-lg hover:bg-[#14b8a6]/5"
                                            >
                                                Registrar
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Modal de Pagamento Base */}
            {
                selectedClient && (
                    <PaymentModal
                        client={selectedClient}
                        onClose={() => setSelectedClient(null)}
                        onConfirm={registerPayment}
                    />
                )
            }
        </div >
    );
}

export default MonthlyPaymentsV2;
