import React, { useState, useEffect } from 'react';

import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { UserPlus, X, PlusCircle, Mail, Loader2, Check, CheckCircle, AlertCircle } from 'lucide-react';
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
  const [customFieldValues, setCustomFieldValues] = useState<{ [key: string]: string }>({});
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    monthly_payment: 0,
    payment_due_day: '',
    start_date: '',
    status: true,
    payment_frequency: 'monthly' as PaymentFrequency
  });

  const [receiverEmail, setReceiverEmail] = useState('');
  const [searchResult, setSearchResult] = useState<{ name: string; email: string } | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isSearchingUser, setIsSearchingUser] = useState(false);
  const [originalShare, setOriginalShare] = useState<{ id: string, receiver_email: string } | null>(null);

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
    const fetchShare = async () => {
      if (client) {
        const { data, error } = await supabase
          .from('client_shares')
          .select('id, receiver_email')
          .eq('client_id', client.id)
          .maybeSingle();

        if (data && !error) {
          setReceiverEmail(data.receiver_email);
          setOriginalShare(data);
          
          try {
            const { data: profileData, error: profileError } = await supabase.rpc('get_profile_by_email', { email_search: data.receiver_email.toLowerCase() });
            if (!profileError && profileData && profileData.length > 0) {
              setSearchResult({ name: profileData[0].name, email: data.receiver_email });
              setIsConfirmed(true);
            }
          } catch (e) {
            console.error(e);
          }
        }
      }
    };
    fetchShare();
  }, [client]);

  useEffect(() => {
    if (isConfirmed) return;

    if (!receiverEmail || !receiverEmail.includes('@') || receiverEmail.length < 5) {
      setSearchResult(null);
      return;
    }

    const searchProfile = async () => {
      setIsSearchingUser(true);
      try {
        const { data, error } = await supabase.rpc('get_profile_by_email', { email_search: receiverEmail.trim().toLowerCase() });
        if (error) throw error;
        if (data && data.length > 0) {
          setSearchResult({ name: data[0].name, email: receiverEmail.trim() });
        } else {
          setSearchResult(null);
        }
      } catch (err) {
        console.error('Erro ao buscar perfil:', err);
        setSearchResult(null);
      } finally {
        setIsSearchingUser(false);
      }
    };

    const timeoutId = setTimeout(() => {
      searchProfile();
    }, 800);

    return () => clearTimeout(timeoutId);
  }, [receiverEmail, isConfirmed]);

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
          }, {} as { [key: string]: string });
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
      if (!formData.name) {
        throw new Error('Nome completo é obrigatório');
      }

      // Manter lógica de recorrência com valores padrão não visíveis
      const monthlyPayment = 0;
      const paymentDueDay = 1;
      const startDate = new Date();
      const nextPaymentDate = calculateNextPaymentDate(startDate, paymentDueDay);

      const clientData = {
        name: formData.name.trim(),
        phone: formData.phone.trim() || '',
        monthly_payment: monthlyPayment,
        payment_due_day: paymentDueDay,
        start_date: convertToUTC(startDate.toISOString()),
        next_payment_date: convertToUTC(nextPaymentDate.toISOString()),
        status: formData.status,
        payment_frequency: 'monthly' as const,
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

      // Validação de confirmação de e-mail se ele preencheu
      if (receiverEmail && !isConfirmed) {
        throw new Error('É necessário clicar no usuário encontrado para confirmar o vínculo antes de salvar.');
      }

      // Persistência do vínculo de compartilhamento na tabela client_shares
      const cleanEmail = isConfirmed ? receiverEmail.trim().toLowerCase() : '';
      const originalEmail = originalShare?.receiver_email?.trim().toLowerCase() || '';

      if (cleanEmail !== originalEmail) {
        if (originalShare && !cleanEmail) {
          const { error: deleteShareErr } = await supabase
            .from('client_shares')
            .delete()
            .eq('id', originalShare.id);
          
          if (deleteShareErr) throw deleteShareErr;
        } else if (cleanEmail) {
          if (cleanEmail === user.email?.toLowerCase()) {
            throw new Error('Você não pode compartilhar um cliente com seu próprio e-mail.');
          }

          const shareData: any = {
            client_id: clientResult.id,
            sender_id: user.id,
            receiver_email: cleanEmail,
            status: 'pending'
          };
          
          if (originalShare?.id) {
            shareData.id = originalShare.id;
          }

          const { error: upsertShareErr } = await supabase
            .from('client_shares')
            .upsert(shareData);

          if (upsertShareErr) throw upsertShareErr;
        }
      }

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
        setReceiverEmail('');
        setSearchResult(null);
        setIsConfirmed(false);
        setOriginalShare(null);
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

      <div className="md:col-span-2 mt-2 border-t border-dashed border-neutral-200 pt-4">
        <label className="block text-sm font-medium text-neutral-700" htmlFor="receiver_email">
          Associar com usuário existente (Vínculo por E-mail)
        </label>
        {!isConfirmed ? (
          <div className="mt-1 relative rounded-md shadow-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Mail className="h-5 w-5 text-neutral-400" />
            </div>
            <input
              id="receiver_email"
              type="email"
              value={receiverEmail}
              onChange={(e) => {
                setReceiverEmail(e.target.value);
                setSearchResult(null);
              }}
              className="focus:ring-custom focus:border-custom block w-full pl-10 sm:text-sm border-neutral-300 rounded-md"
              placeholder="Digite o e-mail do usuário para buscar"
            />
            {isSearchingUser && (
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <Loader2 className="h-5 w-5 text-neutral-400 animate-spin" />
              </div>
            )}
          </div>
        ) : (
          <div className="mt-2 flex w-full items-center justify-between p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg transition-all duration-300 animate-fade-in">
            <div className="flex items-center gap-3.5">
              <div className="bg-emerald-600 p-2.5 rounded-full text-white shadow-sm">
                <CheckCircle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-emerald-700 font-semibold tracking-wider uppercase">Vínculo Confirmado</p>
                <p className="text-base font-bold text-neutral-900 leading-tight mt-0.5">{searchResult?.name}</p>
                <p className="text-xs text-neutral-600 mt-0.5">{receiverEmail}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsConfirmed(false);
                setSearchResult(null);
                setReceiverEmail('');
              }}
              className="text-xs font-bold text-red-700 bg-white hover:bg-red-50 border border-red-200 px-3 py-2 rounded-md shadow-xs transition-all duration-200 flex items-center gap-1"
            >
              <X className="h-3.5 w-3.5" />
              Desvincular
            </button>
          </div>
        )}

        {searchResult && !isConfirmed && (
          <button
            type="button"
            onClick={() => setIsConfirmed(true)}
            className="mt-3 flex w-full items-center justify-between p-3.5 bg-neutral-900 border border-neutral-800 hover:bg-emerald-950 hover:border-emerald-800 rounded-xl text-left transition-all duration-300 hover:shadow-lg group focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-600 transform hover:-translate-y-0.5 animate-bounce-short"
          >
            <div className="flex items-center gap-3.5">
              <div className="bg-emerald-500/10 p-2 rounded-lg group-hover:bg-emerald-500/20 text-emerald-400 transition-colors">
                <Check className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[10px] text-emerald-400 font-bold tracking-widest uppercase">Usuário Encontrado! Clique para Confirmar</p>
                <p className="text-base font-bold text-white leading-tight mt-0.5">{searchResult.name}</p>
              </div>
            </div>
            <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 group-hover:bg-emerald-500/20 px-3 py-1.5 rounded-lg border border-emerald-500/20 shadow-xs uppercase tracking-wider transition-all">
              Confirmar
            </span>
          </button>
        )}

        {!searchResult && !isSearchingUser && receiverEmail && receiverEmail.includes('@') && receiverEmail.length > 5 && !isConfirmed && (
          <div className="mt-2.5 p-3 bg-rose-50 border border-rose-100 rounded-lg flex items-start gap-2 text-rose-700">
            <AlertCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">Usuário não encontrado</p>
              <p className="text-xs text-rose-600 leading-relaxed">Nenhum perfil cadastrado com esse e-mail no sistema.</p>
            </div>
          </div>
        )}

        <p className="mt-2 text-xs text-neutral-500">
          Ao associar um usuário pelo e-mail cadastrado, os lançamentos vinculados a este cliente ficarão disponíveis no menu "Compartilhado comigo" dele.
        </p>
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
                    onChange={(e) => setCustomFieldValues(prev => ({ ...prev, [field.id]: e.target.value }))}
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

  // Quando chamado externamente com onClose (ex: ClientListV2), abre modal direto
  if (onClose) {
    return (
      <div className="fixed inset-0 bg-neutral-800/75 flex items-center justify-center p-4 z-50 transition-opacity">
        <div className="bg-neutral-50 rounded-lg shadow-xl p-6 max-w-2xl w-full relative">
          <button onClick={onClose} className="absolute top-3 right-3 text-neutral-400 hover:text-neutral-600 transition-colors">
            <X className="h-6 w-6" />
          </button>
          <h2 className="text-xl font-semibold text-neutral-800 mb-4">Cadastrar Novo Cliente</h2>
          {formContent}
        </div>
      </div>
    );
  }

  // Uso original com botão toggle (Dashboard antigo)
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
