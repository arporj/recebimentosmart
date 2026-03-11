import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Save, User, Lock, Key, Shield, Star, CheckCircle, BadgeCheck } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

export default function UserProfileSettingsV2() {
    const { user, plano, updateUserName, fetchReferralInfo } = useAuth();

    const [currentName, setCurrentName] = useState('');
    const [currentCpfCnpj, setCurrentCpfCnpj] = useState('');
    const [cpfCnpjError, setCpfCnpjError] = useState<string | null>(null);

    // Loading status form
    const [saving, setSaving] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        if (user) {
            setCurrentName(user.user_metadata?.name || '');
            const fetchCpfCnpj = async () => {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('cpf_cnpj')
                    .eq('id', user.id)
                    .single();
                if (error) {
                    console.error('Erro ao buscar CPF/CNPJ:', error);
                } else if (data && data.cpf_cnpj) {
                    setCurrentCpfCnpj(data.cpf_cnpj);
                }
            };
            fetchCpfCnpj();
        }
    }, [user]);

    const formatCpfCnpj = (value: string) => {
        const cleaned = value.replace(/\D/g, '');
        if (cleaned.length <= 11) {
            return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
        }
        return cleaned.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{1,2})/, '$1.$2.$3/$4-$5');
    };

    const handleSave = async () => {
        setSaving(true);
        setCpfCnpjError(null);
        let success = true;

        // Name Update
        if (!currentName.trim()) {
            toast.error('O nome não pode ficar em branco.');
            success = false;
        } else if (currentName.trim() !== user?.user_metadata?.name) {
            try {
                await updateUserName(currentName.trim());
            } catch (error) {
                success = false;
                toast.error('Erro ao atualizar o nome.');
            }
        }

        // CPF / CNPJ Update
        const cleanedCpfCnpj = currentCpfCnpj.replace(/[^0-9]/g, '');
        if (cleanedCpfCnpj && (cleanedCpfCnpj.length === 11 || cleanedCpfCnpj.length === 14)) {
            try {
                const { error } = await supabase
                    .from('profiles')
                    .update({ cpf_cnpj: cleanedCpfCnpj })
                    .eq('id', user?.id);

                if (error) throw error;
                await fetchReferralInfo();
            } catch (error) {
                success = false;
                console.error(error);
                toast.error('Erro ao atualizar CPF/CNPJ.');
            }
        } else if (cleanedCpfCnpj) {
            success = false;
            setCpfCnpjError('CPF/CNPJ inválido. Deve conter 11 ou 14 dígitos.');
            toast.error('CPF/CNPJ inválido.');
        }

        if (success) {
            toast.success('Informações salvas com sucesso!');
        }
        setSaving(false);
    };

    return (
        <div className="flex-1 w-full relative">
            <div className="mb-8">
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">Configurações da Conta</h1>
                <p className="text-slate-500 mt-1">Gerencie suas informações pessoais, segurança e preferências do sistema.</p>
            </div>

            <div className="flex flex-col lg:flex-row gap-8">
                {/* Sidebar Navigation */}
                <aside className="w-full lg:w-64 flex-shrink-0">
                    <nav className="space-y-1 bg-white rounded-xl border border-slate-200 overflow-hidden">
                        <button className="w-full flex items-center gap-3 px-4 py-4 text-sm font-semibold bg-custom/10 text-custom border-r-4 border-custom transition-all">
                            <User className="w-5 h-5" />
                            Informações Pessoais
                        </button>
                        <button className="w-full flex items-center gap-3 px-4 py-4 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all border-r-4 border-transparent">
                            <Shield className="w-5 h-5" />
                            Segurança
                        </button>
                        {plano && ['pro', 'pró', 'premium'].includes(plano.toLowerCase()) && (
                            <button
                                onClick={() => navigate('/payment')}
                                className="w-full flex items-center gap-3 px-4 py-4 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all border-r-4 border-transparent"
                            >
                                <Star className="w-5 h-5" />
                                Plano {plano}
                            </button>
                        )}
                    </nav>

                    <div className="mt-6 p-5 bg-custom/5 rounded-xl border border-custom/20">
                        <div className="flex items-center gap-2 text-custom mb-2">
                            <CheckCircle className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-wider">Status {plano || 'Base'}</span>
                        </div>
                        <p className="text-sm text-slate-700 font-medium">Assinatura gerenciada em Planos.</p>
                        <button
                            onClick={() => navigate('/payment')}
                            className="mt-3 text-xs font-bold text-custom hover:underline uppercase tracking-tight"
                        >
                            Gerenciar Assinatura
                        </button>
                    </div>
                </aside>

                {/* Main Content Area */}
                <div className="flex-1 space-y-8">

                    {/* Personal Info Section */}
                    <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
                            <div>
                                <h2 className="text-lg font-bold text-slate-900">Informações Pessoais</h2>
                                <p className="text-sm text-slate-500">Esses dados serão usados para sua identificação e emissões.</p>
                            </div>
                            <BadgeCheck className="w-8 h-8 text-slate-300" />
                        </div>

                        <div className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Nome Completo</label>
                                    <input
                                        className="w-full rounded-lg border-slate-300 focus:border-custom focus:ring-custom/20 transition-all px-4 py-3 text-slate-900"
                                        placeholder="Seu nome completo"
                                        type="text"
                                        value={currentName}
                                        onChange={(e) => setCurrentName(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Documento (CPF/CNPJ)</label>
                                    <input
                                        className={`w-full rounded-lg ${cpfCnpjError ? 'border-red-500 focus:border-red-500 focus:ring-red-200' : 'border-slate-300 focus:border-custom focus:ring-custom/20'} transition-all px-4 py-3 text-slate-900`}
                                        placeholder="000.000.000-00"
                                        type="text"
                                        value={formatCpfCnpj(currentCpfCnpj)}
                                        onChange={(e) => setCurrentCpfCnpj(e.target.value)}
                                    />
                                    {cpfCnpjError && <p className="mt-1 text-xs text-red-500">{cpfCnpjError}</p>}
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-400 mb-2">E-mail (Não editável)</label>
                                    <div className="flex items-center gap-2 bg-slate-50 rounded-lg border border-slate-200 px-4 py-3 text-slate-500 cursor-not-allowed">
                                        <Lock className="w-4 h-4" />
                                        {user?.email}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Security Section */}
                    <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="bg-custom/10 p-2 rounded-lg">
                                    <Lock className="w-5 h-5 text-custom" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-slate-900">Segurança da Conta</h2>
                                    <p className="text-sm text-slate-500">Mantenha sua senha atualizada e proteja seu acesso.</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-6">
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-lg bg-slate-50 border border-slate-200">
                                <div className="flex items-start gap-4">
                                    <Key className="w-5 h-5 text-slate-400 mt-1" />
                                    <div>
                                        <p className="font-semibold text-slate-900">Senha de Acesso</p>
                                        <p className="text-sm text-slate-500">Altere a senha que você usa para entrar na plataforma.</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => navigate('/change-password')}
                                    className="w-full sm:w-auto px-6 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
                                >
                                    Alterar Senha
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* Action Bar */}
                    <div className="flex items-center justify-end gap-4 pt-4 border-t border-slate-200 pb-10">
                        <button
                            onClick={() => {
                                setCurrentName(user?.user_metadata?.name || '');
                                setCurrentCpfCnpj(user?.user_metadata?.cpf_cnpj || '');
                                setCpfCnpjError(null);
                            }}
                            disabled={saving}
                            className="px-6 py-3 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors disabled:opacity-50"
                        >
                            Descartar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-8 py-3 bg-custom text-white rounded-xl text-sm font-bold shadow-lg shadow-custom/20 hover:brightness-105 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Save className="w-5 h-5" />
                            {saving ? 'Registrando...' : 'Salvar Alterações'}
                        </button>
                    </div>

                </div>
            </div>
            <Toaster position="top-right" />
        </div>
    );
}
