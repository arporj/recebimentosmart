import React, { useState, useEffect, useCallback } from 'react';
import { useClients } from '../contexts/ClientContext';
import { formatToSP, toSPDate, getCurrentSPDate } from '../lib/dates';
import {
  isAfter,
  isBefore,
  isSameMonth,
  isSameDay,
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
  addMonths,
  subMonths,
  addDays,
  isWithinInterval,
} from 'date-fns';
import {
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  Wallet,
  CircleDollarSign,
  ChevronLeft,
  ChevronRight,
  Users,
  AlertTriangle,
  PieChart,
  Filter,
} from 'lucide-react';
import { PaymentModal } from './PaymentModal';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import type { Database } from '../types/supabase';
import { useAuth } from '../contexts/AuthContext';

type Client = Database['public']['Tables']['clients']['Row'];
type ViewMode = 'today' | 'month';
type PaymentStatus = 'pago' | 'pendente' | 'atrasado' | 'a-vencer' | 'vencendo-hoje';
type ExtratoFilter = 'todos' | 'pago' | 'pendente' | 'atrasado';

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

// ... (rest of the imports)

// ... (type definitions)


export function MonthlyPayments() {
  const { clients, refreshClients } = useClients();
  const [selectedDate, setSelectedDate] = useState(getCurrentSPDate());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const { user } = useAuth();

  // Resumos
  const [expectedRevenue, setExpectedRevenue] = useState(0);
  const [receivedRevenue, setReceivedRevenue] = useState(0);
  const [activeClientsCount, setActiveClientsCount] = useState(0);
  const [lateClientsCount, setLateClientsCount] = useState(0);
  const [paymentsList, setPaymentsList] = useState<PaymentListItem[]>([]);
  const [extratoFilter, setExtratoFilter] = useState<ExtratoFilter>('todos');
  const [pagosNoMes, setPagosNoMes] = useState<PaymentWithClient[]>([]);

  
  const today = startOfDay(getCurrentSPDate());
  const fiveDaysLater = endOfDay(addDays(today, 5));

  // Função para status do cliente no mês selecionado
  const getClientPaymentStatus = useCallback((client: Client, pagos: PaymentWithClient[], todayDate: Date, selectedMonth: Date): PaymentStatus | null => {
    if (!client.status || !client.next_payment_date) return null;
    const nextPayment = toSPDate(client.next_payment_date);

    // Só considera clientes com vencimento no mês selecionado
    if (!isSameMonth(nextPayment, selectedMonth)) return null;

    // Já pagou este vencimento?
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

  // Busca pagamentos do mês selecionado
  const fetchPayments = useCallback(async () => {
    if(!user) return;
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

    // Monta lista para extrato (pagos + pendentes/atrasados)
    const pagos: PaymentListItem[] = fetchedPayments.map((p) => ({
      id: p.id,
      payment_date: p.payment_date,
      client_id: p.client_id,
      client_name: p.clients?.name || '',
      amount: p.amount,
      status: 'pago' as PaymentStatus,
      vencimento: p.clients?.next_payment_date || null,
    }));

    // Pendentes/atrasados: clientes do mês que não têm pagamento registrado
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
    // Receita esperada: clientes com vencimento no mês selecionado
    const expectedClients = clients.filter(client => {
      if (!client.status || !client.next_payment_date) return false;
      const nextPayment = toSPDate(client.next_payment_date);
      return isSameMonth(nextPayment, selectedDate);
    });
    const expected = expectedClients.reduce((sum, client) => sum + client.monthly_payment, 0);
    setExpectedRevenue(expected);

    // Receita recebida: soma dos pagamentos realizados no mês selecionado
    const received = pagosNoMes.reduce((sum, payment) => sum + payment.amount, 0);
    setReceivedRevenue(received);

    // Clientes em atraso: clientes do mês selecionado que deveriam ter pago antes de hoje e não pagaram
    const lateClients = clients.filter(client => {
      const status = getClientPaymentStatus(client, pagosNoMes, today, selectedDate);
      return status === 'atrasado';
    });
    setLateClientsCount(lateClients.length);

    // Clientes ativos no mês selecionado
    setActiveClientsCount(expectedClients.length);
  }, [clients, pagosNoMes, selectedDate, getClientPaymentStatus, today]);

  // Resumos e cards
  useEffect(() => {
    fetchPayments();
  }, [clients, selectedDate, fetchPayments]);

  useEffect(() => {
    calculateRevenueAndSummary();
  }, [calculateRevenueAndSummary]);

  // Cards de pagamentos (usando status)
  const clientsWithStatus = clients.map(client => ({
    ...client,
    paymentStatus: getClientPaymentStatus(client, pagosNoMes, today, selectedDate),
  }));

  const latePayments = clientsWithStatus.filter(c => c.paymentStatus === 'atrasado');
  const dueTodayPayments = clientsWithStatus.filter(c => c.paymentStatus === 'vencendo-hoje');
  const upcomingPayments = clientsWithStatus.filter(c => c.paymentStatus === 'a-vencer');
  const pagosCount = clientsWithStatus.filter(c => c.paymentStatus === 'pago').length;
  const atrasadosCount = latePayments.length;
  const pendentesCount = upcomingPayments.length + dueTodayPayments.length;

  // Pagamentos vencendo nos próximos 5 dias (do mês selecionado)
  const dueNextFiveDaysPayments = clientsWithStatus.filter(client => {
    if (!client.next_payment_date) return false;
    const nextPayment = toSPDate(client.next_payment_date);
    return (
      isWithinInterval(nextPayment, { start: today, end: fiveDaysLater }) &&
      client.paymentStatus === 'a-vencer'
    );
  });

  // --- Registrar pagamento ---
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

  // --- Navegação e visão ---
  const handlePreviousMonth = () => setSelectedDate(subMonths(selectedDate, 1));
  const handleNextMonth = () => setSelectedDate(addMonths(selectedDate, 1));
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    if (mode === 'today') setSelectedDate(getCurrentSPDate());
  };

  // --- Componentes auxiliares ---
  const PaymentList = ({ clients, title, icon: Icon, bgColor, borderColor, iconColor }: {
    clients: Client[],
    title: string,
    icon: React.ElementType,
    bgColor: string,
    borderColor: string,
    iconColor: string
  }) => (
    <div className={`${bgColor} p-4 rounded-lg border-2 ${borderColor}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Icon className={`h-5 w-5 ${iconColor}`} />
          <h3 className="font-medium text-gray-900">{title}</h3>
        </div>
        <span className="text-sm text-gray-500">{clients.length} clientes</span>
      </div>
      {clients.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhum cliente</p>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <ul role="list" className="divide-y divide-gray-200">
            {clients.map((client) => (
              <li key={client.id} className="px-4 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">{client.name}</h4>
                    <div className="mt-1">
                      <p className="text-sm text-gray-500">
                        Valor: R$ {client.monthly_payment.toFixed(2)} ({PAYMENT_FREQUENCY_LABELS[client.payment_frequency]})
                      </p>
                      <p className="text-xs text-gray-400">
                        Próximo vencimento: {client.next_payment_date ? formatToSP(client.next_payment_date, 'dd/MM/yyyy') : ''}
                      </p>
                    </div>
                  </div>
                  <div>
                    <button
                      onClick={() => setSelectedClient(client)}
                      className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-custom hover:bg-custom-hover"
                    >
                      <DollarSign className="h-4 w-4 mr-1" />
                      Registrar Pagamento
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  const RevenueCard = ({ title, value, icon: Icon, color }: {
    title: string;
    value: number;
    icon: React.ElementType;
    color: string;
  }) => (
    <div className={`bg-white rounded-lg shadow p-6 border-l-4 ${color}`}>
      <div className="flex items-center">
        <div className="flex-shrink-0">
          <Icon className="h-8 w-8 text-gray-400" />
        </div>
        <div className="ml-5 w-0 flex-1">
          <dl>
            <dt className="text-sm font-medium text-gray-500 truncate">
              {title} (Mensal)
            </dt>
            <dd className="text-lg font-bold text-gray-900">R$ {value.toFixed(2)}</dd>
          </dl>
        </div>
      </div>
    </div>
  );

  // --- Extrato de pagamentos ---
  const filteredPayments = extratoFilter === 'todos'
    ? paymentsList
    : paymentsList.filter(p => p.status === extratoFilter);

  return (
    <div className="mb-8">
      {/* Navegação e visão */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
        <Calendar className="h-5 w-5 text-custom" />
          <div className="flex items-center space-x-2">
            <button
              onClick={handlePreviousMonth}
              className="p-1 rounded-full hover:bg-gray-100"
            >
              <ChevronLeft className="h-5 w-5 text-gray-600" />
            </button>
            <h2 className="text-lg font-medium text-gray-900">
              {formatToSP(selectedDate, 'MMMM/yyyy')}
            </h2>
            <button
              onClick={handleNextMonth}
              className="p-1 rounded-full hover:bg-gray-100"
            >
              <ChevronRight className="h-5 w-5 text-gray-600" />
            </button>
          </div>
        </div>
        <div className="flex rounded-md shadow-sm" role="group">
          <button
            type="button"
            onClick={() => handleViewModeChange('month')}
            className={`px-4 py-2 text-sm font-medium rounded-l-lg ${
              viewMode === 'month'
                ? 'bg-custom text-white'
                : 'bg-white text-gray-700 hover:bg-custom-hover hover:text-white'
            } border border-gray-200`}
          >
            Mensal
          </button>
          <button
            type="button"
            onClick={() => handleViewModeChange('today')}
            className={`px-4 py-2 text-sm font-medium rounded-r-lg ${
              viewMode === 'today'
                ? 'bg-custom text-white'
                : 'bg-white text-gray-700 hover:bg-custom-hover hover:text-white'
            } border border-l-0 border-gray-200`}
          >
            Hoje
          </button>
        </div>
      </div>

      {/* Resumo financeiro */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500 flex items-center">
          <Users className="h-8 w-8 text-blue-400" />
          <div className="ml-5">
            <div className="text-sm text-gray-500">Clientes ativos</div>
            <div className="text-lg font-bold text-gray-900">{activeClientsCount}</div>
          </div>
        </div>
        <RevenueCard
          title="Receita Esperada"
          value={expectedRevenue}
          icon={Wallet}
          color="border-purple-500"
        />
        <RevenueCard
          title="Receita Recebida"
          value={receivedRevenue}
          icon={CircleDollarSign}
          color="border-indigo-500"
        />
        <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-500 flex items-center">
          <AlertTriangle className="h-8 w-8 text-red-400" />
          <div className="ml-5">
            <div className="text-sm text-gray-500">Clientes em atraso</div>
            <div className="text-lg font-bold text-gray-900">{lateClientsCount}</div>
            <div className="text-xs text-red-600 mt-1">
              {activeClientsCount > 0
                ? `${((lateClientsCount / activeClientsCount) * 100).toFixed(1)}% inadimplência`
                : '0% inadimplência'}
            </div>
          </div>
        </div>
      </div>

      {/* Cards de pagamentos */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3">
          <div className="space-y-6">
            <PaymentList
              clients={dueNextFiveDaysPayments}
              title="Pagamentos Vencendo nos próximos 5 dias"
              icon={Clock}
              bgColor="bg-amber-50"
              borderColor="border-amber-200"
              iconColor="text-amber-600"
            />
            <PaymentList
              clients={latePayments}
              title="Pagamentos em Atraso"
              icon={XCircle}
              bgColor="bg-red-50"
              borderColor="border-red-200"
              iconColor="text-red-600"
            />
            <PaymentList
              clients={upcomingPayments}
              title="Pagamentos a Vencer"
              icon={CheckCircle2}
              bgColor="bg-emerald-50"
              borderColor="border-emerald-200"
              iconColor="text-emerald-600"
            />
          </div>
        </div>
        {/* Gráfico de pizza (mock visual) */}
        <div className="bg-white rounded-lg shadow p-6 flex flex-col items-center justify-center">
          <PieChart className="h-8 w-8 text-indigo-400 mb-2" />
          <div className="text-sm text-gray-500 mb-1">Pagamentos</div>
          <div className="w-full">
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-emerald-400"></span>
              <span className="text-xs text-gray-700">Pagos</span>
              <span className="ml-auto font-bold text-emerald-700">
                {pagosCount}
              </span>
            </div>
            <div className="flex items-center space-x-2 mt-1">
              <span className="w-3 h-3 rounded-full bg-red-400"></span>
              <span className="text-xs text-gray-700">Atrasados</span>
              <span className="ml-auto font-bold text-red-700">
                {atrasadosCount}
              </span>
            </div>
            <div className="flex items-center space-x-2 mt-1">
              <span className="w-3 h-3 rounded-full bg-amber-400"></span>
              <span className="text-xs text-gray-700">Pendentes</span>
              <span className="ml-auto font-bold text-amber-700">
                {pendentesCount}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Extrato de pagamentos */}
      <div className="mt-8 bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">Extrato de Pagamentos</h3>
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <select
              className="border border-gray-300 rounded p-1 text-sm focus:border-custom focus:ring-custom"
              value={extratoFilter}
              onChange={e => setExtratoFilter(e.target.value as ExtratoFilter)}
            >
              <option value="todos">Todos</option>
              <option value="pago">Pagos</option>
              <option value="pendente">Pendentes</option>
              <option value="atrasado">Atrasados</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead>
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Valor</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-gray-400 py-4">Nenhum pagamento encontrado</td>
                </tr>
              )}
              {filteredPayments.map((payment) => (
                <tr key={payment.id}>
                  <td className="px-4 py-2">{payment.vencimento ? formatToSP(payment.vencimento, 'dd/MM/yyyy') : ''}</td>
                  <td className="px-4 py-2">{payment.client_name}</td>
                  <td className="px-4 py-2">R$ {payment.amount.toFixed(2)}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      payment.status === 'pago'
                        ? 'bg-emerald-100 text-emerald-800'
                        : payment.status === 'atrasado'
                        ? 'bg-red-100 text-red-800'
                        : payment.status === 'vencendo-hoje'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {payment.status !== 'pago' && (
                      <button
                        className="text-custom hover:text-custom-hover text-xs"
                        onClick={() => setSelectedClient(clients.find(c => c.id === payment.client_id) || null)}
                      >
                        Registrar Pagamento
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de pagamento */}
      {selectedClient && (
        <PaymentModal
          client={selectedClient}
          onClose={() => setSelectedClient(null)}
          onConfirm={registerPayment}
        />
      )}
    </div>
  );
}