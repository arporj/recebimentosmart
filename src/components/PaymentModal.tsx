import React, { useState } from 'react';
import { X } from 'lucide-react';
import { formatToSP } from '../lib/dates';
import type { Database } from '../types/supabase';

type Client = Database['public']['Tables']['clients']['Row'];

interface PaymentModalProps {
  client: Client;
  onClose: () => void;
  onConfirm: (clientId: string, amount: number, date: string, referenceMonth: string) => Promise<void>;
}

export function PaymentModal({ client, onClose, onConfirm }: PaymentModalProps) {
  const [paymentDate, setPaymentDate] = useState(formatToSP(new Date(), 'yyyy-MM-dd'));
  
  const [referenceMonth, setReferenceMonth] = useState(formatToSP(new Date(), 'yyyy-MM'));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('client.id:', client.id, typeof client.id);
    await onConfirm(client.id, client.monthly_payment, paymentDate, referenceMonth);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-500"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-lg font-medium mb-4">Registrar Pagamento</h2>
        
        <div className="mb-4">
          <p className="text-sm text-gray-500">Cliente: <span className="font-medium text-gray-900">{client.name}</span></p>
          <p className="text-sm text-gray-500">Valor: <span className="font-medium text-gray-900">R$ {client.monthly_payment.toFixed(2)}</span></p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Data do Pagamento
            </label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              max={formatToSP(new Date(), 'yyyy-MM-dd')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>

          <div>
              <label className="block text-sm font-medium text-gray-700">
                Mês de Referência
              </label>
              <input
                type="month"
                value={referenceMonth}
                onChange={e => setReferenceMonth(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                required
              />
            </div>

          <div className="flex justify-end space-x-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-custom hover:bg-custom-hover"
            >
              Confirmar Pagamento
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}