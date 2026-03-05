import React, { useState } from 'react';
import { X, DollarSign } from 'lucide-react';
import { formatToSP } from '../../../lib/dates';
import type { Database } from '../../../types/supabase';

type Client = Database['public']['Tables']['clients']['Row'];

interface PaymentModalV2Props {
    client: Client;
    onClose: () => void;
    onConfirm: (clientId: string, amount: number, date: string, referenceMonth: string) => Promise<void>;
}

export function PaymentModalV2({ client, onClose, onConfirm }: PaymentModalV2Props) {
    const [paymentDate, setPaymentDate] = useState(formatToSP(new Date(), 'yyyy-MM-dd'));
    const [referenceMonth, setReferenceMonth] = useState(formatToSP(new Date(), 'yyyy-MM'));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await onConfirm(client.id, client.monthly_payment, paymentDate, referenceMonth);
        onClose();
    };

    const inputClass = 'w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-custom/20 focus:border-custom outline-none transition-all text-sm';
    const labelClass = 'text-sm font-semibold text-gray-700';

    return (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                {/* Header */}
                <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        Registrar Pagamento
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Body */}
                <div className="px-8 py-6">
                    {/* Info do cliente */}
                    <div className="bg-gray-50 rounded-xl p-4 mb-6 space-y-1">
                        <p className="text-sm text-gray-500">Cliente: <span className="font-semibold text-gray-900">{client.name}</span></p>
                        <p className="text-sm text-gray-500">Valor: <span className="font-semibold text-gray-900">R$ {client.monthly_payment.toFixed(2).replace('.', ',')}</span></p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-1.5">
                            <label className={labelClass}>Data do Pagamento</label>
                            <input
                                type="date"
                                value={paymentDate}
                                onChange={(e) => setPaymentDate(e.target.value)}
                                max={formatToSP(new Date(), 'yyyy-MM-dd')}
                                className={inputClass}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className={labelClass}>Mês de Referência</label>
                            <input
                                type="month"
                                value={referenceMonth}
                                onChange={(e) => setReferenceMonth(e.target.value)}
                                className={inputClass}
                                required
                            />
                        </div>

                        {/* Botões */}
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
                                <DollarSign size={18} />
                                Confirmar Pagamento
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

export default PaymentModalV2;
