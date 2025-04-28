import React from 'react';
import { useClients } from '../contexts/ClientContext';
import { formatToSP, toSPDate, getCurrentSPDate } from '../lib/dates';
import { isAfter, isSameDay } from 'date-fns';
import { AlertCircle, Users } from 'lucide-react';
import type { Database } from '../types/supabase';

type Client = Database['public']['Tables']['clients']['Row'];

const PAYMENT_FREQUENCY_LABELS: Record<string, string> = {
  monthly: 'Mensal',
  bimonthly: 'Bimestral',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual'
};

export function PaymentsDue() {
  const { clients } = useClients();
  const today = getCurrentSPDate();

  // Group clients by their status
  const activeClients = clients.filter(client => client.status);
  const inactiveClients = clients.filter(client => !client.status);

  const getClientStatus = (client: Client) => {
    if (!client.status) return { label: 'Inativo', className: 'bg-gray-100 text-gray-800' };
    if (!client.next_payment_date) return { label: 'Aguardando', className: 'bg-yellow-100 text-yellow-800' };
    
    const nextPayment = toSPDate(client.next_payment_date);
    if (isSameDay(nextPayment, today)) {
      return { label: 'Vencendo hoje', className: 'bg-orange-100 text-orange-800' };
    }
    if (isAfter(today, nextPayment)) {
      return { label: 'Em atraso', className: 'bg-red-100 text-red-800' };
    }
    return { label: 'Em dia', className: 'bg-green-100 text-green-800' };
  };

  const ClientList = ({ clients, title, bgColor }: { clients: Client[], title: string, bgColor: string }) => (
    <div className={`${bgColor} p-4 rounded-lg`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Users className="h-5 w-5" />
          <h3 className="font-medium">{title}</h3>
        </div>
        <span className="text-sm text-gray-500">{clients.length} clientes</span>
      </div>
      
      {clients.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhum cliente</p>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <ul role="list" className="divide-y divide-gray-200">
            {clients.map((client) => {
              const status = getClientStatus(client);
              return (
                <li key={client.id} className="px-4 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">{client.name}</h4>
                      <div className="mt-1">
                        <p className="text-sm text-gray-500">
                          Valor: R$ {client.monthly_payment.toFixed(2)} ({PAYMENT_FREQUENCY_LABELS[client.payment_frequency]})
                        </p>
                        <p className="text-sm text-gray-500">
                          Próximo pagamento: {client.next_payment_date 
                            ? formatToSP(client.next_payment_date, 'dd/MM/yyyy')
                            : 'Não definido'
                          }
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status.className}`}>
                        {status.label}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );

  return (
    <div className="mb-8">
      <div className="flex items-center space-x-2 mb-4">
        <AlertCircle className="h-5 w-5 text-indigo-500" />
        <h2 className="text-lg font-medium text-gray-900">Status dos Clientes</h2>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <ClientList
          clients={activeClients}
          title="Clientes Ativos"
          bgColor="bg-green-50"
        />
        <ClientList
          clients={inactiveClients}
          title="Clientes Inativos"
          bgColor="bg-gray-50"
        />
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 rounded-full bg-green-100"></div>
          <span className="text-sm text-gray-600">Em dia</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 rounded-full bg-orange-100"></div>
          <span className="text-sm text-gray-600">Vencendo hoje</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 rounded-full bg-red-100"></div>
          <span className="text-sm text-gray-600">Em atraso</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 rounded-full bg-yellow-100"></div>
          <span className="text-sm text-gray-600">Aguardando</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 rounded-full bg-gray-100"></div>
          <span className="text-sm text-gray-600">Inativo</span>
        </div>
      </div>
    </div>
  );
}