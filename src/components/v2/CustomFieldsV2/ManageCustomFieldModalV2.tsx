import React, { useState, useEffect } from 'react';
import { X, CheckCircle, Save, FormInput } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../../contexts/AuthContext';
export interface CustomField {
    id: number;
    user_id: string;
    name: string;
    created_at?: string;
    updated_at?: string;
}

interface ManageCustomFieldModalV2Props {
    fieldToEdit: CustomField | null;
    onClose: () => void;
    onSuccess: () => void;
}

export function ManageCustomFieldModalV2({ fieldToEdit, onClose, onSuccess }: ManageCustomFieldModalV2Props) {
    const { user } = useAuth();
    const [fieldName, setFieldName] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (fieldToEdit) {
            setFieldName(fieldToEdit.name);
        }
    }, [fieldToEdit]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (fieldName.trim() === '') {
            toast.error('O nome do campo é obrigatório.');
            return;
        }

        if (!user) return;
        setLoading(true);

        try {
            if (fieldToEdit) {
                // Mode: Edit
                const { error } = await supabase
                    .from('custom_fields')
                    .update({ name: fieldName.trim() })
                    .eq('id', fieldToEdit.id);

                if (error) throw error;
                toast.success('Campo atualizado com sucesso!');
            } else {
                // Mode: Create
                const { error } = await supabase
                    .from('custom_fields')
                    .insert([{ name: fieldName.trim(), user_id: user.id }]);

                if (error) throw error;
                toast.success('Campo criado com sucesso!');
            }

            onSuccess();
            onClose();
        } catch (error: any) {
            console.error('Erro na submissão de field:', error);
            toast.error(`Falha: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
            <div
                className="bg-white rounded-3xl p-6 md:p-8 max-w-md w-full relative shadow-2xl animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 p-2 rounded-full transition-colors"
                >
                    <X className="h-5 w-5" />
                </button>

                <div className="flex items-center gap-4 mb-8">
                    <div className="bg-[#14b8a6]/10 text-custom p-3 rounded-2xl flex-shrink-0">
                        <FormInput className="w-7 h-7" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                            {fieldToEdit ? 'Editar Campo' : 'Novo Campo'}
                        </h2>
                        <p className="text-slate-500 text-sm mt-1 font-medium">
                            {fieldToEdit ? 'Altere o nome da variável' : 'Dê um nome para este campo de cliente'}
                        </p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <label className="flex flex-col w-full">
                        <p className="text-slate-900 text-sm font-semibold leading-normal pb-2">Nome da Variável</p>
                        <input
                            type="text"
                            value={fieldName}
                            onChange={(e) => setFieldName(e.target.value)}
                            className="flex w-full rounded-xl text-slate-900 border border-slate-300 bg-white focus:ring-2 focus:ring-custom focus:border-custom h-14 placeholder:text-slate-400 px-4 text-base font-normal transition-all shadow-sm"
                            placeholder="Ex: CPF do Sócio, Telefone Residencial"
                            autoFocus
                            required
                        />
                    </label>

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-custom hover:bg-custom-hover text-white font-bold py-4 rounded-xl shadow-lg shadow-custom/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : fieldToEdit ? (
                                <>
                                    <Save className="h-5 w-5 mr-1" />
                                    Salvar Alterações
                                </>
                            ) : (
                                <>
                                    <CheckCircle className="h-5 w-5 mr-1" />
                                    Criar Campo
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
