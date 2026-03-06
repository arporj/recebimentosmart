import React from 'react';
import { X, Trash2 } from 'lucide-react';
import type { Database } from '../../../types/supabase';

type Client = Database['public']['Tables']['clients']['Row'];

interface DeleteModalV2Props {
    client: Client;
    onClose: () => void;
    onConfirm: () => void;
}

export function DeleteModalV2({ client, onClose, onConfirm }: DeleteModalV2Props) {
    return (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                {/* Header */}
                <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        Confirmar Exclusão
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Body */}
                <div className="px-8 py-6">
                    <p className="text-sm text-gray-600 mb-6 leading-relaxed">
                        Tem certeza que deseja excluir o cliente <span className="font-bold text-gray-900">{client.name}</span>?
                        O cliente será ocultado da sua listagem principal, mas <span className="font-semibold text-emerald-600">todo o histórico de pagamentos será preservado</span> no banco de dados.
                    </p>

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
                            type="button"
                            onClick={onConfirm}
                            className="px-8 py-2.5 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg shadow-lg shadow-red-500/20 transition-all flex items-center gap-2"
                        >
                            <Trash2 size={18} />
                            Excluir Cliente
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default DeleteModalV2;
