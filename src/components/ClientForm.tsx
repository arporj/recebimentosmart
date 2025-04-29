import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { UserPlus, X } from 'lucide-react';
import { useClients } from '../contexts/ClientContext';
import { useAuth } from '../contexts/AuthContext';
import { formatToSP, convertToUTC } from '../lib/dates';
import type { Database, PaymentFrequency } from '../types/supabase';
import { setDate } from 'date-fns';

type Client = Database['public']['Tables']['clients']['Row'];

interface ClientFormProps {
  client?: Client;
  onClose?: () => void;
}

const PAYMENT_FREQUENCY_OPTIONS: { value: PaymentFrequency; label: string }[] = [
  { value: 'monthly', label: 'Mensal' },
  { value: 'bimonthly', label: 'Bimestral' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'semiannual', label: 'Semestral' },
  { value: 'annual', label: 'Anual' }
];

export function ClientForm({ client, onClose }: ClientFormProps) {
  const { refreshClients } = useClients();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    monthly_payment: '',
    payment_due_day: '',
    start_date: '',
    status: true,
    payment_frequency: 'monthly' as PaymentFrequency,
    device_key: client?.device_key || '',
    mac_address: client?.mac_address || '',
    app: client?.app || ''
  });

  useEffect(() => {
    if (client) {
      setFormData({
        name: client.name || '',
        phone: client.phone || '',
        monthly_payment: client.monthly_payment?.toString() || '',
        payment_due_day: client.payment_due_day?.toString() || '',
        start_date: client.start_date?.toString() || '',
        status: client.status ?? true,
        payment_frequency: client.payment_frequency || 'monthly',
        device_key: client?.device_key || '',
        mac_address: client?.mac_address || '',
        app: client?.app || ''
      });
    }
  }, [client]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    
    if (value.length <= 11) {
      value = value.replace(/^(\d{2})(\d{5})(\d{4}).*/, '($1) $2-$3');
      setFormData({ ...formData, phone: value });
    }
  };

  const handleMoneyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    value = value.replace(/[^\d.]/g, '');
    const parts = value.split('.');
    if (parts.length > 2) {
      value = parts[0] + '.' + parts.slice(1).join('');
    }
    if (parts[1]?.length > 2) {
      value = parts[0] + '.' + parts[1].slice(0, 2);
    }
    setFormData({ ...formData, monthly_payment: value });
  };

  const handleDueDayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    const day = parseInt(value);
    if (!value || (day >= 1 && day <= 31)) {
      setFormData({ ...formData, payment_due_day: value });
    }
  };

  const calculateNextPaymentDate = (startDate: Date, paymentDueDay: number): Date => {
    const today = new Date();
    let nextPaymentDate = setDate(startDate, paymentDueDay);

    // If the calculated date is in the past, set it to today
    if (nextPaymentDate < today) {
      nextPaymentDate = setDate(today, paymentDueDay);
    }

    return nextPaymentDate;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (!user) {
        throw new Error('Usuário não autenticado');
      }

      if (!formData.name || !formData.monthly_payment || !formData.payment_due_day || !formData.start_date) {
        throw new Error('Nome, valor do pagamento, dia do vencimento e data de início são obrigatórios');
      }

      const monthlyPayment = parseFloat(formData.monthly_payment);
      if (isNaN(monthlyPayment) || monthlyPayment <= 0) {
        throw new Error('Valor do pagamento inválido');
      }

      const paymentDueDay = parseInt(formData.payment_due_day);
      if (isNaN(paymentDueDay) || paymentDueDay < 1 || paymentDueDay > 31) {
        throw new Error('Dia de vencimento deve ser entre 1 e 31');
      }

      const startDate = new Date(formData.start_date);
      const nextPaymentDate = calculateNextPaymentDate(startDate, paymentDueDay);

      const clientData = {
        name: formData.name.trim(),
        phone: formData.phone.trim() || '',
        monthly_payment: monthlyPayment,
        payment_due_day: paymentDueDay,
        start_date: convertToUTC(startDate.toISOString()),
        next_payment_date: convertToUTC(nextPaymentDate.toISOString()),
        status: formData.status,
        payment_frequency: formData.payment_frequency,
        user_id: user.id,
        device_key: formData.device_key,
        mac_address: formData.mac_address,
        app: formData.app
      };

      let error;

      if (client) {
        // Update existing client
        ({ error } = await supabase
          .from('clients')
          .update(clientData)
          .eq('id', client.id));
      } else {
        // Create new client
        ({ error } = await supabase
          .from('clients')
          .insert([clientData]));
      }

      if (error) throw error;

      await refreshClients();
      toast.success(client ? 'Cliente atualizado com sucesso!' : 'Cliente cadastrado com sucesso!');
      
      if (!client) {
        setFormData({
          name: '',
          phone: '',
          monthly_payment: '',
          payment_due_day: '',
          start_date: '',
          status: true,
          payment_frequency: 'monthly',
          device_key: '',
          mac_address: '',
          app: ''
        });
        setIsOpen(false);
      } else if (onClose) {
        onClose();
      }
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error('Erro ao processar cliente');
      }
      console.error(error);
    }
  };

  const formContent = (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto">
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Nome Completo
        </label>
        <input
          type="text"
          required
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          placeholder="Digite o nome completo"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Telefone
        </label>
        <input
          type="tel"
          value={formData.phone}
          onChange={handlePhoneChange}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          placeholder="(00) 00000-0000"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Data de Início
        </label>
        <input
          type="date"
          required
          value={formData.start_date}
          onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
          max={formatToSP(new Date(), 'yyyy-MM-dd')}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Valor do Pagamento
        </label>
        <div className="mt-1 relative rounded-md shadow-sm">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <span className="text-gray-500 sm:text-sm">R$</span>
          </div>
          <input
            type="text"
            required
            value={formData.monthly_payment}
            onChange={handleMoneyChange}
            className="pl-8 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            placeholder="0.00"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Frequência de Pagamento
        </label>
        <select
          value={formData.payment_frequency}
          onChange={(e) => setFormData({ ...formData, payment_frequency: e.target.value as PaymentFrequency })}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
        >
          {PAYMENT_FREQUENCY_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Dia do Vencimento
        </label>
        <input
          type="text"
          required
          value={formData.payment_due_day}
          onChange={handleDueDayChange}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          placeholder="Digite um número entre 1 e 31"
        />
        <p className="mt-1 text-sm text-gray-500">
          Dia do mês em que o pagamento deve ser realizado
        </p>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Device Key
        </label>
        <input
          type="text"
          value={formData.device_key || ''}
          onChange={(e) => setFormData({ ...formData, device_key: e.target.value })}
          maxLength={64}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Endereço MAC
        </label>
        <input
          type="text"
          value={formData.mac_address || ''}
          onChange={(e) => setFormData({ ...formData, mac_address: e.target.value })}
          maxLength={17}
          placeholder="AA:BB:CC:DD:EE:FF"
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          App
        </label>
        <input
          type="text"
          value={formData.app || ''}
          onChange={(e) => setFormData({ ...formData, app: e.target.value })}
          maxLength={36}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
        />
      </div>

      <div className="flex items-center">
        <input
          type="checkbox"
          id="status"
          checked={formData.status}
          onChange={(e) => setFormData({ ...formData, status: e.target.checked })}
          className="h-4 w-4 rounded border-gray-300 text-custom focus:ring-custom"
        />
        <label htmlFor="status" className="ml-2 block text-sm text-gray-900">
          Cliente Ativo
        </label>
      </div>

      <div className="md:col-span-2 flex justify-end space-x-3 mt-6">
        <button
          type="button"
          onClick={() => client ? onClose?.() : setIsOpen(false)}
          className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Cancelar
        </button>
          <button
            type="submit"
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-custom hover:bg-custom-hover"
          >
            {client ? 'Atualizar' : 'Salvar'}
          </button>
      </div>
    </form>
  );

  if (client) {
    return (
      <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-500"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-medium mb-4">Editar Cliente</h2>
          {formContent}
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-custom hover:bg-custom-hover"
      >
        <UserPlus className="h-5 w-5 mr-2" />
        Novo Cliente
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full relative">
            <h2 className="text-lg font-medium mb-4">Cadastrar Novo Cliente</h2>
            {formContent}
          </div>
        </div>
      )}
    </div>
  );
}