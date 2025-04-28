import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Users, UserCheck, UserX, Clock, Wallet, CircleDollarSign, AlertTriangle, PieChart, FileDown } from 'lucide-react';
import { formatToSP, toSPDate, getCurrentSPDate } from '../lib/dates';
import { isAfter, isBefore, isSameMonth, isSameDay, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns';
// Se você já usa alguma lib de chart, substitua pelo seu componente de gráfico
import Plot from 'react-plotly.js';

type Client = {
  id: string;
  name: string;
  status: boolean;
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

const PAYMENT_FREQUENCY_LABELS: Record<string, string> = {
  monthly: 'Mensal',
  bimonthly: 'Bimestral',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual'
};

export function Reports() {
  const [clients, setClients] = useState<Client[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() =>
    formatToSP(getCurrentSPDate(), 'yyyy-MM')
  );
  const [loading, setLoading] = useState(false);

  // Indicadores
  const [expectedRevenue, setExpectedRevenue] = useState(0);
  const [receivedRevenue, setReceivedRevenue] = useState(0);
  const [activeClientsCount, setActiveClientsCount] = useState(0);
  const [inactiveClientsCount, setInactiveClientsCount] = useState(0);
  const [lateClientsCount, setLateClientsCount] = useState(0);
  const [lateValue, setLateValue] = useState(0);
  const [inadimplenciaPercent, setInadimplenciaPercent] = useState(0);

  // Para gráficos
  const [evolucaoReceita, setEvolucaoReceita] = useState<{mes: string, esperada: number, recebida: number}[]>([]);
  const [statusDistribuicao, setStatusDistribuicao] = useState<{status: string, count: number}[]>([]);
  const [frequenciaDistribuicao, setFrequenciaDistribuicao] = useState<{freq: string, count: number}[]>([]);
  const [topInadimplentes, setTopInadimplentes] = useState<{name: string, valor: number, dias: number}[]>([]);

  // Busca dados
  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (clients.length) calculateIndicators();
    // eslint-disable-next-line
  }, [clients, payments, selectedMonth]);

  async function fetchData() {
    setLoading(true);
    const { data: clientsData } = await supabase.from('clients').select('*');
    const { data: paymentsData } = await supabase.from('payments').select('*');
    setClients(clientsData || []);
    setPayments(paymentsData || []);
    setLoading(false);
  }

  function calculateIndicators() {
    // Período selecionado
    const [year, month] = selectedMonth.split('-').map(Number);
    const periodStart = startOfMonth(new Date(year, month - 1));
    const periodEnd = endOfMonth(new Date(year, month - 1));
    const today = getCurrentSPDate();

    // Ativos/inativos
    const activeClients = clients.filter(c => c.status);
    const inactiveClients = clients.filter(c => !c.status);
    setActiveClientsCount(activeClients.length);
    setInactiveClientsCount(inactiveClients.length);

    // Receita esperada: todos clientes ativos com vencimento no mês selecionado
    const expectedClients = activeClients.filter(client => {
      if (!client.next_payment_date) return false;
      const nextPayment = toSPDate(client.next_payment_date);
      return isSameMonth(nextPayment, periodStart);
    });
    const expected = expectedClients.reduce((sum, c) => sum + c.monthly_payment, 0);
    setExpectedRevenue(expected);

    // Receita recebida: pagamentos realizados no mês selecionado
    const received = payments
      .filter(p => {
        const dt = toSPDate(p.payment_date);
        return isSameMonth(dt, periodStart);
      })
      .reduce((sum, p) => sum + p.amount, 0);
    setReceivedRevenue(received);

    // Inadimplentes: clientes ativos, vencimento antes de hoje, não pagos
    const lateClients = expectedClients.filter(client => {
      if (!client.next_payment_date) return false;
      const nextPayment = toSPDate(client.next_payment_date);
      if (!isBefore(nextPayment, today)) return false;
      // Já pagou este vencimento?
      const pago = payments.some(p =>
        p.client_id === client.id &&
        isSameDay(toSPDate(p.payment_date), nextPayment)
      );
      return !pago;
    });
    setLateClientsCount(lateClients.length);
    setLateValue(lateClients.reduce((sum, c) => sum + c.monthly_payment, 0));
    setInadimplenciaPercent(expected > 0 ? (lateClients.reduce((sum, c) => sum + c.monthly_payment, 0) / expected) * 100 : 0);

    // Gráfico evolução receita (últimos 6 meses)
    const evol = [];
    for (let i = 5; i >= 0; i--) {
      const dt = subMonths(periodStart, i);
      const label = formatToSP(dt, 'MM/yyyy');
      const esperada = activeClients
        .filter(client => {
          if (!client.next_payment_date) return false;
          const nextPayment = toSPDate(client.next_payment_date);
          return isSameMonth(nextPayment, dt);
        })
        .reduce((sum, c) => sum + c.monthly_payment, 0);
      const recebida = payments
        .filter(p => isSameMonth(toSPDate(p.payment_date), dt))
        .reduce((sum, p) => sum + p.amount, 0);
      evol.push({ mes: label, esperada, recebida });
    }
    setEvolucaoReceita(evol);

    // Distribuição por status
    const statusDist = [
      { status: 'Em dia', count: expectedClients.filter(client => {
        if (!client.next_payment_date) return false;
        const nextPayment = toSPDate(client.next_payment_date);
        if (isBefore(nextPayment, today)) return false;
        // Já pagou?
        const pago = payments.some(p =>
          p.client_id === client.id &&
          isSameDay(toSPDate(p.payment_date), nextPayment)
        );
        return pago || isAfter(nextPayment, today) || isSameDay(nextPayment, today);
      }).length },
      { status: 'Atrasado', count: lateClients.length },
      { status: 'Vencendo hoje', count: expectedClients.filter(client => {
        if (!client.next_payment_date) return false;
        const nextPayment = toSPDate(client.next_payment_date);
        return isSameDay(nextPayment, today);
      }).length }
    ];
    setStatusDistribuicao(statusDist);

    // Distribuição por frequência
    const freqDist: Record<string, number> = {};
    Object.keys(PAYMENT_FREQUENCY_LABELS).forEach(f => freqDist[f] = 0);
    expectedClients.forEach(client => {
      freqDist[client.payment_frequency] = (freqDist[client.payment_frequency] || 0) + 1;
    });
    setFrequenciaDistribuicao(
      Object.entries(freqDist).map(([freq, count]) => ({
        freq: PAYMENT_FREQUENCY_LABELS[freq] || freq,
        count
      }))
    );

    // Top inadimplentes
    const inadimplentesDetalhe = lateClients.map(client => {
      const nextPayment = toSPDate(client.next_payment_date!);
      const dias = Math.max(0, Math.floor((today.getTime() - nextPayment.getTime()) / (1000 * 60 * 60 * 24)));
      return {
        name: client.name,
        valor: client.monthly_payment,
        dias
      };
    }).sort((a, b) => b.valor - a.valor).slice(0, 5);
    setTopInadimplentes(inadimplentesDetalhe);
  }

  // Exportação CSV
  function exportCSV() {
    const rows = [
      ['Cliente', 'Valor', 'Dias em atraso'],
      ...topInadimplentes.map(i => [i.name, i.valor, i.dias])
    ];
    const csv = rows.map(r => r.join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inadimplentes.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  // Navegação de mês
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

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-8">Relatórios Financeiros</h2>

      {/* Filtro de período */}
      <div className="flex items-center gap-4 mb-8">
        <label className="text-sm font-medium">Mês:</label>
        <button onClick={handlePrevMonth} className="p-1 rounded hover:bg-gray-100">
          &lt;
        </button>
        <input
          type="month"
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          className="border rounded px-2 py-1"
        />
        <button onClick={handleNextMonth} className="p-1 rounded hover:bg-gray-100">
          &gt;
        </button>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
        <ResumoCard title="Receita Esperada" value={expectedRevenue} icon={Wallet} color="border-purple-500" />
        <ResumoCard title="Receita Recebida" value={receivedRevenue} icon={CircleDollarSign} color="border-indigo-500" />
        <ResumoCard title="Inadimplência (%)" value={inadimplenciaPercent.toFixed(1) + '%'} icon={AlertTriangle} color="border-red-500" />
        <ResumoCard title="Clientes Ativos" value={activeClientsCount} icon={Users} color="border-blue-500" />
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        {/* Evolução da Receita */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-bold mb-4">Evolução da Receita (6 meses)</h3>
          <Plot
            data={[
              {
                x: evolucaoReceita.map(e => e.mes),
                y: evolucaoReceita.map(e => e.esperada),
                type: 'scatter',
                mode: 'lines+markers',
                name: 'Esperada',
                line: { color: '#8b5cf6' },
              },
              {
                x: evolucaoReceita.map(e => e.mes),
                y: evolucaoReceita.map(e => e.recebida),
                type: 'scatter',
                mode: 'lines+markers',
                name: 'Recebida',
                line: { color: '#6366f1' },
              },
            ]}
            layout={{
              autosize: true,
              margin: { t: 20, b: 40, l: 40, r: 10 },
              legend: { orientation: 'h', y: -0.2 },
              yaxis: { title: 'R$' },
              xaxis: { title: 'Mês' },
            }}
            style={{ width: "100%", height: "300px" }}
            config={{ displayModeBar: false }}
          />
        </div>
        {/* Distribuição por status */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-bold mb-4">Distribuição por Status</h3>
          <Plot
            data={[
              {
                values: statusDistribuicao.map(s => s.count),
                labels: statusDistribuicao.map(s => s.status),
                type: 'pie',
                marker: { colors: ['#10b981', '#f59e42', '#f43f5e'] }
              }
            ]}
            layout={{
              autosize: true,
              margin: { t: 20, b: 20, l: 10, r: 10 },
              showlegend: true,
            }}
            style={{ width: "100%", height: "300px" }}
            config={{ displayModeBar: false }}
          />
        </div>
      </div>

      {/* Distribuição por frequência */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <h3 className="font-bold mb-4">Distribuição por Frequência de Pagamento</h3>
        <Plot
          data={[
            {
              x: frequenciaDistribuicao.map(f => f.freq),
              y: frequenciaDistribuicao.map(f => f.count),
              type: 'bar',
              marker: { color: '#6366f1' }
            }
          ]}
          layout={{
            autosize: true,
            margin: { t: 20, b: 40, l: 40, r: 10 },
            yaxis: { title: 'Clientes' },
            xaxis: { title: 'Frequência' },
          }}
          style={{ width: "100%", height: "300px" }}
          config={{ displayModeBar: false }}
        />
      </div>

      {/* Tabela de inadimplentes */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold">Top Inadimplentes</h3>
          <button
            className="flex items-center px-3 py-1 bg-gray-100 rounded text-sm hover:bg-gray-200"
            onClick={exportCSV}
          >
            <FileDown className="h-4 w-4 mr-1" /> Exportar CSV
          </button>
        </div>
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Valor</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Dias em atraso</th>
            </tr>
          </thead>
          <tbody>
            {topInadimplentes.length === 0 && (
              <tr>
                <td colSpan={3} className="text-center text-gray-400 py-4">Nenhum inadimplente</td>
              </tr>
            )}
            {topInadimplentes.map((i, idx) => (
              <tr key={idx}>
                <td className="px-4 py-2">{i.name}</td>
                <td className="px-4 py-2">R$ {i.valor.toFixed(2)}</td>
                <td className="px-4 py-2">{i.dias} dias</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Card de resumo
function ResumoCard({ title, value, icon: Icon, color }: { title: string, value: any, icon: any, color: string }) {
  return (
    <div className={`bg-white rounded-lg shadow p-6 border-l-4 ${color} flex items-center`}>
      <Icon className="h-8 w-8 text-gray-400" />
      <div className="ml-5">
        <div className="text-sm text-gray-500">{title}</div>
        <div className="text-lg font-bold text-gray-900">{typeof value === 'number' ? `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : value}</div>
      </div>
    </div>
  );
}