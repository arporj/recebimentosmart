import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Users, Wallet, CircleDollarSign, AlertTriangle } from 'lucide-react';
import { formatToSP, toSPDate, getCurrentSPDate } from '../lib/dates';
import { isBefore, isSameMonth, startOfMonth, subMonths, addMonths } from 'date-fns';
import Plot from 'react-plotly.js';
import { useAuth } from '../contexts/AuthContext';

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

// Card de resumo
function ResumoCard({ title, value, icon: Icon, color, format = 'string' }: { title: string, value: string | number, icon: React.ElementType, color: string, format?: 'string' | 'currency' | 'integer' }) {
  const formatValue = () => {
    if (typeof value !== 'number') return value;

    switch (format) {
      case 'currency':
        return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      case 'integer':
        return value.toLocaleString('pt-BR');
      default:
        return value;
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow p-6 border-l-4 ${color} flex items-center`}>
      <Icon className="h-8 w-8 text-gray-400" />
      <div className="ml-5">
        <div className="text-sm text-gray-500">{title}</div>
        <div className="text-lg font-bold text-gray-900">{formatValue()}</div>
      </div>
    </div>
  );
}

export function Reports() {
  const [clients, setClients] = useState<Client[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() =>
    formatToSP(getCurrentSPDate(), 'yyyy-MM')
  );
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  // Indicadores
  const [expectedRevenue, setExpectedRevenue] = useState(0);
  const [receivedRevenue, setReceivedRevenue] = useState(0);
  const [activeClientsCount, setActiveClientsCount] = useState(0);
  const [inadimplenciaPercent, setInadimplenciaPercent] = useState(0);
  const [evolucaoReceita, setEvolucaoReceita] = useState<{mes: string, esperada: number, recebida: number}[]>([]);

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

  useEffect(() => {
    if (clients.length > 0) {
      calculateIndicators();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, payments, selectedMonth]);

  function calculateIndicators() {
    const [year, month] = selectedMonth.split('-').map(Number);
    const periodStart = startOfMonth(new Date(year, month - 1));
    const today = getCurrentSPDate();

    const activeClients = clients.filter(c => c.status);
    setActiveClientsCount(activeClients.length);

    const expectedClients = activeClients.filter(client => {
      if (!client.next_payment_date) return false;
      const nextPayment = toSPDate(client.next_payment_date);
      return isSameMonth(nextPayment, periodStart);
    });

    const expected = expectedClients.reduce((sum, c) => sum + c.monthly_payment, 0);
    setExpectedRevenue(expected);

    const received = payments
      .filter(p => {
        const dt = toSPDate(p.payment_date);
        return isSameMonth(dt, periodStart);
      })
      .reduce((sum, p) => sum + p.amount, 0);
    setReceivedRevenue(received);

    const lateClients = expectedClients.filter(client => {
      if (!client.next_payment_date) return false;
      const nextPayment = toSPDate(client.next_payment_date);
      if (!isBefore(nextPayment, today)) return false;
      const hasPaid = payments.some(p => p.client_id === client.id && isSameMonth(toSPDate(p.payment_date), nextPayment));
      return !hasPaid;
    });

    const lateValue = lateClients.reduce((sum, c) => sum + c.monthly_payment, 0);
    setInadimplenciaPercent(expected > 0 ? (lateValue / expected) * 100 : 0);

    const evol = [];
    for (let i = 5; i >= 0; i--) {
      const dt = subMonths(periodStart, i);
      const label = formatToSP(dt, 'MM/yyyy');
      const esperada = activeClients
        .filter(client => {
          if (!client.next_payment_date) return false;
          return isSameMonth(toSPDate(client.next_payment_date), dt);
        })
        .reduce((sum, c) => sum + c.monthly_payment, 0);
      const recebida = payments
        .filter(p => isSameMonth(toSPDate(p.payment_date), dt))
        .reduce((sum, p) => sum + p.amount, 0);
      evol.push({ mes: label, esperada, recebida });
    }
    setEvolucaoReceita(evol);
  }

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

  if (loading) {
    return <div>Carregando relatórios...</div>;
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-8">Relatórios Financeiros</h2>

      <div className="flex items-center gap-4 mb-8">
        <label className="text-sm font-medium">Mês:</label>
        <button onClick={handlePrevMonth} className="p-1 rounded hover:bg-gray-100">&lt;</button>
        <input
          type="month"
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          className="border rounded px-2 py-1"
        />
        <button onClick={handleNextMonth} className="p-1 rounded hover:bg-gray-100">&gt;</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
        <ResumoCard title="Receita Esperada" value={expectedRevenue} icon={Wallet} color="border-purple-500" format="currency" />
        <ResumoCard title="Receita Recebida" value={receivedRevenue} icon={CircleDollarSign} color="border-indigo-500" format="currency" />
        <ResumoCard title="Inadimplência (%)" value={`${inadimplenciaPercent.toFixed(1)}%`} icon={AlertTriangle} color="border-red-500" />
        <ResumoCard title="Clientes Ativos" value={activeClientsCount} icon={Users} color="border-blue-500" format="integer" />
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="font-bold mb-4">Evolução da Receita (Últimos 6 meses)</h3>
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
    </div>
  );
}
