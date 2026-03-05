import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { toast } from 'react-hot-toast';
import { UserPlus, X, PlusCircle } from 'lucide-react';
import { useClients } from '../../../contexts/ClientContext';
import { useAuth } from '../../../contexts/AuthContext';
import { formatToSP, convertToUTC } from '../../../lib/dates';
import type { Database, PaymentFrequency } from '../../../types/supabase';
import { setDate } from 'date-fns';
import { CurrencyInput } from '../../ui/CurrencyInput';
import { AddCustomFieldModal } from '../../AddCustomFieldModal';

type Client = Database['public']['Tables']['clients']['Row'];
type CustomField = Database['public']['Tables']['custom_fields']['Row'];

interface ClientFormV2Props {
    client?: Client;
    onClose: () => void;
}

const PAYMENT_FREQUENCY_OPTIONS: { value: PaymentFrequency; label: string }[] = [
    { value: 'monthly', label: 'Mensal' },
    { value: 'bimonthly', label: 'Bimestral' },
    { value: 'quarterly', label: 'Trimestral' },
    { value: 'semiannual', label: 'Semestral' },
    { value: 'annual', label: 'Anual' },
];

export function ClientFormV2({ client, onClose }: ClientFormV2Props) {
    const { clients, refreshClients } = useClients();
    const { user, plano } = useAuth();
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
        payment_frequency: 'monthly' as PaymentFrequency,
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
                    }, {} as { [key: string]: string });
                    setCustomFieldValues(values);
                }
            };
            fetchCustomFieldValues();
        }
    }, [client, customFields]);

    const handleSaveCustomField = (newField: CustomField) => {
        setCustomFields((prevFields) => [...prevFields, newField]);
        setCustomFieldValues((prevValues) => ({ ...prevValues, [newField.id]: '' }));
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
            if (!client && (plano === 'Básico' || plano === 'basico')) {
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
                user_id: user.id,
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
            const valuesToUpsert = allValues.filter(([, value]) => value).map(([fieldId, value]) => ({ client_id: clientResult.id, field_id: fieldId, value }));
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
            onClose();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Erro ao processar cliente');
            console.error(error);
        }
    };

    const inputClass = 'w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-custom/20 focus:border-custom outline-none transition-all text-sm';
    const labelClass = 'text-sm font-semibold text-gray-700';

    return (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
                    <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        {client ? 'Editar Cliente' : 'Cadastrar Novo Cliente'}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Form body — scrollable */}
                <div className="px-8 py-6 overflow-y-auto">
                    <form onSubmit={handleSubmit} id="clientFormV2" className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-1.5">
                                <label className={labelClass}>Nome Completo</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className={inputClass}
                                    placeholder="Digite o nome completo"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className={labelClass}>Telefone</label>
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={handlePhoneChange}
                                    className={inputClass}
                                    placeholder="(00) 00000-0000"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className={labelClass}>Data de Início</label>
                                <input
                                    type="date"
                                    required
                                    value={formData.start_date}
                                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                                    max={formatToSP(new Date(), 'yyyy-MM-dd')}
                                    className={inputClass}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className={labelClass}>Valor do Pagamento</label>
                                <div className="relative">
                                    <CurrencyInput
                                        id="monthly_payment_v2"
                                        value={formData.monthly_payment}
                                        onValueChange={(value) => setFormData({ ...formData, monthly_payment: value })}
                                        className={inputClass}
                                        placeholder="R$ 0,00"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-1.5">
                                <label className={labelClass}>Frequência</label>
                                <select
                                    value={formData.payment_frequency}
                                    onChange={(e) => setFormData({ ...formData, payment_frequency: e.target.value as PaymentFrequency })}
                                    className={inputClass}
                                >
                                    {PAYMENT_FREQUENCY_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className={labelClass}>Dia do Vencimento</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.payment_due_day}
                                    onChange={handleDueDayChange}
                                    className={inputClass}
                                    placeholder="1 a 31"
                                />
                                <p className="text-[11px] text-gray-500 mt-1 italic">Dia do mês em que o pagamento deve ser realizado.</p>
                            </div>
                        </div>

                        {/* Campos Personalizados — subtítulo com linha */}
                        {customFields.length > 0 && (
                            <div className="pt-4">
                                <div className="flex items-center gap-4 mb-4">
                                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Campos Personalizados</span>
                                    <div className="h-px bg-gray-100 flex-1" />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {customFields.map((field) => (
                                        <div key={field.id} className="space-y-1.5">
                                            <label className={labelClass}>{field.name}</label>
                                            <input
                                                type="text"
                                                value={customFieldValues[field.id] || ''}
                                                onChange={(e) => setCustomFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                                                className={inputClass}
                                                placeholder="Campo personalizado"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Botão de adicionar campo personalizado se não houver nenhum */}
                        {customFields.length === 0 && (
                            <div className="pt-2">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(true)}
                                    className="inline-flex items-center px-4 py-2 border border-dashed border-gray-300 text-sm font-medium rounded-lg text-gray-500 bg-transparent hover:bg-gray-50 transition-colors"
                                >
                                    <PlusCircle className="h-5 w-5 mr-2" />
                                    Adicionar Campo Personalizado
                                </button>
                            </div>
                        )}

                        {/* Toggle Cliente Ativo */}
                        <div className="flex items-center gap-3 pt-2">
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={formData.status}
                                    onChange={(e) => setFormData({ ...formData, status: e.target.checked })}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-custom" />
                                <span className="ml-3 text-sm font-medium text-gray-700">Cliente Ativo</span>
                            </label>
                        </div>

                        {/* Botões — dentro do form, não fixo */}
                        <div className="flex justify-end gap-3 pt-4">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-6 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                className="px-8 py-2.5 text-sm font-semibold text-white bg-custom hover:bg-custom-hover rounded-lg shadow-lg shadow-custom/20 transition-all flex items-center gap-2"
                            >
                                <UserPlus size={18} />
                                {client ? 'Atualizar Cliente' : 'Salvar Cliente'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {isModalOpen && (
                <AddCustomFieldModal
                    onClose={() => setIsModalOpen(false)}
                    onSave={handleSaveCustomField}
                />
            )}
        </div>
    );
}

export default ClientFormV2;
