import { useState, useEffect } from 'react';
import { PlusCircle, Search, Trash2, Edit2, FormInput } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { ManageCustomFieldModalV2, CustomField } from './ManageCustomFieldModalV2';



export function CustomFieldsManagerV2() {
    const { user } = useAuth();
    const [fields, setFields] = useState<CustomField[]>([]);
    const [searchQuery, setSearchQuery] = useState('');

    // Modals state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [fieldToEdit, setFieldToEdit] = useState<CustomField | null>(null);

    useEffect(() => {
        fetchFields();
    }, [user]);

    const fetchFields = async () => {
        if (!user) return;
        const { data, error } = await supabase
            .from('custom_fields')
            .select('*')
            .eq('user_id', user.id)
            .order('name', { ascending: true });

        if (error) {
            toast.error('Erro ao carregar campos personalizados.');
        } else {
            setFields(data || []);
        }
    };

    const handleDeleteField = async (id: number) => {
        if (!window.confirm("Certeza que deseja excluir este campo?")) return;

        const { error } = await supabase.from('custom_fields').delete().eq('id', id);

        if (error) {
            toast.error('Erro ao excluir campo.');
        } else {
            setFields(fields.filter((field) => field.id !== id));
            toast.success('Campo excluído.');
        }
    };

    const openCreateModal = () => {
        setFieldToEdit(null);
        setIsModalOpen(true);
    };

    const openEditModal = (field: CustomField) => {
        setFieldToEdit(field);
        setIsModalOpen(true);
    };

    const filteredFields = fields.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

    return (
        <div className="w-full max-w-5xl mx-auto pb-12 animate-in fade-in duration-500">

            {/* HEADER V2 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div>
                    <div className="flex items-center gap-3">
                        <div className="bg-[#14b8a6]/10 text-[#14b8a6] p-3 rounded-2xl hidden sm:flex">
                            <FormInput className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black tracking-tight text-slate-900 leading-tight">Campos Premium</h1>
                            <p className="text-sm text-slate-500 mt-1 font-medium">Configure e gerencie campos extras para o perfil dos seus clientes</p>
                        </div>
                    </div>
                </div>
                <button
                    onClick={openCreateModal}
                    className="bg-custom hover:bg-custom-hover text-white px-5 py-3 rounded-xl shadow-lg shadow-custom/20 transition-all font-bold text-sm flex items-center justify-center gap-2 whitespace-nowrap"
                >
                    <PlusCircle className="w-5 h-5" />
                    Adicionar Campo
                </button>
            </div>

            {/* SEARCH AND FILTERS */}
            <div className="relative mb-6 group">
                <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                    <Search className="w-5 h-5 text-slate-400 group-focus-within:text-custom transition-colors" />
                </div>
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="block w-full h-14 pl-12 pr-4 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-custom/20 focus:border-custom outline-none transition-all placeholder:text-slate-400 text-slate-900 font-medium shadow-sm"
                    placeholder="Buscar campos personalizados..."
                />
            </div>

            {/* LISTAGEM DE CAMPOS */}
            <div className="space-y-3">
                {filteredFields.length === 0 ? (
                    <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center flex flex-col items-center justify-center">
                        <FormInput className="w-12 h-12 text-slate-300 mb-4" />
                        <h3 className="text-lg font-bold text-slate-900 mb-1">Nenhum campo encontrado</h3>
                        <p className="text-slate-500 mb-6 max-w-sm">Você ainda não registrou campos personalizados com esse nome.</p>
                        <button onClick={openCreateModal} className="text-custom font-bold hover:underline">
                            Criar meu primeiro campo
                        </button>
                    </div>
                ) : (
                    filteredFields.map((field) => (
                        <div
                            key={field.id}
                            className="bg-white hover:border-custom/30 rounded-2xl p-5 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between shadow-md hover:shadow-lg transition-all duration-300 gap-4"
                        >
                            <div className="flex flex-col gap-1.5">
                                <span className="text-lg font-bold text-slate-800">{field.name}</span>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => openEditModal(field)}
                                    className="p-2.5 text-slate-400 hover:text-custom hover:bg-custom/10 rounded-xl transition-all"
                                    title="Editar campo"
                                >
                                    <Edit2 className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={() => handleDeleteField(field.id)}
                                    className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                                    title="Excluir campo"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {isModalOpen && (
                <ManageCustomFieldModalV2
                    fieldToEdit={fieldToEdit}
                    onClose={() => setIsModalOpen(false)}
                    onSuccess={fetchFields}
                />
            )}

        </div>
    );
}
