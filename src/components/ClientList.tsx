import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { isSameDay, addMonths, format, startOfMonth } from 'date-fns';
import { Search, CheckCircle, XCircle, DollarSign, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { useClients } from '../contexts/ClientContext';
import { PaymentModal } from './PaymentModal';
import { PaymentHistory } from './PaymentHistory';
import { ClientForm } from './ClientForm';

import type { Database } from '../types/supabase';
import { toast } from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

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
  annual: 'Anual'
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
    <div className="fixed inset-0 bg-neutral-800/75 flex items-center justify-center p-4 z-50">
      <div className="bg-neutral-50 rounded-lg shadow-xl p-6 max-w-md w-full">
        <h3 className="text-lg font-semibold text-neutral-800 mb-4">Confirmar Exclusão</h3>
        <p className="text-sm text-neutral-600 mb-6">
          Tem certeza que deseja excluir o cliente <span className="font-bold text-neutral-800">{client.name}</span>? 
          Esta ação não pode ser desfeita e todos os pagamentos associados serão removidos.
        </p>
        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-neutral-300 rounded-md shadow-sm text-sm font-medium text-neutral-700 bg-white hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-500 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
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
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [clientsWithCustomFields, setClientsWithCustomFields] = useState<ClientWithCustomFields[]>([]);

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
      if (error) {
        console.error('Error fetching payments:', error);
        return;
      }
      setPayments(data);
    };
    fetchPayments();
  }, []);

  useEffect(() => {
    const combineClientData = async () => {
      if (clients.length === 0) {
        setClientsWithCustomFields(clients);
        return;
      }

      const clientIds = clients.map(c => c.id);
      const { data: customValues, error } = await supabase.from('client_custom_field_values').select('client_id, field_id, value').in('client_id', clientIds);

      if (error) {
        console.error('Erro ao buscar valores de campos personalizados:', error);
        setClientsWithCustomFields(clients);
        return;
      }

      const valuesMap = customValues.reduce((acc, cv) => {
        if (!acc[cv.client_id]) acc[cv.client_id] = {};
        acc[cv.client_id][cv.field_id] = cv.value;
        return acc;
      }, {} as { [clientId: string]: { [fieldId: string]: string } });

      const combinedClients = clients.map(client => ({ ...client, custom_field_values: valuesMap[client.id] || {} }));
      setClientsWithCustomFields(combinedClients);
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
      if (!paymentsError && newPayments) {
        setPayments(newPayments);
        setRefreshPayments(prev => prev + 1);
      }
      toast.success('Pagamento registrado com sucesso!');
    } catch (error: unknown) {
      if (error instanceof Error) {
        toast.error('Erro ao registrar pagamento: ' + error.message);
      } else {
        toast.error('Erro ao registrar pagamento: ' + String(error));
      }
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
    } catch (error) {
      toast.error('Erro ao excluir cliente');
      console.error(error);
    }
  };

  const toggleClientExpansion = (clientId: string) => {
    setExpandedClient(expandedClient === clientId ? null : clientId);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Buscar clientes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-full rounded-md border-neutral-300 shadow-sm focus:border-custom focus:ring-custom"
            />
          </div>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
          className="rounded-md border-neutral-300 shadow-sm focus:border-custom focus:ring-custom"
        >
          <option value="all">Todos os status</option>
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
        </select>
        <select
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value as 'all' | 'paid' | 'late' | 'due-today')}
          className="rounded-md border-neutral-300 shadow-sm focus:border-custom focus:ring-custom"
        >
          <option value="all">Todos os pagamentos</option>
          <option value="paid">Em dia</option>
          <option value="due-today">Vencendo hoje</option>
          <option value="late">Em atraso</option>
        </select>
      </div>

      <div className="bg-white shadow-lg rounded-lg overflow-hidden">
        <ul role="list" className="divide-y divide-neutral-200">
          {filteredClients.map((client) => {
            const status = getClientPaymentStatus(client, payments);
            const isExpanded = expandedClient === client.id;
            const periodosPendentes = getPeriodosPendentes(client, payments);

            return (
              <li key={client.id} className="hover:bg-secondary-50 transition-colors duration-150">
                <div className="px-4 py-4 sm:px-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center mb-2 sm:mb-0">
                      {client.status ? (
                        <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" title="Ativo" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" title="Inativo" />
                      )}
                      <button
                        onClick={() => setEditingClient(client)}
                        className="ml-3 text-sm font-medium text-neutral-800 hover:text-custom focus:outline-none focus:underline truncate max-w-[150px] sm:max-w-xs"
                        title={client.name}
                      >
                        {client.name}
                      </button>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        status === 'late' ? 'bg-red-100 text-red-700' :
                        status === 'due-today' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {status === 'late' ? 'Em atraso' :
                        status === 'due-today' ? 'Vencendo hoje' :
                        'Em dia'}
                      </span>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setSelectedClient(client)}
                          className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-custom hover:bg-custom-hover transition-colors"
                          title="Registrar Pagamento"
                        >
                          <DollarSign className="h-4 w-4" />
                          <span className="hidden sm:inline ml-1">Pagar</span>
                        </button>
                        <button
                          onClick={() => setDeletingClient(client)}
                          className="p-1 border border-transparent text-xs font-medium rounded-md text-neutral-500 hover:bg-red-100 hover:text-red-700 transition-colors"
                          title="Excluir Cliente"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => toggleClientExpansion(client.id)}
                          className="p-1 text-neutral-400 hover:text-neutral-600 transition-colors"
                          title={isExpanded ? "Recolher" : "Expandir"}
                        >
                          {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-sm text-neutral-600">
                    <p><span className="font-medium text-neutral-800">Valor:</span> R$ {client.monthly_payment.toFixed(2)}</p>
                    <p><span className="font-medium text-neutral-800">Frequência:</span> {PAYMENT_FREQUENCY_LABELS[client.payment_frequency]}</p>
                    <p><span className="font-medium text-neutral-800">Vencimento:</span> Dia {client.payment_due_day}</p>
                    {customFields.map(field => {
                      const value = client.custom_field_values?.[field.id];
                      return value ? <p key={field.id}><span className="font-medium text-neutral-800">{field.name}:</span> {value}</p> : null;
                    })}
                  </div>

                  {periodosPendentes.length > 0 && (
                    <div className="mt-2 text-sm text-red-600">
                      <p><span className="font-medium">Em atraso:</span> {periodosPendentes.map(formatarMesAno).join(', ')}</p>
                    </div>
                  )}

                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-neutral-200">
                      <PaymentHistory client={client} refreshKey={refreshPayments} />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {selectedClient && <PaymentModal client={selectedClient} onClose={() => setSelectedClient(null)} onConfirm={registerPayment} />}
      {editingClient && <ClientForm client={editingClient} onClose={() => setEditingClient(null)} />}
      {deletingClient && <DeleteModal client={deletingClient} onClose={() => setDeletingClient(null)} onConfirm={() => handleDeleteClient(deletingClient)} />}
    </div>
  );
}
