import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { startOfYear, eachMonthOfInterval, isAfter, isBefore, startOfMonth, endOfMonth, addMonths, format } from 'date-fns';
import { formatToSP, toSPDate, getCurrentSPDate } from '../../../lib/dates';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Database } from '../../../types/supabase';

type Client = Database['public']['Tables']['clients']['Row'];
type Payment = Database['public']['Tables']['payments']['Row'];

interface PaymentHistoryV2Props {
    client: Client;
    refreshKey?: number;
}

const FREQUENCY_MONTHS = {
    monthly: 1,
    bimonthly: 2,
    quarterly: 3,
    semiannual: 6,
    annual: 12,
};

export function PaymentHistoryV2({ client, refreshKey }: PaymentHistoryV2Props) {
    const [payments, setPayments] = useState<Payment[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedYear, setSelectedYear] = useState(getCurrentSPDate().getFullYear());

    const [startYear] = client.start_date.split('-').map(Number);
    const currentYear = getCurrentSPDate().getFullYear();
    const availableYears = Array.from({ length: currentYear - startYear + 1 }, (_, i) => startYear + i);

    useEffect(() => {
        async function fetchPayments() {
            try {
                const { data, error } = await supabase
                    .from('payments')
                    .select('*')
                    .eq('client_id', client.id)
                    .order('payment_date', { ascending: false });
                if (error) throw error;
                setPayments(data || []);
            } catch (error) {
                console.error('Error fetching payments:', error);
            } finally {
                setLoading(false);
            }
        }
        fetchPayments();
    }, [client.id, refreshKey]);

    const monthsInYear = eachMonthOfInterval({
        start: startOfYear(new Date(selectedYear, 0, 1)),
        end: new Date(selectedYear, 11, 31),
    });

    const getMonthStatus = (month: Date) => {
        const startDate = toSPDate(client.start_date);
        const monthStart = startOfMonth(month);

        if (isBefore(monthStart, startOfMonth(startDate))) {
            return { status: 'before-start' as const, date: null, amount: null, isPaymentMonth: false };
        }

        const coveringPayment = payments.find((payment) => {
            if (!payment.reference_month) return false;
            const freq = FREQUENCY_MONTHS[client.payment_frequency];
            const [y, m] = payment.reference_month.split('-').map(Number);
            const refDate = new Date(y, m - 1, 1);
            const endDate = addMonths(refDate, freq - 1);
            return !isBefore(monthStart, startOfMonth(refDate)) && !isAfter(monthStart, endOfMonth(endDate));
        });

        if (coveringPayment) {
            const isPaymentMonth = coveringPayment.reference_month === format(month, 'yyyy-MM');
            return {
                status: 'paid' as const,
                date: formatToSP(coveringPayment.payment_date, 'dd/MM/yyyy'),
                amount: isPaymentMonth ? coveringPayment.amount : null,
                isPaymentMonth,
            };
        }

        const today = getCurrentSPDate();
        const isLate = isAfter(today, month) && isAfter(today, startDate);
        return { status: isLate ? ('late' as const) : ('upcoming' as const), date: null, amount: null, isPaymentMonth: false };
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#14b8a6]" />
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Header com seletor de ano */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-800">Histórico de Pagamentos</h2>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => selectedYear > startYear && setSelectedYear(selectedYear - 1)}
                        disabled={selectedYear <= startYear}
                        className={`p-1 rounded ${selectedYear <= startYear ? 'text-slate-300 cursor-not-allowed' : 'hover:bg-slate-100 text-slate-400'}`}
                    >
                        <ChevronLeft size={18} />
                    </button>
                    <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(Number(e.target.value))}
                        className="appearance-none bg-slate-50 border-none rounded-lg text-sm font-semibold py-1.5 pl-3 pr-8 focus:ring-0 cursor-pointer"
                    >
                        {availableYears.map((year) => (
                            <option key={year} value={year}>{year}</option>
                        ))}
                    </select>
                    <button
                        onClick={() => selectedYear < currentYear && setSelectedYear(selectedYear + 1)}
                        disabled={selectedYear >= currentYear}
                        className={`p-1 rounded ${selectedYear >= currentYear ? 'text-slate-300 cursor-not-allowed' : 'hover:bg-slate-100 text-slate-400'}`}
                    >
                        <ChevronRight size={18} />
                    </button>
                </div>
            </div>

            {/* Grid de cards — 6 por linha */}
            <div className="p-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                    {monthsInYear.map((month) => {
                        const { status, date, amount, isPaymentMonth } = getMonthStatus(month);
                        const monthName = formatToSP(month, 'MMMM');

                        // ─── Pago (mês de referência do pagamento) ───
                        if (status === 'paid' && isPaymentMonth) {
                            return (
                                <div key={month.toString()} className="bg-[#14b8a6] p-4 rounded-xl shadow-sm">
                                    <p className="font-bold text-white mb-2 capitalize">{monthName}</p>
                                    <div className="space-y-0.5">
                                        <p className="text-[11px] text-white/90">Pago</p>
                                        <p className="text-[11px] text-white/90">{date}</p>
                                        <p className="text-xs font-bold text-white">R$ {amount?.toFixed(2).replace('.', ',')}</p>
                                    </div>
                                </div>
                            );
                        }

                        // ─── Coberto (período coberto por pagamento) ───
                        if (status === 'paid' && !isPaymentMonth) {
                            return (
                                <div key={month.toString()} className="bg-[#f0fdfa] p-4 rounded-xl border border-[#5eead4]">
                                    <p className="font-bold text-slate-800 mb-2 capitalize">{monthName}</p>
                                    <p className="text-[11px] text-teal-600 font-medium">Coberto</p>
                                </div>
                            );
                        }

                        // ─── Em atraso ───
                        if (status === 'late') {
                            return (
                                <div key={month.toString()} className="bg-red-50 p-4 rounded-xl">
                                    <p className="font-bold text-red-900 mb-2 capitalize">{monthName}</p>
                                    <div className="space-y-0.5">
                                        <p className="text-[11px] text-red-800/80 font-medium">Em atraso</p>
                                        <p className="text-xs font-bold text-red-900">R$ {client.monthly_payment.toFixed(2).replace('.', ',')}</p>
                                    </div>
                                </div>
                            );
                        }

                        // ─── Anterior ao início / Futuro ───
                        return (
                            <div key={month.toString()} className="bg-slate-100 p-4 rounded-xl">
                                <p className="font-bold text-slate-800 mb-2 capitalize">{monthName}</p>
                                <p className="text-xs text-slate-400">{status === 'before-start' ? '-' : 'Aguardando'}</p>
                            </div>
                        );
                    })}
                </div>

                {/* Legenda */}
                <div className="mt-6 flex flex-wrap items-center gap-6 text-xs text-slate-500 font-medium">
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-[#14b8a6]" />
                        <span>Pago</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-red-50 border border-red-200" />
                        <span>Em atraso</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-[#f0fdfa] border border-[#5eead4]" />
                        <span>Aguardando/Coberto</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-slate-100 border border-slate-200" />
                        <span>Anterior/Futuro</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default PaymentHistoryV2;
