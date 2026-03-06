import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';
import { formatToSP, toSPDate, getCurrentSPDate } from '../../../lib/dates';
import { isBefore, isSameMonth, startOfMonth, subMonths, addMonths } from 'date-fns';
import Plot from 'react-plotly.js';
import { useAuth } from '../../../contexts/AuthContext';
import { Download } from 'lucide-react';

type Client = {
    id: string;
    name: string;
    status: boolean;
    deleted_at: string | null | undefined;
    next_payment_date: string | null;
    monthly_payment: number;
    payment_frequency: string;
};

type Payment = {
    id: string;
    client_id: string;
    amount: number;
    payment_date: string;
};

export function ReportsV2() {
    const [clients, setClients] = useState<Client[]>([]);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [selectedMonth, setSelectedMonth] = useState(() =>
        formatToSP(getCurrentSPDate(), 'yyyy-MM')
    );
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();

    // Data Fetching
    useEffect(() => {
        async function fetchData() {
            if (!user) return;
            setLoading(true);
            const { data: clientsData } = await supabase.from('clients').select('*').eq('user_id', user.id);
            const { data: paymentsData } = await supabase.from('payments').select('*').eq('user_id', user.id);
            setClients(clientsData || []);
            setPayments(paymentsData || []);
            setLoading(false);
        }
        fetchData();
    }, [user]);

    // Derived States for the dashboard calculation
    const reportData = useMemo(() => {
        if (!clients.length) return null;

        const [year, month] = selectedMonth.split('-').map(Number);
        const periodStart = startOfMonth(new Date(year, month - 1));
        const today = getCurrentSPDate();

        const activeClients = clients.filter(c => c.status && !c.deleted_at);
        const activeClientsCount = activeClients.length;

        // Expected vs Received in current month
        const expectedClients = activeClients.filter(client => {
            if (!client.next_payment_date) return false;
            const nextPayment = toSPDate(client.next_payment_date);
            return isSameMonth(nextPayment, periodStart);
        });

        const expectedRevenue = expectedClients.reduce((sum, c) => sum + c.monthly_payment, 0);

        const receivedRevenue = payments
            .filter(p => {
                const dt = toSPDate(p.payment_date);
                return isSameMonth(dt, periodStart);
            })
            .reduce((sum, p) => sum + p.amount, 0);

        // Late clients calculation
        const lateClients = expectedClients.filter(client => {
            if (!client.next_payment_date) return false;
            const nextPayment = toSPDate(client.next_payment_date);
            if (!isBefore(nextPayment, today)) return false;
            const hasPaid = payments.some(p => p.client_id === client.id && isSameMonth(toSPDate(p.payment_date), nextPayment));
            return !hasPaid;
        });

        const lateValue = lateClients.reduce((sum, c) => sum + c.monthly_payment, 0);
        const inadimplenciaPercent = expectedRevenue > 0 ? (lateValue / expectedRevenue) * 100 : 0;

        // Evolution Data
        const evol = [];
        const inadimplenciaHist = [];
        for (let i = 5; i >= 0; i--) {
            const dt = subMonths(periodStart, i);
            const label = formatToSP(dt, 'MMM/yy');

            const monthExpectedClients = activeClients.filter(client => {
                if (!client.next_payment_date) return false;
                // Simplified assumption: client expected to pay if active
                return isSameMonth(toSPDate(client.next_payment_date), dt) || isBefore(toSPDate(client.next_payment_date), dt);
            });

            const esperada = monthExpectedClients.reduce((sum, c) => sum + c.monthly_payment, 0);

            const recebida = payments
                .filter(p => isSameMonth(toSPDate(p.payment_date), dt))
                .reduce((sum, p) => sum + p.amount, 0);

            evol.push({ mes: label, esperada, recebida });

            // Historical delinquency approximation for the chart
            const inadimplenciaMes = esperada > 0 ? ((esperada - recebida) / esperada) * 100 : 0;
            inadimplenciaHist.push({ mes: label, percent: Math.max(0, inadimplenciaMes) });
        }

        // Plan distribution
        const frequencies = activeClients.reduce((acc, client) => {
            const freq = client.payment_frequency || 'monthly';
            acc[freq] = (acc[freq] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        return {
            activeClientsCount,
            expectedRevenue,
            receivedRevenue,
            inadimplenciaPercent,
            lateValue,
            evol,
            inadimplenciaHist,
            frequencies
        };
    }, [clients, payments, selectedMonth]);

    function handlePrevMonth() {
        const [year, month] = selectedMonth.split('-').map(Number);
        const prev = subMonths(new Date(year, month - 1), 1);
        setSelectedMonth(formatToSP(prev, 'yyyy-MM'));
    }

    function handleNextMonth() {
        const [year, month] = selectedMonth.split('-').map(Number);
        const next = addMonths(new Date(year, month - 1), 1);
        setSelectedMonth(formatToSP(next, 'yyyy-MM'));
    }

    const FREQ_LABELS: Record<string, string> = {
        monthly: 'Mensal',
        bimonthly: 'Bimestral',
        quarterly: 'Trimestral',
        semiannual: 'Semestral',
        annual: 'Anual',
    };

    function handleExportBase() {
        const activeClients = clients.filter(c => c.status && !c.deleted_at);
        if (activeClients.length === 0) {
            alert('Não há clientes ativos para exportar.');
            return;
        }

        const headers = ['Nome', 'Valor Mensalidade (R$)', 'Frequência de Pagamento', 'Data do Próximo Pagamento'];

        const csvRows = activeClients.map(c => {
            const freq = FREQ_LABELS[c.payment_frequency || 'monthly'] || 'Mensal';
            const value = c.monthly_payment.toString().replace('.', ',');
            const date = c.next_payment_date ? formatToSP(c.next_payment_date, 'dd/MM/yyyy') : '';
            return `"${c.name}","${value}","${freq}","${date}"`;
        });

        const csvContent = [headers.join(','), ...csvRows].join('\n');
        // Adiciona \uFEFF para Excel reconhecer UTF-8
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `base_clientes_${selectedMonth}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center p-8">
                <div className="w-8 h-8 border-4 border-[#14b8a6] border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!reportData) return null;

    return (
        <div className="text-slate-900 w-full max-w-7xl mx-auto font-['Inter']">
            {/* Header */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight">Relatórios</h2>
                    <p className="text-slate-500 text-sm mt-1">Sua visão analítica completa e indicadores de performance.</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-1 shadow-sm flex items-center gap-1">
                        <button onClick={handlePrevMonth} className="px-3 py-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors">
                            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                        </button>
                        <input
                            type="month"
                            value={selectedMonth}
                            onChange={e => setSelectedMonth(e.target.value)}
                            className="bg-transparent border-none text-sm font-bold text-slate-700 outline-none py-1.5 focus:ring-0 cursor-pointer"
                        />
                        <button onClick={handleNextMonth} className="px-3 py-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors">
                            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                        </button>
                    </div>
                    <button onClick={handleExportBase} className="bg-custom hover:bg-custom-hover text-white px-5 py-2.5 rounded-lg font-semibold flex items-center gap-2 transition-all shadow-sm">
                        <Download className="w-5 h-5" />
                        Exportar Base
                    </button>
                </div>
            </header>

            {/* Metric Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {/* Receita Esperada */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-[#14b8a6]/30 transition-all">
                    <div className="flex justify-between items-start mb-4">
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Receita Esperada</p>
                        <span className="p-2 bg-purple-50 rounded-lg text-purple-600 group-hover:scale-110 transition-transform"><span className="material-symbols-outlined text-xl">account_balance_wallet</span></span>
                    </div>
                    <h3 className="text-3xl font-black text-slate-900">R$ {reportData.expectedRevenue.toFixed(2)}</h3>
                </div>

                {/* Receita Recebida */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-[#14b8a6]/30 transition-all">
                    <div className="flex justify-between items-start mb-4">
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Receita Recebida</p>
                        <span className="p-2 bg-[#14b8a6]/10 rounded-lg text-[#14b8a6] group-hover:scale-110 transition-transform"><span className="material-symbols-outlined text-xl">payments</span></span>
                    </div>
                    <h3 className="text-3xl font-black text-slate-900">R$ {reportData.receivedRevenue.toFixed(2)}</h3>
                    <div className="mt-3 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-[#14b8a6] h-full rounded-full" style={{ width: `${Math.min((reportData.receivedRevenue / Math.max(reportData.expectedRevenue, 1)) * 100, 100)}%` }}></div>
                    </div>
                </div>

                {/* Inadimplência */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-red-200 transition-all">
                    <div className="flex justify-between items-start mb-4">
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Inadimplência do Mês</p>
                        <span className="p-2 bg-red-50 rounded-lg text-red-500 group-hover:scale-110 transition-transform"><span className="material-symbols-outlined text-xl">trending_down</span></span>
                    </div>
                    <div className="flex items-end justify-between">
                        <h3 className="text-3xl font-black text-red-600">{reportData.inadimplenciaPercent.toFixed(1)}%</h3>
                    </div>
                    <p className="text-[11px] text-slate-400 font-medium mt-1">R$ {reportData.lateValue.toFixed(2)} em atraso</p>
                </div>

                {/* Clientes Ativos */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-blue-200 transition-all">
                    <div className="flex justify-between items-start mb-4">
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Clientes Ativos</p>
                        <span className="p-2 bg-blue-50 rounded-lg text-blue-500 group-hover:scale-110 transition-transform"><span className="material-symbols-outlined text-xl">group</span></span>
                    </div>
                    <h3 className="text-3xl font-black text-slate-900">{reportData.activeClientsCount}</h3>
                </div>
            </div>

            {/* Main Chart Area */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="mb-6 flex justify-between items-center">
                        <h3 className="font-bold text-slate-900 flex items-center gap-2">
                            <span className="material-symbols-outlined text-[#14b8a6]">monitoring</span>
                            Evolução da Receita (6 Meses)
                        </h3>
                    </div>
                    <div className="h-[320px] w-full">
                        <Plot
                            data={[
                                {
                                    x: reportData.evol.map(e => e.mes),
                                    y: reportData.evol.map(e => e.esperada),
                                    type: 'scatter',
                                    mode: 'lines+markers',
                                    name: 'Esperada',
                                    line: { color: '#8b5cf6', width: 3, shape: 'spline' },
                                    marker: { size: 8 }
                                },
                                {
                                    x: reportData.evol.map(e => e.mes),
                                    y: reportData.evol.map(e => e.recebida),
                                    type: 'scatter',
                                    mode: 'lines+markers',
                                    name: 'Recebida',
                                    fill: 'tozeroy', // Adiciona área abaixo da linha
                                    line: { color: '#14b8a6', width: 3, shape: 'spline' },
                                    fillcolor: 'rgba(20, 184, 166, 0.1)',
                                    marker: { size: 8 }
                                },
                            ]}
                            layout={{
                                autosize: true,
                                margin: { t: 10, b: 30, l: 40, r: 10 },
                                legend: { orientation: 'h', y: -0.15, x: 0.5, xanchor: 'center' },
                                yaxis: { title: '', gridcolor: '#f1f5f9', zerolinecolor: '#f1f5f9' },
                                xaxis: { title: '', gridcolor: 'transparent', zerolinecolor: 'transparent' },
                                plot_bgcolor: 'transparent',
                                paper_bgcolor: 'transparent',
                                font: { family: 'Inter', color: '#64748b' },
                                hovermode: 'x unified'
                            }}
                            style={{ width: "100%", height: "100%" }}
                            useResizeHandler={true}
                            config={{ displayModeBar: false, responsive: true }}
                        />
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                    <div className="mb-2">
                        <h3 className="font-bold text-slate-900 flex items-center gap-2">
                            <span className="material-symbols-outlined text-amber-500">donut_small</span>
                            Distribuição de Planos
                        </h3>
                    </div>
                    <div className="flex-1 flex justify-center items-center w-full min-h-[250px]">
                        <Plot
                            data={[
                                {
                                    labels: Object.keys(reportData.frequencies).map(k => FREQ_LABELS[k] || k),
                                    values: Object.values(reportData.frequencies),
                                    type: 'pie',
                                    hole: 0.6,
                                    marker: {
                                        colors: ['#14b8a6', '#d946ef', '#f97316', '#3b82f6', '#eab308']
                                    },
                                    textinfo: 'percent',
                                    insidetextorientation: 'radial'
                                }
                            ]}
                            layout={{
                                autosize: true,
                                margin: { t: 20, b: 20, l: 20, r: 20 },
                                showlegend: true,
                                legend: { orientation: 'h', y: -0.1, x: 0.5, xanchor: 'center' },
                                plot_bgcolor: 'transparent',
                                paper_bgcolor: 'transparent',
                                font: { family: 'Inter', color: '#64748b' }
                            }}
                            style={{ width: "100%", height: "100%" }}
                            useResizeHandler={true}
                            config={{ displayModeBar: false, responsive: true }}
                        />
                    </div>
                </div>
            </div>

            {/* Bottom Row Charts */}
            <div className="grid grid-cols-1 mb-8">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="mb-6 flex justify-between items-center">
                        <h3 className="font-bold text-slate-900 flex items-center gap-2">
                            <span className="material-symbols-outlined text-red-500">bar_chart</span>
                            Taxa de Inadimplência Histórica (%)
                        </h3>
                    </div>
                    <div className="h-[250px] w-full">
                        <Plot
                            data={[
                                {
                                    x: reportData.inadimplenciaHist.map(e => e.mes),
                                    y: reportData.inadimplenciaHist.map(e => e.percent),
                                    type: 'bar',
                                    marker: {
                                        color: '#ef4444',
                                        opacity: 0.8
                                    },
                                    text: reportData.inadimplenciaHist.map(e => e.percent.toFixed(1) + '%'),
                                    textposition: 'auto',
                                },
                            ]}
                            layout={{
                                autosize: true,
                                margin: { t: 10, b: 30, l: 40, r: 10 },
                                yaxis: { title: '', gridcolor: '#f1f5f9', zerolinecolor: '#f1f5f9', range: [0, Math.max(...reportData.inadimplenciaHist.map(e => e.percent)) * 1.2 || 100] },
                                xaxis: { title: '', gridcolor: 'transparent', zerolinecolor: 'transparent' },
                                plot_bgcolor: 'transparent',
                                paper_bgcolor: 'transparent',
                                font: { family: 'Inter', color: '#64748b' },
                                bargap: 0.4
                            }}
                            style={{ width: "100%", height: "100%" }}
                            useResizeHandler={true}
                            config={{ displayModeBar: false, responsive: true }}
                        />
                    </div>
                </div>
            </div>

        </div >
    );
}

export default ReportsV2;
