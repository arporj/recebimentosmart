import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';
import { formatToSP } from '../../../lib/dates';
import { format, parseISO, isSameMonth, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns';
import Plot from 'react-plotly.js';
import { useAuth } from '../../../contexts/AuthContext';
import { Download } from 'lucide-react';
import { toast } from 'react-hot-toast';
import ConfirmModal from '../../../components/v2/ConfirmModal';
import { expandTransactionInstances } from '../../../lib/financeiro/instanceExpansion';

type Client = {
    id: string;
    name: string;
    status: boolean;
    deleted_at: string | null | undefined;
};

type ClientIncomeTx = {
    id: string;
    type: 'income';
    amount: number;
    date: string;
    status: 'pending' | 'paid' | 'partial' | 'cancelled';
    client_id: string;
    parent_id?: string | null;
    installment_current?: number | null;
    recurrence_period?: string;
    recurrence_interval?: number;
    recurrence_end_date?: string | null;
};

// Rótulo legível para a periodicidade real de cobrança de um cliente, a partir do
// template de recorrência em `financial_transactions` (fonte de verdade atual).
function periodLabel(period?: string, interval?: number): string {
    const n = interval || 1;
    if (period === 'daily') return 'Diária';
    if (period === 'weekly') return n > 1 ? `A cada ${n} semanas` : 'Semanal';
    if (period === 'yearly') return 'Anual';
    if (n === 1) return 'Mensal';
    if (n === 2) return 'Bimestral';
    if (n === 3) return 'Trimestral';
    if (n === 6) return 'Semestral';
    return `A cada ${n} meses`;
}

export function ReportsV2() {
    const [clients, setClients] = useState<Client[]>([]);
    const [rawTx, setRawTx] = useState<ClientIncomeTx[]>([]);
    const [rawTemplates, setRawTemplates] = useState<ClientIncomeTx[]>([]);
    const [selectedMonth, setSelectedMonth] = useState(() =>
        formatToSP(new Date(), 'yyyy-MM')
    );
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();

    // Data Fetching — cobranças reais vivem em `financial_transactions` (client_id),
    // não mais nas tabelas legadas `clients.monthly_payment/next_payment_date` e
    // `payments`, que o fluxo atual de cadastro/cobrança de clientes não preenche mais.
    useEffect(() => {
        async function fetchData() {
            if (!user) return;
            setLoading(true);
            try {
                const [
                    { data: clientsData, error: clientsError },
                    { data: txData, error: txError },
                    { data: templateData, error: tmplError },
                ] = await Promise.all([
                    supabase.from('clients').select('id, name, status, deleted_at').eq('user_id', user.id),
                    supabase
                        .from('financial_transactions')
                        .select('id, amount, date, status, client_id, parent_id, installment_current, type')
                        .eq('user_id', user.id)
                        .not('client_id', 'is', null)
                        .neq('status', 'cancelled')
                        .eq('is_template', false)
                        .eq('type', 'income'),
                    supabase
                        .from('financial_transactions')
                        .select('id, amount, date, status, client_id, recurrence_period, recurrence_interval, recurrence_end_date, type')
                        .eq('user_id', user.id)
                        .not('client_id', 'is', null)
                        .neq('status', 'cancelled')
                        .eq('is_template', true)
                        .eq('recurrence_enabled', true)
                        .eq('type', 'income'),
                ]);
                if (clientsError) throw clientsError;
                if (txError) throw txError;
                if (tmplError) throw tmplError;
                setClients((clientsData as unknown as Client[]) || []);
                setRawTx((txData as unknown as ClientIncomeTx[]) || []);
                setRawTemplates((templateData as unknown as ClientIncomeTx[]) || []);
            } catch (err) {
                console.error('Erro ao buscar dados de relatórios:', err);
                toast.error('Erro ao carregar relatórios');
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [user?.id]);

    // Derived States for the dashboard calculation
    const reportData = useMemo(() => {
        if (!clients.length) return null;

        const [year, month] = selectedMonth.split('-').map(Number);
        const periodStart = startOfMonth(new Date(year, month - 1));
        const horizonEnd = endOfMonth(periodStart);
        const todayStr = format(new Date(), 'yyyy-MM-dd');

        const activeClients = clients.filter(c => c.status && !c.deleted_at);
        const activeClientsCount = activeClients.length;

        const expanded = expandTransactionInstances(rawTx as any, rawTemplates as any, {
            horizonEnd,
            rollOverUnpaidToToday: true,
        });

        // Mesma regra usada em CobrancasV2/FinancialTransactionsV2: pendência vencida
        // sempre aparece "hoje", nunca presa no mês antigo em que venceu.
        const rolled = expanded.map(t =>
            t.status === 'pending' && t.originalInstanceDate < todayStr
                ? { ...t, instanceDate: todayStr }
                : t
        );

        // KPIs do mês selecionado (data já rolada, igual às demais telas)
        const monthInstances = rolled.filter(t => isSameMonth(parseISO(t.instanceDate), periodStart));
        const expectedRevenue = monthInstances.reduce((sum, t) => sum + Number(t.amount), 0);
        const receivedRevenue = monthInstances
            .filter(t => t.status === 'paid')
            .reduce((sum, t) => sum + Number(t.amount), 0);
        const lateInstances = monthInstances.filter(t => t.status !== 'paid' && t.originalInstanceDate < todayStr);
        const lateValue = lateInstances.reduce((sum, t) => sum + Number(t.amount), 0);
        const inadimplenciaPercent = expectedRevenue > 0 ? (lateValue / expectedRevenue) * 100 : 0;

        // Histórico (6 meses): usa a data ORIGINAL (sem rollover) de cada instância,
        // para refletir o que de fato era esperado/recebido naquele mês — sem que uma
        // pendência antiga, hoje "rolada" para o mês atual, distorça meses passados.
        const evol = [];
        const inadimplenciaHist = [];
        for (let i = 5; i >= 0; i--) {
            const dt = subMonths(periodStart, i);
            const label = formatToSP(dt, 'MMM/yy');

            const monthOriginal = expanded.filter(t => isSameMonth(parseISO(t.originalInstanceDate), dt));
            const esperada = monthOriginal.reduce((sum, t) => sum + Number(t.amount), 0);
            const recebida = monthOriginal
                .filter(t => t.status === 'paid')
                .reduce((sum, t) => sum + Number(t.amount), 0);

            evol.push({ mes: label, esperada, recebida });

            const inadimplenciaMes = esperada > 0 ? ((esperada - recebida) / esperada) * 100 : 0;
            inadimplenciaHist.push({ mes: label, percent: Math.max(0, inadimplenciaMes) });
        }

        // Distribuição de planos: baseada nos templates de recorrência reais de cada
        // cliente ativo (fonte de verdade atual). O campo legado `clients.payment_frequency`
        // deixou de ser preenchido pelo fluxo atual de cadastro de clientes.
        const frequencies: Record<string, number> = {};
        activeClients.forEach(client => {
            const template = (rawTemplates as any[]).find(t => t.client_id === client.id);
            const label = template ? periodLabel(template.recurrence_period, template.recurrence_interval) : 'Avulso/Pontual';
            frequencies[label] = (frequencies[label] || 0) + 1;
        });

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
    }, [clients, rawTx, rawTemplates, selectedMonth]);

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

    const [showNoClientsAlert, setShowNoClientsAlert] = useState(false);

    function handleExportBase() {
        const activeClients = clients.filter(c => c.status && !c.deleted_at);
        if (activeClients.length === 0) {
            setShowNoClientsAlert(true);
            return;
        }

        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const horizon = endOfMonth(addMonths(new Date(), 12));
        const expanded = expandTransactionInstances(rawTx as any, rawTemplates as any, { horizonEnd: horizon });

        const headers = ['Nome', 'Valor Mensalidade (R$)', 'Frequência de Pagamento', 'Data do Próximo Pagamento'];

        const csvRows = activeClients.map(c => {
            const template = (rawTemplates as any[]).find(t => t.client_id === c.id);
            const freq = template ? periodLabel(template.recurrence_period, template.recurrence_interval) : 'Avulso/Pontual';

            const nextInstance = expanded
                .filter((t: any) => t.client_id === c.id && t.status === 'pending' && t.instanceDate >= todayStr)
                .sort((a: any, b: any) => a.instanceDate.localeCompare(b.instanceDate))[0];

            const value = nextInstance ? String(nextInstance.amount).replace('.', ',') : '';
            const date = nextInstance ? formatToSP(nextInstance.instanceDate, 'dd/MM/yyyy') : '';
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
        <>
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
                                    labels: Object.keys(reportData.frequencies),
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

        <ConfirmModal
            isOpen={showNoClientsAlert}
            onClose={() => setShowNoClientsAlert(false)}
            onConfirm={() => setShowNoClientsAlert(false)}
            title="Aviso"
            message="Não há clientes ativos para exportar."
            confirmLabel="OK"
            confirmColor="blue"
        />
        </>
    );
}

export default ReportsV2;
