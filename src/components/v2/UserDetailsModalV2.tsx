import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { X, Calendar, Shield, Eye, CheckCircle, DollarSign, AlertTriangle, User, CreditCard } from 'lucide-react';
import { UserProfile } from '../admin/UserTable';
import { useAuth } from '../../contexts/AuthContext';
import { CurrencyInput } from '../ui/CurrencyInput';

interface Plan {
    name: string;
    price_monthly: number;
}

const normalizeString = (str: string) => {
    return str ? str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
};

interface UserDetailsModalV2Props {
    user: UserProfile;
    onClose: () => void;
    onUserUpdate: (user: UserProfile) => void;
    onUserDeleted?: () => void;
}

export default function UserDetailsModalV2({ user, onClose, onUserUpdate, onUserDeleted }: UserDetailsModalV2Props) {
    const { impersonateUser } = useAuth();
    const [activeTab, setActiveTab] = useState<'overview' | 'subscription' | 'danger'>('overview');

    // State for Overview
    const [isAdmin, setIsAdmin] = useState(user.is_admin);

    // State for Subscription
    const [selectedPlan, setSelectedPlan] = useState<string>(user.plan_name || '');
    const [validUntil, setValidUntil] = useState(user.subscription_end_date ? new Date(user.subscription_end_date).toISOString().split('T')[0] : '');
    const [plans, setPlans] = useState<Plan[]>([]);
    const [showPaymentForm, setShowPaymentForm] = useState(false);
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [paymentAmount, setPaymentAmount] = useState<number>(0);
    const [userCredits, setUserCredits] = useState<number>(0);
    const [useCredits, setUseCredits] = useState(true);

    // Global loading state
    const [updating, setUpdating] = useState(false);

    useEffect(() => {
        const fetchPlans = async () => {
            try {
                const { data, error } = await supabase.rpc('get_all_plans_with_prices');
                if (error) throw error;
                setPlans(data);
            } catch (error) {
                console.error('Erro ao buscar planos:', error);
                toast.error('Falha ao carregar os planos.');
            }
        };
        fetchPlans();
    }, []);

    useEffect(() => {
        const fetchCredits = async () => {
            if (!showPaymentForm) return;
            try {
                const { data, error } = await supabase.rpc('get_full_referral_stats', { p_user_id: user.id });
                if (error) throw error;
                if (data && data.length > 0) {
                    setUserCredits(data[0].available_credits || 0);
                }
            } catch (error) {
                console.error('Erro ao buscar créditos:', error);
            }
        };
        fetchCredits();
    }, [user.id, showPaymentForm]);

    useEffect(() => {
        if (selectedPlan && plans.length > 0) {
            const normalizedSelected = normalizeString(selectedPlan);
            const plan = plans.find(p => normalizeString(p.name) === normalizedSelected);

            if (plan) {
                const price = Number(plan.price_monthly) || 0;
                const creditsToUse = useCredits ? Math.min(userCredits || 0, 5) : 0;
                const discount = creditsToUse * (price * 0.20);
                setPaymentAmount(Math.max(0, price - discount));
            } else {
                setPaymentAmount(0);
            }
        }
    }, [selectedPlan, plans, userCredits, useCredits]);

    const handleRegisterPayment = async () => {
        try {
            setUpdating(true);

            const normalizedSelected = normalizeString(selectedPlan);
            const plan = plans.find(p => normalizeString(p.name) === normalizedSelected);
            const planPrice = plan ? plan.price_monthly : 0;
            const creditsToUse = (useCredits && planPrice > 0) ? Math.min(userCredits || 0, 5) : 0;

            const { data, error } = await supabase.rpc('register_manual_payment', {
                p_user_id: user.id,
                p_payment_date: paymentDate,
                p_amount: paymentAmount,
                p_plan_name: plan ? plan.name : selectedPlan,
                p_credits_used: creditsToUse
            });

            if (error) throw error;

            if (data.success) {
                toast.success('Pagamento registrado e validade atualizada!');
                const updatedUser = {
                    ...user,
                    subscription_end_date: data.new_valid_until,
                    plan_name: selectedPlan,
                    subscription_status: new Date(data.new_valid_until) > new Date() ? 'active' : 'expired'
                };
                onUserUpdate(updatedUser);
                setShowPaymentForm(false);
            } else {
                toast.error('Erro ao registrar pagamento: ' + data.error);
            }
        } catch (error: any) {
            console.error('Erro ao registrar pagamento:', error);
            toast.error('Erro ao registrar pagamento: ' + (error.message || 'Erro desconhecido'));
        } finally {
            setUpdating(false);
        }
    };

    const handleImpersonate = async () => {
        try {
            setUpdating(true);
            await impersonateUser(user.id);
            onClose();
        } catch (error) {
            console.error('Erro ao impersonar usuário:', error instanceof Error ? error.message : error);
            toast.error('Erro ao acessar como este usuário');
        } finally {
            setUpdating(false);
        }
    };

    const handleDeleteUser = async () => {
        if (!window.confirm('TEM CERTEZA? Essa ação apagará permanentemente o usuário e todos os dados relacionados (pagamentos, clientes, etc). Não pode ser desfeito.')) {
            return;
        }

        setUpdating(true);
        try {
            const { error } = await supabase.rpc('admin_delete_user', { p_user_id: user.id });
            if (error) throw error;

            toast.success('Usuário excluído com sucesso.');

            if (onUserDeleted) {
                onUserDeleted();
            } else {
                onClose();
            }
        } catch (error: any) {
            console.error('Erro ao excluir usuário:', error);
            toast.error('Erro ao excluir usuário: ' + (error.message || 'Erro desconhecido'));
        } finally {
            setUpdating(false);
        }
    };

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setUpdating(true);

        try {
            // 1. Update Plan if changed
            if (selectedPlan !== user.plan_name) {
                const normalizedSelected = normalizeString(selectedPlan);
                const planMap: Record<string, string> = {
                    'basico': 'basico', 'basic': 'basico',
                    'pro': 'pro', 'pró': 'pro',
                    'premium': 'premium', 'trial': 'trial'
                };
                const dbPlanName = planMap[normalizedSelected] || normalizedSelected;

                const { error: planError } = await supabase.rpc('admin_set_user_plan', {
                    user_id_to_update: user.id,
                    new_plan_name: dbPlanName
                });
                if (planError) throw planError;
            }

            // 2. Update Validity manually
            if (validUntil) {
                const [year, month, day] = validUntil.split('-').map(Number);
                const date = new Date(year, month - 1, day);
                date.setHours(23, 59, 59, 999);

                const { error: validityError } = await supabase.rpc('admin_update_user_validity', {
                    p_user_id: user.id,
                    new_valid_until: date.toISOString()
                });
                if (validityError) throw validityError;
            }

            // 3. Update Admin Status
            if (isAdmin !== user.is_admin) {
                const { error: adminStatusError } = await supabase.rpc('admin_update_user_admin_status', {
                    p_user_id: user.id,
                    p_is_admin: isAdmin
                });
                if (adminStatusError) throw adminStatusError;
            }

            onUserUpdate({
                ...user,
                plan_name: selectedPlan,
                is_admin: isAdmin,
                subscription_end_date: validUntil ? new Date(validUntil).toISOString() : user.subscription_end_date
            });
            toast.success('Dados atualizados!');
            onClose();

        } catch (error) {
            console.error('Erro ao atualizar usuário:', error);
            const message = error instanceof Error ? error.message : 'Falha ao atualizar o usuário.';
            toast.error(message);
        } finally {
            setUpdating(false);
        }
    };

    const getInitials = (name: string | null, email: string) => {
        if (name) {
            const parts = name.split(' ');
            if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
            return name.substring(0, 2).toUpperCase();
        }
        return email.substring(0, 2).toUpperCase();
    };

    const tabs = [
        { id: 'overview' as const, label: 'Visão Geral', icon: User },
        { id: 'subscription' as const, label: 'Assinatura', icon: CreditCard },
        { id: 'danger' as const, label: 'Zona de Perigo', icon: AlertTriangle },
    ];

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-4 zoom-in-95 duration-300"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-custom/10 border border-custom/20 flex items-center justify-center font-bold text-custom text-lg">
                                {getInitials(user.name, user.email)}
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-slate-900">{user.name || 'Usuário Sem Nome'}</h2>
                                <p className="text-sm text-slate-500 font-medium">{user.email}</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-100">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold transition-all ${activeTab === tab.id
                                    ? tab.id === 'danger'
                                        ? 'text-red-600 border-b-2 border-red-500 bg-red-50/50'
                                        : 'text-custom border-b-2 border-custom bg-custom/5'
                                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                                }`}
                        >
                            <tab.icon className="w-4 h-4" />
                            <span className="hidden sm:inline">{tab.label}</span>
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto">
                    {activeTab === 'overview' && (
                        <div className="space-y-5">
                            {/* Info Grid */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                                    <div className="flex items-center gap-2 text-slate-400 mb-1">
                                        <CheckCircle className="h-4 w-4" />
                                        <span className="text-xs font-bold uppercase tracking-wider">Cadastro</span>
                                    </div>
                                    <p className="text-sm font-bold text-slate-900">{new Date(user.created_at).toLocaleDateString('pt-BR')}</p>
                                </div>
                                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                                    <div className="flex items-center gap-2 text-slate-400 mb-1">
                                        <Calendar className="h-4 w-4" />
                                        <span className="text-xs font-bold uppercase tracking-wider">Último Login</span>
                                    </div>
                                    <p className="text-sm font-bold text-slate-900">
                                        {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString('pt-BR') : '-'}
                                    </p>
                                </div>
                            </div>

                            {/* Admin Toggle */}
                            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-custom/10 rounded-lg">
                                        <Shield className="h-5 w-5 text-custom" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-900">Acesso Administrativo</p>
                                        <p className="text-xs text-slate-500">Permite gerenciar todo o sistema</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={isAdmin}
                                    onClick={() => setIsAdmin(!isAdmin)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${isAdmin ? 'bg-custom' : 'bg-slate-200'
                                        }`}
                                >
                                    <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${isAdmin ? 'translate-x-6' : 'translate-x-1'
                                            }`}
                                    />
                                </button>
                            </div>

                            {/* Impersonate Button */}
                            <button
                                type="button"
                                onClick={handleImpersonate}
                                disabled={updating}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold rounded-xl text-blue-600 bg-blue-50 border border-blue-100 hover:bg-blue-100 transition-colors disabled:opacity-50"
                            >
                                <Eye className="h-4 w-4" />
                                Acessar Painel como Usuário
                            </button>
                        </div>
                    )}

                    {activeTab === 'subscription' && (
                        <form onSubmit={handleUpdateProfile} className="space-y-5">
                            {/* Plan Select */}
                            <div>
                                <label htmlFor="plan-v2" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                                    Alterar Plano Atual
                                </label>
                                <select
                                    id="plan-v2"
                                    value={selectedPlan}
                                    onChange={(e) => setSelectedPlan(e.target.value)}
                                    className="block w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:ring-2 focus:ring-custom/20 focus:border-custom outline-none transition-all"
                                >
                                    {plans.filter(p => p.name !== 'Premium').map((p, index) => (
                                        <option key={`${p.name}-${index}`} value={p.name}>{p.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Validity Date */}
                            <div>
                                <label htmlFor="validity-v2" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                                    Validade da Assinatura
                                </label>
                                <input
                                    id="validity-v2"
                                    type="date"
                                    value={validUntil}
                                    onChange={(e) => setValidUntil(e.target.value)}
                                    className="block w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:ring-2 focus:ring-custom/20 focus:border-custom outline-none transition-all"
                                />
                            </div>

                            {/* Manual Payment Section */}
                            <div className="pt-4 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setShowPaymentForm(!showPaymentForm)}
                                    className="flex items-center gap-2 text-sm font-bold text-emerald-600 hover:text-emerald-700 transition-colors"
                                >
                                    <DollarSign className="h-4 w-4" />
                                    {showPaymentForm ? 'Cancelar Pagamento Manual' : 'Registrar Pagamento Manual'}
                                </button>

                                {showPaymentForm && (
                                    <div className="mt-4 bg-slate-50 p-5 rounded-xl border border-slate-200 animate-in slide-in-from-top-2 duration-200">
                                        <div className="grid grid-cols-2 gap-4 mb-4">
                                            <div>
                                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Data</label>
                                                <input
                                                    type="date"
                                                    value={paymentDate}
                                                    onChange={(e) => setPaymentDate(e.target.value)}
                                                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm transition-all focus:ring-2 focus:ring-custom/20 focus:border-custom outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Valor</label>
                                                <CurrencyInput
                                                    value={Math.round(paymentAmount * 100)}
                                                    onValueChange={(val) => setPaymentAmount(val / 100)}
                                                    showSymbol={false}
                                                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm transition-all focus:ring-2 focus:ring-custom/20 focus:border-custom outline-none"
                                                />
                                            </div>
                                        </div>

                                        {/* Credits Section */}
                                        {userCredits > 0 && (
                                            <div className="mb-4 flex items-start gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                                                <input
                                                    type="checkbox"
                                                    id="useCreditsV2"
                                                    checked={useCredits}
                                                    onChange={(e) => setUseCredits(e.target.checked)}
                                                    className="mt-1 h-4 w-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                                                />
                                                <div>
                                                    <label htmlFor="useCreditsV2" className="text-sm font-bold text-slate-900 cursor-pointer">
                                                        Usar Créditos ({userCredits})
                                                    </label>
                                                    {useCredits && (
                                                        <p className="text-xs text-emerald-600 mt-1 font-medium">
                                                            Desconto aplicado: R$ {(Math.min(userCredits, 5) * ((plans.find(p => p.name === selectedPlan)?.price_monthly || 0) * 0.20)).toFixed(2)}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        <button
                                            type="button"
                                            onClick={handleRegisterPayment}
                                            disabled={updating}
                                            className="w-full py-3 px-4 text-sm font-bold rounded-xl text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-600/20 disabled:opacity-50 transition-all"
                                        >
                                            {updating ? 'Processando...' : 'Confirmar Pagamento'}
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Save Button */}
                            <div className="pt-4 flex justify-end">
                                <button
                                    type="submit"
                                    className="px-6 py-3 text-sm font-bold text-white bg-custom rounded-xl hover:bg-custom-hover shadow-sm shadow-custom/20 disabled:opacity-50 transition-all"
                                    disabled={updating}
                                >
                                    {updating ? 'Salvando...' : 'Salvar Alterações'}
                                </button>
                            </div>
                        </form>
                    )}

                    {activeTab === 'danger' && (
                        <div className="space-y-5">
                            <div className="bg-red-50 border border-red-100 rounded-xl p-5">
                                <div className="flex items-start gap-3">
                                    <div className="p-2 bg-red-100 rounded-lg flex-shrink-0">
                                        <AlertTriangle className="h-5 w-5 text-red-600" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-red-800">Zona de Perigo</h3>
                                        <p className="text-sm text-red-600 mt-1">
                                            Ações aqui são irreversíveis. Tenha certeza absoluta antes de prosseguir.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="border border-red-200 rounded-xl p-5">
                                <h4 className="text-sm font-bold text-slate-900">Excluir Usuário</h4>
                                <p className="text-sm text-slate-500 mt-1 mb-5">
                                    Isso apagará permanentemente a conta, histórico de pagamentos, clientes e todos os dados associados.
                                </p>
                                <button
                                    onClick={handleDeleteUser}
                                    disabled={updating}
                                    className="w-full py-3 px-4 text-sm font-bold rounded-xl text-white bg-red-600 hover:bg-red-700 shadow-sm shadow-red-600/20 disabled:opacity-50 transition-all"
                                >
                                    {updating ? 'Excluindo...' : 'EXCLUIR USUÁRIO'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
