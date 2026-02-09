import React, { useState, useEffect } from 'react';

import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { UserPlus, X, PlusCircle } from 'lucide-react';
import { useClients } from '../contexts/ClientContext';
import { useAuth } from '../contexts/AuthContext';
import { formatToSP, convertToUTC } from '../lib/dates';
import type { Database, PaymentFrequency } from '../types/supabase';
import { setDate } from 'date-fns';
import { CurrencyInput } from './ui/CurrencyInput';
import { AddCustomFieldModal } from './AddCustomFieldModal';

type Client = Database['public']['Tables']['clients']['Row'];
type CustomField = Database['public']['Tables']['custom_fields']['Row'];

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
  const { clients, refreshClients } = useClients();
  const { user, plano } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<{[key: string]: string}>({});
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    monthly_payment: 0,
    payment_due_day: '',
    start_date: '',
    status: true,
    payment_frequency: 'monthly' as PaymentFrequency
  });

  useEffect(() => {
    const fetchCustomFields = async () => {
      if (user) {
        const { data, error } = await supabase
          .from('custom_fields')
          .select('*')
          .eq('user_id', user.id)
          .order('name', { ascending: true });

        if (error) {
          toast.error('Erro ao buscar campos personalizados.');
          console.error(error);
        } else {
          setCustomFields(data);
        }
      }
    };

    fetchCustomFields();
  }, [user]);

  useEffect(() => {
    if (client) {
      setFormData({
        name: client.name,
        phone: client.phone || '',
        monthly_payment: client.monthly_payment * 100,
        payment_due_day: String(client.payment_due_day),
        start_date: formatToSP(new Date(client.start_date), 'yyyy-MM-dd'),
        status: client.status,
        payment_frequency: client.payment_frequency,
      });
    }
  }, [client]);

  useEffect(() => {
    if (client && customFields.length > 0) {
      const fetchCustomFieldValues = async () => {
        const { data, error } = await supabase
          .from('client_custom_field_values')
          .select('field_id, value')
          .eq('client_id', client.id);

        if (error) {
          toast.error('Erro ao buscar valores dos campos personalizados.');
        } else {
          const values = data.reduce((acc, item) => {
            acc[item.field_id] = item.value;
            return acc;
          }, {} as {[key: string]: string});
          setCustomFieldValues(values);
        }
      };

      fetchCustomFieldValues();
    }
  }, [client, customFields]);

  const handleSaveCustomField = (newField: CustomField) => {
    setCustomFields(prevFields => [...prevFields, newField]);
    setCustomFieldValues(prevValues => ({ ...prevValues, [newField.id]: '' }));
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    
    if (value.length <= 11) {
      value = value.replace(/^(\d{2})(\d{5})(\d{4}).*/, '($1) $2-$3');
      setFormData({ ...formData, phone: value });
    }
  };

  const handleDueDayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    const day = parseInt(value);
    if (!value || (day >= 1 && day <= 31)) {
      setFormData({ ...formData, payment_due_day: value });
    }
  };

  const calculateNextPaymentDate = (startDate: Date, paymentDueDay: number): Date => {
    const today = new Date();
    let nextPaymentDate = setDate(startDate, paymentDueDay);

    if (nextPaymentDate < today) {
      nextPaymentDate = setDate(today, paymentDueDay);
    }

    return nextPaymentDate;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (!user) throw new Error('Usuário não autenticado');

      // Verificação do limite do plano Básico
      if (!client && (plano === 'Básico' || plano === 'basico')) {
         // O limite é de 20 clientes para o plano Básico
         if (clients.length >= 20) {
             throw new Error('O plano Básico permite cadastrar apenas 20 clientes. Faça o upgrade para o plano Pró para cadastrar clientes ilimitados.');
         }
      }
      if (!formData.name || formData.monthly_payment <= 0 || !formData.payment_due_day || !formData.start_date) {
        throw new Error('Nome, valor do pagamento, dia do vencimento e data de início são obrigatórios');
      }

      const monthlyPayment = formData.monthly_payment / 100;
      if (isNaN(monthlyPayment) || monthlyPayment <= 0) throw new Error('Valor do pagamento inválido');

      const paymentDueDay = parseInt(formData.payment_due_day);
      if (isNaN(paymentDueDay) || paymentDueDay < 1 || paymentDueDay > 31) throw new Error('Dia de vencimento deve ser entre 1 e 31');

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
        user_id: user.id
      };

      let error;
      let clientResult;

      if (client) {
        const { data, error: updateError } = await supabase.from('clients').update(clientData).eq('id', client.id).select().single();
        error = updateError;
        clientResult = data;
      } else {
        const { data, error: insertError } = await supabase.from('clients').insert([clientData]).select().single();
        error = insertError;
        clientResult = data;
      }

      if (error) throw error;
      if (!clientResult) throw new Error('Falha ao obter dados do cliente.');

      const allValues = Object.entries(customFieldValues);
      const valuesToUpsert = allValues.filter(([, value]) => value).map(([fieldId, value]) => ({ client_id: clientResult.id, field_id: fieldId, value: value }));
      const fieldsToDelete = allValues.filter(([, value]) => !value).map(([fieldId]) => fieldId);

      if (valuesToUpsert.length > 0) {
        const { error: upsertError } = await supabase.from('client_custom_field_values').upsert(valuesToUpsert, { onConflict: 'client_id, field_id' });
        if (upsertError) throw upsertError;
      }

      if (fieldsToDelete.length > 0) {
        const { error: deleteError } = await supabase.from('client_custom_field_values').delete().eq('client_id', clientResult.id).in('field_id', fieldsToDelete);
        if (deleteError) throw deleteError;
      }

      await refreshClients();
      toast.success(client ? 'Cliente atualizado com sucesso!' : 'Cliente cadastrado com sucesso!');
      
      if (!client) {
        setFormData({ name: '', phone: '', monthly_payment: 0, payment_due_day: '', start_date: '', status: true, payment_frequency: 'monthly' });
        setCustomFieldValues({});
        setIsOpen(false);
      } else if (onClose) {
        onClose();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao processar cliente');
      console.error(error);
    }
  };

  const formContent = (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[70vh] overflow-y-auto p-1">
      <div>
        <label className="block text-sm font-medium text-neutral-700" htmlFor="name">Nome Completo</label>
        <input
          id="name"
          type="text"
          required
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-custom focus:ring-custom sm:text-sm"
          placeholder="Digite o nome completo"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700" htmlFor="phone">Telefone</label>
        <input
          id="phone"
          type="tel"
          value={formData.phone}
          onChange={handlePhoneChange}
          className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-custom focus:ring-custom sm:text-sm"
          placeholder="(00) 00000-0000"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700" htmlFor="start_date">Data de Início</label>
        <input
          id="start_date"
          type="date"
          required
          value={formData.start_date}
          onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
          max={formatToSP(new Date(), 'yyyy-MM-dd')}
          className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-custom focus:ring-custom sm:text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700" htmlFor="monthly_payment">Valor do Pagamento</label>
        <div className="mt-1">
          <CurrencyInput
            id="monthly_payment"
            value={formData.monthly_payment}
            onValueChange={(value) => setFormData({ ...formData, monthly_payment: value })}
            className="block w-full rounded-md border-neutral-300 shadow-sm focus:border-custom focus:ring-custom sm:text-sm"
            placeholder="R$ 0,00"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700" htmlFor="payment_frequency">Frequência</label>
        <select
          id="payment_frequency"
          value={formData.payment_frequency}
          onChange={(e) => setFormData({ ...formData, payment_frequency: e.target.value as PaymentFrequency })}
          className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-custom focus:ring-custom sm:text-sm"
        >
          {PAYMENT_FREQUENCY_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700" htmlFor="payment_due_day">Dia do Vencimento</label>
        <input
          id="payment_due_day"
          type="text"
          required
          value={formData.payment_due_day}
          onChange={handleDueDayChange}
          className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-custom focus:ring-custom sm:text-sm"
          placeholder="1 a 31"
        />
        <p className="mt-1 text-sm text-neutral-500">Dia do mês em que o pagamento deve ser realizado.</p>
      </div>
      
      <div className="md:col-span-2">
        {customFields.length > 0 ? (
          <div>
            <h3 className="text-md font-medium text-neutral-800 mb-2 border-b border-neutral-200 pb-1">Campos Personalizados</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {customFields.map((field) => (
                <div key={field.id}>
                  <label className="block text-sm font-medium text-neutral-700" htmlFor={`custom-field-${field.id}`}>{field.name}</label>
                  <input
                    id={`custom-field-${field.id}`}
                    type="text"
                    value={customFieldValues[field.id] || ''}
                    onChange={(e) => setCustomFieldValues(prev => ({...prev, [field.id]: e.target.value}))}
                    className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-custom focus:ring-custom sm:text-sm"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-4 md:col-span-2">
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center px-4 py-2 border border-dashed border-neutral-300 text-sm font-medium rounded-md text-neutral-600 bg-transparent hover:bg-secondary-100 transition-colors"
            >
              <PlusCircle className="h-5 w-5 mr-2" />
              Adicionar Campo Personalizado
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center md:col-span-2">
        <input
          type="checkbox"
          id="status"
          checked={formData.status}
          onChange={(e) => setFormData({ ...formData, status: e.target.checked })}
          className="h-4 w-4 rounded border-neutral-300 text-custom focus:ring-custom"
        />
        <label htmlFor="status" className="ml-2 block text-sm text-neutral-800">Cliente Ativo</label>
      </div>

      <div className="md:col-span-2 flex justify-end space-x-3 mt-6">
        <button
          type="button"
          onClick={() => client ? onClose?.() : setIsOpen(false)}
          className="px-4 py-2 border border-neutral-300 rounded-md shadow-sm text-sm font-medium text-neutral-700 bg-white hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-500 transition-colors"
        >
          Cancelar
        </button>
          <button
            type="submit"
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-custom hover:bg-custom-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-custom-hover transition-colors"
          >
            {client ? 'Atualizar Cliente' : 'Salvar Cliente'}
          </button>
      </div>

      {isModalOpen && (
        <AddCustomFieldModal
          onClose={() => setIsModalOpen(false)}
          onSave={handleSaveCustomField}
        />
      )}
    </form>
  );

  if (client) {
    return (
      <div className="fixed inset-0 bg-neutral-800/75 flex items-center justify-center p-4 z-50 transition-opacity">
        <div className="bg-neutral-50 rounded-lg shadow-xl p-6 max-w-2xl w-full relative">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
          <h2 className="text-xl font-semibold text-neutral-800 mb-4">Editar Cliente</h2>
          {formContent}
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-custom hover:bg-custom-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-custom-hover transition-all duration-300 ease-in-out transform hover:scale-105"
      >
        <UserPlus className="h-5 w-5 mr-2" />
        Novo Cliente
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-neutral-800/75 flex items-center justify-center p-4 z-50 transition-opacity">
          <div className="bg-neutral-50 rounded-lg shadow-xl p-6 max-w-2xl w-full relative">
            <button onClick={() => setIsOpen(false)} className="absolute top-3 right-3 text-neutral-400 hover:text-neutral-600 transition-colors">
              <X className="h-6 w-6" />
            </button>
            <h2 className="text-xl font-semibold text-neutral-800 mb-4">Cadastrar Novo Cliente</h2>
            {formContent}
          </div>
        </div>
      )}
    </div>
  );
}
