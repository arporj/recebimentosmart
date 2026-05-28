import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Save, User, Lock, Key, Shield, Star, CheckCircle, BadgeCheck, Eye, EyeOff, X, Layout, Mail, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

export default function UserProfileSettingsV2() {
    const { user, plano, updateUserName, fetchReferralInfo } = useAuth();

    const [currentName, setCurrentName] = useState('');

    // Tab and layout preferences
    const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'preferences'>('profile');
    const [layoutPreference, setLayoutPreference] = useState<'default' | 'value_first' | 'value_right_desc'>('default');
    const [showCurrencySymbol, setShowCurrencySymbol] = useState(true);
    const [showNegativeSign, setShowNegativeSign] = useState(true);
    const [valueAlignment, setValueAlignment] = useState<'left' | 'right'>('right');

    // Email alert preferences
    const [dueEmailNotifyEnabled, setDueEmailNotifyEnabled] = useState(false);
    const [dueEmailNotifyDayOfWeek, setDueEmailNotifyDayOfWeek] = useState(1);
    const [canDueEmailNotify, setCanDueEmailNotify] = useState(false);
    const [loadingPreferences, setLoadingPreferences] = useState(true);

    const formatMockValue = (amount: number, isNegative: boolean) => {
        let result = '';
        if (isNegative && showNegativeSign) {
            result += '-';
        }
        if (showCurrencySymbol) {
            result += 'R$ ';
        }
        result += amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return result;
    };

    // Loading status form
    const [saving, setSaving] = useState(false);
    const navigate = useNavigate();

    // Password modal states
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isChangingPassword, setIsChangingPassword] = useState(false);

    const fetchProfilePreferences = async () => {
        if (!user) return;
        try {
            setLoadingPreferences(true);
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('due_email_notify_enabled, due_email_notify_day_of_week, plano')
                .eq('id', user.id)
                .single();
            
            if (profileError) throw profileError;

            if (profile) {
                setDueEmailNotifyEnabled(profile.due_email_notify_enabled || false);
                setDueEmailNotifyDayOfWeek(profile.due_email_notify_day_of_week ?? 1);

                const planSlug = profile.plano?.toLowerCase() || 'free';
                const { data: plan, error: planError } = await supabase
                    .from('plans')
                    .select('can_due_email_notify')
                    .eq('slug', planSlug)
                    .single();

                if (planError) throw planError;
                setCanDueEmailNotify(plan?.can_due_email_notify || false);
            }
        } catch (error) {
            console.error('Erro ao buscar preferências de e-mail:', error);
        } finally {
            setLoadingPreferences(false);
        }
    };

    useEffect(() => {
        if (user) {
            setCurrentName(user.user_metadata?.name || '');
            fetchProfilePreferences();
        }
        
        // Recuperar preferencia de layout e opcoes customizadas
        const savedPref = localStorage.getItem('transaction_layout_preference') as 'default' | 'value_first' | 'value_right_desc';
        if (savedPref) {
            setLayoutPreference(savedPref);
        }
        const savedShowCurrency = localStorage.getItem('transaction_show_currency_symbol');
        const savedShowNegative = localStorage.getItem('transaction_show_negative_sign');
        const savedValAlign = localStorage.getItem('transaction_value_alignment') as 'left' | 'right';
        setShowCurrencySymbol(savedShowCurrency !== 'false');
        setShowNegativeSign(savedShowNegative !== 'false');
        setValueAlignment(savedValAlign || 'right');
    }, [user]);



    const handleSave = async () => {
        setSaving(true);
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



        // Layout Preference and Custom Options
        if (success) {
            localStorage.setItem('transaction_layout_preference', layoutPreference);
            localStorage.setItem('transaction_show_currency_symbol', String(showCurrencySymbol));
            localStorage.setItem('transaction_show_negative_sign', String(showNegativeSign));
            localStorage.setItem('transaction_value_alignment', valueAlignment);
        }

        // Email Alert Preferences Update in Supabase
        if (success && user) {
            try {
                const { error: profileUpdateError } = await supabase
                    .from('profiles')
                    .update({
                        due_email_notify_enabled: dueEmailNotifyEnabled,
                        due_email_notify_day_of_week: dueEmailNotifyDayOfWeek
                    })
                    .eq('id', user.id);

                if (profileUpdateError) throw profileUpdateError;
            } catch (error) {
                success = false;
                console.error('Erro ao salvar preferências de e-mail:', error);
                toast.error('Erro ao salvar preferências de e-mail.');
            }
        }

        if (success) {
            toast.success('Informações salvas com sucesso!');
        }
        setSaving(false);
    };

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!newPassword || !confirmPassword) {
            toast.error('Por favor, preencha todos os campos.');
            return;
        }

        if (newPassword !== confirmPassword) {
            toast.error('As senhas não coincidem.');
            return;
        }

        if (newPassword.length < 6) {
            toast.error('A senha deve ter pelo menos 6 caracteres.');
            return;
        }

        setIsChangingPassword(true);

        try {
            const { error } = await supabase.auth.updateUser({
                password: newPassword
            });

            if (error) {
                throw error;
            }

            toast.success('Senha alterada com sucesso!');
            setNewPassword('');
            setConfirmPassword('');
            setIsPasswordModalOpen(false);
        } catch (error: any) {
            console.error('Erro ao alterar senha:', error);
            toast.error('Erro ao alterar senha. Tente novamente.');
        } finally {
            setIsChangingPassword(false);
        }
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
                        <button 
                            onClick={() => setActiveTab('profile')}
                            className={`w-full flex items-center gap-3 px-4 py-4 text-sm font-semibold border-r-4 transition-all ${
                                activeTab === 'profile'
                                    ? 'bg-custom/10 text-custom border-custom'
                                    : 'text-slate-600 hover:bg-slate-50 border-transparent'
                            }`}
                        >
                            <User className="w-5 h-5" />
                            Informações Pessoais
                        </button>
                        <button 
                            onClick={() => setActiveTab('security')}
                            className={`w-full flex items-center gap-3 px-4 py-4 text-sm font-medium border-r-4 transition-all ${
                                activeTab === 'security'
                                    ? 'bg-custom/10 text-custom border-custom'
                                    : 'text-slate-600 hover:bg-slate-50 border-transparent'
                            }`}
                        >
                            <Shield className="w-5 h-5" />
                            Segurança
                        </button>
                        <button 
                            onClick={() => setActiveTab('preferences')}
                            className={`w-full flex items-center gap-3 px-4 py-4 text-sm font-medium border-r-4 transition-all ${
                                activeTab === 'preferences'
                                    ? 'bg-custom/10 text-custom border-custom'
                                    : 'text-slate-600 hover:bg-slate-50 border-transparent'
                            }`}
                        >
                            <Layout className="w-5 h-5" />
                            Preferências de Layout
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
                    {activeTab === 'profile' && (
                        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-300">
                            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
                                <div>
                                    <h2 className="text-lg font-bold text-slate-900">Informações Pessoais</h2>
                                    <p className="text-sm text-slate-500">Esses dados serão usados para sua identificação e emissões.</p>
                                </div>
                                <BadgeCheck className="w-8 h-8 text-slate-300" />
                            </div>

                            <div className="p-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
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
                                        <label className="block text-sm font-semibold text-slate-400 mb-2">E-mail (Não editável)</label>
                                        <div className="flex items-center gap-2 bg-slate-50 rounded-lg border border-slate-200 px-4 py-3 text-slate-500 cursor-not-allowed">
                                            <Lock className="w-4 h-4" />
                                            {user?.email}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>
                    )}

                    {/* Security Section */}
                    {activeTab === 'security' && (
                        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-300">
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
                                        onClick={() => setIsPasswordModalOpen(true)}
                                        className="w-full sm:w-auto px-6 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
                                    >
                                        Alterar Senha
                                    </button>
                                </div>
                            </div>
                        </section>
                    )}

                    {/* Preferences Section */}
                    {activeTab === 'preferences' && (
                        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-300">
                            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <div className="bg-custom/10 p-2 rounded-lg">
                                        <Layout className="w-5 h-5 text-custom" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold text-slate-900">Preferências de Layout</h2>
                                        <p className="text-sm text-slate-500">Selecione a disposição preferida para a tabela de transações do seu extrato.</p>
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 space-y-6">
                                {/* Painel de Opções Adicionais de Exibição */}
                                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200/60 grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
                                    {/* Opção R$ */}
                                    <div className="space-y-2">
                                        <label className="block text-xs font-black uppercase tracking-wider text-slate-500">Exibir Símbolo (R$)</label>
                                        <div className="flex bg-slate-200/70 p-1 rounded-xl gap-1">
                                            <button
                                                type="button"
                                                onClick={() => setShowCurrencySymbol(true)}
                                                className={`flex-1 py-2 text-xs font-extrabold rounded-lg transition-all ${showCurrencySymbol ? 'bg-white text-custom shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                                            >
                                                Sim
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setShowCurrencySymbol(false)}
                                                className={`flex-1 py-2 text-xs font-extrabold rounded-lg transition-all ${!showCurrencySymbol ? 'bg-white text-custom shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                                            >
                                                Não
                                            </button>
                                        </div>
                                    </div>

                                    {/* Opção Sinal Negativo */}
                                    <div className="space-y-2">
                                        <label className="block text-xs font-black uppercase tracking-wider text-slate-500">Sinal de Negativo (-)</label>
                                        <div className="flex bg-slate-200/70 p-1 rounded-xl gap-1">
                                            <button
                                                type="button"
                                                onClick={() => setShowNegativeSign(true)}
                                                className={`flex-1 py-2 text-xs font-extrabold rounded-lg transition-all ${showNegativeSign ? 'bg-white text-custom shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                                            >
                                                Sim
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setShowNegativeSign(false)}
                                                className={`flex-1 py-2 text-xs font-extrabold rounded-lg transition-all ${!showNegativeSign ? 'bg-white text-custom shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                                            >
                                                Não
                                            </button>
                                        </div>
                                    </div>

                                    {/* Opção Alinhamento do Valor */}
                                    <div className="space-y-2">
                                        <label className="block text-xs font-black uppercase tracking-wider text-slate-500">Alinhamento do Valor</label>
                                        <div className="flex bg-slate-200/70 p-1 rounded-xl gap-1">
                                            <button
                                                type="button"
                                                onClick={() => setValueAlignment('left')}
                                                className={`flex-1 py-2 text-xs font-extrabold rounded-lg transition-all ${valueAlignment === 'left' ? 'bg-white text-custom shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                                            >
                                                Esquerda
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setValueAlignment('right')}
                                                className={`flex-1 py-2 text-xs font-extrabold rounded-lg transition-all ${valueAlignment === 'right' ? 'bg-white text-custom shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                                            >
                                                Direita
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    {/* CARD 1: Padrão */}
                                    <div 
                                        onClick={() => setLayoutPreference('default')}
                                        className={`group relative rounded-2xl border p-4 cursor-pointer transition-all hover:shadow-md ${
                                            layoutPreference === 'default'
                                                ? 'border-custom bg-custom/5 ring-1 ring-custom'
                                                : 'border-slate-200 bg-white hover:border-slate-300'
                                        }`}
                                    >
                                        <div className="flex justify-between items-center mb-3">
                                            <h4 className="font-extrabold text-xs text-slate-800">1. Layout Padrão</h4>
                                            {layoutPreference === 'default' && (
                                                <span className="w-4 h-4 rounded-full bg-custom flex items-center justify-center text-white text-[9px] font-black">✓</span>
                                            )}
                                        </div>
                                        <p className="text-[10px] text-slate-400 font-medium mb-4 leading-relaxed">
                                            Descrição e indicadores à esquerda, valor financeiro à direita. Formato padrão do sistema.
                                        </p>
                                        
                                        {/* Mockup visual premium */}
                                        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/50 space-y-2 select-none pointer-events-none">
                                            <div className="flex items-center justify-between bg-white px-2 py-1.5 rounded-lg border border-slate-100 shadow-sm gap-2">
                                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                                    <span className="font-extrabold text-[10px] text-slate-700 truncate">Faxineira</span>
                                                    <div className="flex gap-0.5 shrink-0">
                                                        <span className="w-3.5 h-3.5 rounded bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-[8px]">🔄</span>
                                                        <span className="w-3.5 h-3.5 rounded bg-slate-100 flex items-center justify-center text-amber-500 font-bold text-[8px]">⚡</span>
                                                    </div>
                                                </div>
                                                <span className={`font-extrabold text-[10px] text-emerald-600 shrink-0 w-[80px] ${valueAlignment === 'left' ? 'text-left' : 'text-right'}`}>
                                                    {formatMockValue(150, false)}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between bg-white px-2 py-1.5 rounded-lg border border-slate-100 shadow-sm gap-2">
                                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                                                    <span className="font-extrabold text-[10px] text-slate-700 truncate">Supermercado</span>
                                                </div>
                                                <span className={`font-extrabold text-[10px] text-rose-600 shrink-0 w-[80px] ${valueAlignment === 'left' ? 'text-left' : 'text-right'}`}>
                                                    {formatMockValue(320.40, true)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* CARD 2: Valor Primeiro */}
                                    <div 
                                        onClick={() => setLayoutPreference('value_first')}
                                        className={`group relative rounded-2xl border p-4 cursor-pointer transition-all hover:shadow-md ${
                                            layoutPreference === 'value_first'
                                                ? 'border-custom bg-custom/5 ring-1 ring-custom'
                                                : 'border-slate-200 bg-white hover:border-slate-300'
                                        }`}
                                    >
                                        <div className="flex justify-between items-center mb-3">
                                            <h4 className="font-extrabold text-xs text-slate-800">2. Valor em Destaque</h4>
                                            {layoutPreference === 'value_first' && (
                                                <span className="w-4 h-4 rounded-full bg-custom flex items-center justify-center text-white text-[9px] font-black">✓</span>
                                            )}
                                        </div>
                                        <p className="text-[10px] text-slate-400 font-medium mb-4 leading-relaxed">
                                            Coluna de valor na frente, seguida pela descrição do lançamento com badges à direita.
                                        </p>
                                        
                                        {/* Mockup visual premium */}
                                        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/50 space-y-2 select-none pointer-events-none">
                                            <div className="flex items-center justify-start gap-2 bg-white px-2 py-1.5 rounded-lg border border-slate-100 shadow-sm">
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                                <span className={`font-black text-[10px] text-emerald-600 shrink-0 w-[80px] ${valueAlignment === 'left' ? 'text-left' : 'text-right'}`}>
                                                    {formatMockValue(150, false)}
                                                </span>
                                                <span className="font-extrabold text-[10px] text-slate-700 truncate">Faxineira</span>
                                                <div className="flex gap-0.5 shrink-0 ml-auto">
                                                    <span className="w-3.5 h-3.5 rounded bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-[8px]">🔄</span>
                                                    <span className="w-3.5 h-3.5 rounded bg-slate-100 flex items-center justify-center text-amber-500 font-bold text-[8px]">⚡</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-start gap-2 bg-white px-2 py-1.5 rounded-lg border border-slate-100 shadow-sm">
                                                <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                                                <span className={`font-black text-[10px] text-rose-600 shrink-0 w-[80px] ${valueAlignment === 'left' ? 'text-left' : 'text-right'}`}>
                                                    {formatMockValue(320.40, true)}
                                                </span>
                                                <span className="font-extrabold text-[10px] text-slate-700 truncate">Supermercado</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* CARD 3: Valor Esquerda, Descrição Direita */}
                                    <div 
                                        onClick={() => setLayoutPreference('value_right_desc')}
                                        className={`group relative rounded-2xl border p-4 cursor-pointer transition-all hover:shadow-md ${
                                            layoutPreference === 'value_right_desc'
                                                ? 'border-custom bg-custom/5 ring-1 ring-custom'
                                                : 'border-slate-200 bg-white hover:border-slate-300'
                                        }`}
                                    >
                                        <div className="flex justify-between items-center mb-3">
                                            <h4 className="font-extrabold text-xs text-slate-800">3. Valor & Descrição Invertidos</h4>
                                            {layoutPreference === 'value_right_desc' && (
                                                <span className="w-4 h-4 rounded-full bg-custom flex items-center justify-center text-white text-[9px] font-black">✓</span>
                                            )}
                                        </div>
                                        <p className="text-[10px] text-slate-400 font-medium mb-4 leading-relaxed">
                                            Valor à esquerda e descrição à direita. Badges de recorrência e auto confirmar antes do nome.
                                        </p>
                                        
                                        {/* Mockup visual premium */}
                                        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/50 space-y-2 select-none pointer-events-none">
                                            <div className="flex items-center justify-between bg-white px-2 py-1.5 rounded-lg border border-slate-100 shadow-sm gap-2">
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                                    <span className={`font-black text-[10px] text-emerald-600 shrink-0 w-[80px] ${valueAlignment === 'left' ? 'text-left' : 'text-right'}`}>
                                                        {formatMockValue(150, false)}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1 min-w-0 flex-1 justify-end">
                                                    <div className="flex gap-0.5 shrink-0">
                                                        <span className="w-3.5 h-3.5 rounded bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-[8px]">🔄</span>
                                                        <span className="w-3.5 h-3.5 rounded bg-slate-100 flex items-center justify-center text-amber-500 font-bold text-[8px]">⚡</span>
                                                    </div>
                                                    <span className="font-extrabold text-[10px] text-slate-700 truncate">Faxineira</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between bg-white px-2 py-1.5 rounded-lg border border-slate-100 shadow-sm gap-2">
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                                                    <span className={`font-black text-[10px] text-rose-600 shrink-0 w-[80px] ${valueAlignment === 'left' ? 'text-left' : 'text-right'}`}>
                                                        {formatMockValue(320.40, true)}
                                                    </span>
                                                </div>
                                                <span className="font-extrabold text-[10px] text-slate-700 truncate text-right flex-1 min-w-0">Supermercado</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Seção Premium: Notificações de Contas por E-mail */}
                                <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-4 mt-6">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-custom/10 rounded-lg text-custom">
                                            <Mail className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="font-extrabold text-sm text-slate-900">Alerta de Contas a Vencer</h3>
                                            <p className="text-[11px] text-slate-500 font-medium">Receba semanalmente um consolidado de contas vencidas e a vencer no seu e-mail.</p>
                                        </div>
                                    </div>

                                    {loadingPreferences ? (
                                        <div className="text-xs font-semibold text-slate-400 py-2">Carregando configurações...</div>
                                    ) : !canDueEmailNotify ? (
                                        <div className="p-4 bg-amber-50/50 border border-amber-100 rounded-xl flex items-start gap-3">
                                            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                                            <div>
                                                <p className="text-xs font-bold text-slate-900">Funcionalidade de Plano Pago</p>
                                                <p className="text-[10px] text-slate-500 font-medium mt-1 leading-relaxed">
                                                    Seu plano atual não dá direito a alertas de contas por e-mail. Faça upgrade para o plano Básico, Pró ou Premium para automatizar seu fluxo financeiro!
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-4 pt-2">
                                            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                                                <div>
                                                    <p className="text-xs font-bold text-slate-900">Habilitar Alertas por E-mail</p>
                                                    <p className="text-[10px] text-slate-500 font-medium">Ativar ou desativar o envio automático</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    role="switch"
                                                    aria-checked={dueEmailNotifyEnabled}
                                                    onClick={() => setDueEmailNotifyEnabled(!dueEmailNotifyEnabled)}
                                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${dueEmailNotifyEnabled ? 'bg-custom' : 'bg-slate-200'}`}
                                                >
                                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${dueEmailNotifyEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                                </button>
                                            </div>

                                            {dueEmailNotifyEnabled && (
                                                <div className="space-y-2 animate-in fade-in duration-200">
                                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Dia de Envio Semanal</label>
                                                    <select
                                                        value={dueEmailNotifyDayOfWeek}
                                                        onChange={(e) => setDueEmailNotifyDayOfWeek(parseInt(e.target.value))}
                                                        className="block w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:ring-2 focus:ring-custom/20 focus:border-custom outline-none transition-all"
                                                    >
                                                        <option value={1}>Segunda-feira</option>
                                                        <option value={2}>Terça-feira</option>
                                                        <option value={3}>Quarta-feira</option>
                                                        <option value={4}>Quinta-feira</option>
                                                        <option value={5}>Sexta-feira</option>
                                                        <option value={6}>Sábado</option>
                                                        <option value={0}>Domingo</option>
                                                    </select>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>
                    )}

                    {/* Action Bar */}
                    {(activeTab === 'profile' || activeTab === 'preferences') && (
                        <div className="flex items-center justify-end gap-4 pt-4 border-t border-slate-200 pb-10">
                            <button
                                onClick={() => {
                                    if (activeTab === 'profile') {
                                        setCurrentName(user?.user_metadata?.name || '');
                                    } else {
                                        const savedPref = localStorage.getItem('transaction_layout_preference') as 'default' | 'value_first' | 'value_right_desc';
                                        setLayoutPreference(savedPref || 'default');
                                        const savedShowCurrency = localStorage.getItem('transaction_show_currency_symbol');
                                        const savedShowNegative = localStorage.getItem('transaction_show_negative_sign');
                                        const savedValAlign = localStorage.getItem('transaction_value_alignment') as 'left' | 'right';
                                        setShowCurrencySymbol(savedShowCurrency !== 'false');
                                        setShowNegativeSign(savedShowNegative !== 'false');
                                        setValueAlignment(savedValAlign || 'right');
                                    }
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
                    )}

                </div>
            </div>
            {/* Modal de Alterar Senha */}
            {isPasswordModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between p-6 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="bg-custom/10 p-2 rounded-lg">
                                    <Lock className="w-5 h-5 text-custom" />
                                </div>
                                <h3 className="font-bold text-lg text-slate-900">Alterar Senha</h3>
                            </div>
                            <button
                                onClick={() => setIsPasswordModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handlePasswordChange} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Nova Senha</label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="w-full rounded-lg border-slate-300 focus:border-custom focus:ring-custom/20 transition-all px-4 py-3 text-slate-900"
                                        placeholder="Digite sua nova senha"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute inset-y-0 right-0 pr-3 flex items-center"
                                    >
                                        {showPassword ? <EyeOff className="h-5 w-5 text-slate-400" /> : <Eye className="h-5 w-5 text-slate-400" />}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Confirme a Nova Senha</label>
                                <div className="relative">
                                    <input
                                        type={showConfirmPassword ? 'text' : 'password'}
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="w-full rounded-lg border-slate-300 focus:border-custom focus:ring-custom/20 transition-all px-4 py-3 text-slate-900"
                                        placeholder="Confirme sua nova senha"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                        className="absolute inset-y-0 right-0 pr-3 flex items-center"
                                    >
                                        {showConfirmPassword ? <EyeOff className="h-5 w-5 text-slate-400" /> : <Eye className="h-5 w-5 text-slate-400" />}
                                    </button>
                                </div>
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsPasswordModalOpen(false)}
                                    className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg font-bold transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isChangingPassword}
                                    className="flex-1 px-4 py-2 bg-custom text-white hover:bg-custom-hover hover:brightness-105 rounded-lg font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isChangingPassword ? 'Salvando...' : 'Salvar Senha'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
