import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { isSameDay, addMonths, format, startOfMonth } from 'date-fns';
import { Search, CheckCircle, XCircle, DollarSign, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { useClients } from '../contexts/ClientContext';
import { PaymentModal } from './PaymentModal';
import { PaymentHistory } from './PaymentHistory';
import { ClientForm } from './ClientForm';
import { formatToSP, toSPDate, getCurrentSPDate } from '../lib/dates';
import type { Database } from '../types/supabase';
import { toast } from 'react-hot-toast';

type Client = Database['public']['Tables']['clients']['Row'];
type Payment = Database['public']['Tables']['payments']['Row'];

const PAYMENT_FREQUENCY_LABELS: Record<string, string> = {
  monthly: 'Mensal',
  bimonthly: 'Bimestral',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual'
};

const FREQUENCY_MONTHS = {
  monthly: 1,
  bimonthly: 2,
  quarterly: 3,
  semiannual: 6,
  annual: 12
};

// Gera períodos devidos conforme frequência (YYYY-MM)
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

// Retorna períodos pendentes para o cliente
function getPeriodosPendentes(client: Client, payments: Payment[]): string[] {
  const periodosDevidos = gerarPeriodosDevidos(client.start_date, client.payment_frequency);
  const periodosPagos = payments
    .filter(p => p.client_id === client.id && p.reference_month)
    .map(p => p.reference_month!);

  return periodosDevidos.filter(periodo => !periodosPagos.includes(periodo));
}

// Retorna status do cliente para o filtro
function getClientPaymentStatus(client: Client, payments: Payment[]): 'paid' | 'late' | 'due-today' {
  const pendentes = getPeriodosPendentes(client, payments);
  if (pendentes.length === 0) return 'paid';

  // Pega o período pendente mais antigo
  const periodoMaisAntigo = pendentes[0];
  const [ano, mes] = periodoMaisAntigo.split('-').map(Number);
  const vencimento = new Date(ano, mes - 1, client.payment_due_day);
  const hoje = new Date();

  if (isSameDay(vencimento, hoje)) return 'due-today';
  if (vencimento < hoje) return 'late';
  return 'paid'; // Se o próximo vencimento é no futuro
}

// Formata período YYYY-MM para "Mês/Ano"
function formatarMesAno(yyyyMM: string) {
  if (!yyyyMM) return '';
  const [ano, mes] = yyyyMM.split('-');
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return `${meses[parseInt(mes, 10) - 1]}/${ano}`;
}

interface DeleteModalProps {
  client: Client;
  onClose: () => void;
  onConfirm: () => void;
}

function DeleteModal({ client, onClose, onConfirm }: DeleteModalProps) {
  
  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Confirmar Exclusão</h3>
        <p className="text-sm text-gray-500 mb-6">
          Tem certeza que deseja excluir o cliente <span className="font-medium text-gray-900">{client.name}</span>? 
          Esta ação não pode ser desfeita e todos os pagamentos associados serão removidos.
        </p>
        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
          >
            Excluir
          </button>
        </div>
      </div>
    </div>
  );
}

export function ClientList() {
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

  useEffect(() => {
    const fetchPayments = async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('*');
      
      if (error) {
        console.error('Error fetching payments:', error);
        return;
      }
      
      setPayments(data);
    };

    fetchPayments();
  }, []);

  const filteredClients = clients.filter(client => {
    const matchesSearch = client.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' 
      ? true 
      : statusFilter === 'active' ? client.status : !client.status;

    const clientStatus = getClientPaymentStatus(client, payments);
    const matchesPayment = paymentFilter === 'all'
      ? true
      : paymentFilter === clientStatus;

    return matchesSearch && matchesStatus && matchesPayment;
  });

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
      const { data: newPayments, error: paymentsError } = await supabase.from('payments').select('*');
      if (!paymentsError && newPayments) {
        setPayments(newPayments);
        setRefreshPayments(prev => prev + 1);
      }
      
      toast.success('Pagamento registrado com sucesso!');
    } catch (error: any) {
      toast.error('Erro ao registrar pagamento: ' + error.message);
      console.error(error);
    }
  }

  const handleDeleteClient = async (client: Client) => {
    try {
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', client.id);

      if (error) throw error;

      await refreshClients();
      const { data: newPayments, error: paymentsError } = await supabase.from('payments').select('*');
      if (!paymentsError && newPayments) {
        setPayments(newPayments);
      }

      toast.success('Cliente excluído com sucesso!');
      setDeletingClient(null);
    } catch (error) {
      toast.error('Erro ao excluir cliente');
      console.error(error);
    }
  };

  const toggleClientExpansion = (clientId: string) => {
    setExpandedClient(expandedClient === clientId ? null : clientId);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <div className="relative z-20"> {/* Ajuste o z-index para 20 */}
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Buscar clientes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
        >
          <option value="all">Todos os status</option>
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
        </select>
        <select
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value as any)}
          className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
        >
          <option value="all">Todos os pagamentos</option>
          <option value="paid">Em dia</option>
          <option value="due-today">Vencendo hoje</option>
          <option value="late">Em atraso</option>
        </select>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul role="list" className="divide-y divide-gray-200">
          {filteredClients.map((client) => {
            const status = getClientPaymentStatus(client, payments);
            const isExpanded = expandedClient === client.id;
            const periodosPendentes = getPeriodosPendentes(client, payments);

            return (
              <li key={client.id}>
                <div className="px-4 py-4 sm:px-6">
                  {/* Layout principal - reorganizado para ser mais responsivo */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                    {/* Nome do cliente e status */}
                    <div className="flex items-center mb-2 sm:mb-0">
                      {client.status ? (
                        <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                      )}
                      <button
                        onClick={() => setEditingClient(client)}
                        className="ml-2 text-sm font-medium text-gray-900 hover:text-indigo-600 focus:outline-none focus:underline truncate max-w-[150px] sm:max-w-xs"
                        title={client.name} // Tooltip para nomes longos
                      >
                        {client.name}
                      </button>
                    </div>
                    
                    {/* Ações e status de pagamento - em linha em telas pequenas */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        status === 'late' ? 'bg-red-100 text-red-800' :
                        status === 'due-today' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {status === 'late' ? 'Em atraso' :
                        status === 'due-today' ? 'Vencendo hoje' :
                        'Em dia'}
                      </span>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setSelectedClient(client)}
                          className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-custom hover:bg-custom-hover"
                          title="Registrar Pagamento"
                        >
                          <DollarSign className="h-4 w-4" />
                          <span className="hidden sm:inline ml-1">Pagamento</span>
                        </button>
                        <button
                          onClick={() => setDeletingClient(client)}
                          className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded-md text-red-700 hover:bg-red-100"
                          title="Excluir Cliente"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => toggleClientExpansion(client.id)}
                          className="inline-flex items-center text-gray-400 hover:text-gray-500"
                          title={isExpanded ? "Recolher" : "Expandir"}
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-5 w-5" />
                          ) : (
                            <ChevronDown className="h-5 w-5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Informações do cliente - reorganizadas para melhor visualização em telas pequenas */}
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-sm text-gray-500">
                    <p className="flex items-center">
                      <span className="font-medium mr-1">Valor:</span> R$ {client.monthly_payment.toFixed(2)}
                    </p>
                    <p className="flex items-center">
                      <span className="font-medium mr-1">Frequência:</span> {PAYMENT_FREQUENCY_LABELS[client.payment_frequency]}
                    </p>
                    <p className="flex items-center">
                      <span className="font-medium mr-1">Vencimento:</span> Dia {client.payment_due_day}
                    </p>
                    {client.device_key && (
                      <p className="flex items-center">
                        <span className="font-medium mr-1">Device Key:</span> {client.device_key}
                      </p>
                    )}
                    {client.mac_address && (
                      <p className="flex items-center">
                        <span className="font-medium mr-1">MAC:</span> {client.mac_address}
                      </p>
                    )}
                    {client.app && (
                      <p className="flex items-center">
                        <span className="font-medium mr-1">App:</span> {client.app}
                      </p>
                    )}
                  </div>

                  {/* Períodos em atraso */}
                  {periodosPendentes.length > 0 && (
                    <div className="mt-2 text-sm text-red-500">
                      <p>
                        <span className="font-medium">Em atraso:</span> {periodosPendentes.map(formatarMesAno).join(', ')}
                      </p>
                    </div>
                  )}

                  {/* Histórico de pagamentos expandido */}
                  {isExpanded && (
                    <div className="mt-4">
                      <PaymentHistory client={client} refreshKey={refreshPayments} />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {selectedClient && (
        <PaymentModal
          client={selectedClient}
          onClose={() => setSelectedClient(null)}
          onConfirm={registerPayment}
        />
      )}

      {editingClient && (
        <ClientForm
          client={editingClient}
          onClose={() => setEditingClient(null)}
        />
      )}

      {deletingClient && (
        <DeleteModal
          client={deletingClient}
          onClose={() => setDeletingClient(null)}
          onConfirm={() => handleDeleteClient(deletingClient)}
        />
      )}
    </div>
  );
}