import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { Settings, Save, RefreshCw, Shield, Zap, Star, Award, UserCheck, Tags, Wallet, Activity, Inbox } from 'lucide-react';
import { CurrencyInput } from '../../components/ui/CurrencyInput';
import { supabase } from '../../lib/supabase';

interface PlanPrices {
    basico: number;
    pro: number;
    premium: number;
}

interface SinglePlanLimits {
    transactions: number;
    clients: number;
    tags: number;
    accounts: number;
    email_enabled?: boolean;
    email_frequency?: 'daily' | 'weekly';
}

interface PlanLimits {
    free: SinglePlanLimits;
    basico: SinglePlanLimits;
    pro: SinglePlanLimits;
    premium: SinglePlanLimits;
}

const normalizePlanName = (name: string) =>
    name.toLowerCase().normalize("NFD").replace(/[^\w\s]/gi, '');

export default function AdminSettingsV2() {
    const [prices, setPrices] = useState<PlanPrices>({ basico: 0, pro: 0, premium: 0 });
    const [initialPrices, setInitialPrices] = useState<PlanPrices>({ basico: 0, pro: 0, premium: 0 });
    
    const [limits, setLimits] = useState<PlanLimits>({
        free: { transactions: 30, clients: 15, tags: 10, accounts: 2, email_enabled: false, email_frequency: 'daily' },
        basico: { transactions: 60, clients: -1, tags: -1, accounts: -1, email_enabled: true, email_frequency: 'weekly' },
        pro: { transactions: 120, clients: -1, tags: -1, accounts: -1, email_enabled: true, email_frequency: 'daily' },
        premium: { transactions: -1, clients: -1, tags: -1, accounts: -1, email_enabled: true, email_frequency: 'daily' },
    });
    const [initialLimits, setInitialLimits] = useState<PlanLimits>({
        free: { transactions: 30, clients: 15, tags: 10, accounts: 2, email_enabled: false, email_frequency: 'daily' },
        basico: { transactions: 60, clients: -1, tags: -1, accounts: -1, email_enabled: true, email_frequency: 'weekly' },
        pro: { transactions: 120, clients: -1, tags: -1, accounts: -1, email_enabled: true, email_frequency: 'daily' },
        premium: { transactions: -1, clients: -1, tags: -1, accounts: -1, email_enabled: true, email_frequency: 'daily' },
    });

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            // 1. Busca precificação e limites operacionais dos planos
            const { data: plansData, error: plansError } = await supabase.rpc('get_all_plans_with_prices');
            if (plansError) throw plansError;

            if (plansData) {
                const fetchedPrices: Partial<PlanPrices> = {};
                const fetchedLimits: Partial<Record<keyof PlanLimits, SinglePlanLimits>> = {};

                plansData.forEach((plan: any) => {
                    const slug = (plan.slug || normalizePlanName(plan.name)) as keyof PlanLimits;
                    const price = Math.round(parseFloat(plan.price_monthly || '0') * 100);
                    
                    const planLimits: SinglePlanLimits = {
                        transactions: plan.limit_transactions ?? -1,
                        clients: plan.limit_clients ?? -1,
                        tags: plan.limit_tags ?? -1,
                        accounts: plan.limit_accounts ?? -1,
                        email_enabled: plan.email_notification_enabled ?? true,
                        email_frequency: (plan.email_notification_frequency ?? 'daily') as 'daily' | 'weekly'
                    };

                    fetchedLimits[slug] = planLimits;
                    if (slug !== 'free') {
                        fetchedPrices[slug as keyof PlanPrices] = price;
                    }
                });

                const numericPrices: PlanPrices = {
                    basico: fetchedPrices.basico ?? 0,
                    pro: fetchedPrices.pro ?? 0,
                    premium: fetchedPrices.premium ?? 0,
                };

                const numericLimits: PlanLimits = {
                    free: fetchedLimits.free ?? { transactions: 30, clients: 15, tags: 10, accounts: 2, email_enabled: false, email_frequency: 'daily' },
                    basico: fetchedLimits.basico ?? { transactions: 60, clients: -1, tags: -1, accounts: -1, email_enabled: true, email_frequency: 'weekly' },
                    pro: fetchedLimits.pro ?? { transactions: 120, clients: -1, tags: -1, accounts: -1, email_enabled: true, email_frequency: 'daily' },
                    premium: fetchedLimits.premium ?? { transactions: -1, clients: -1, tags: -1, accounts: -1, email_enabled: true, email_frequency: 'daily' },
                };

                setPrices(numericPrices);
                setInitialPrices(numericPrices);
                setLimits(numericLimits);
                setInitialLimits(numericLimits);
            }

        } catch (error: any) {
            toast.error(error.message || 'Erro ao carregar configurações');
            console.error('Erro:', error);
        } finally {
            setLoading(false);
        }
    };

    const handlePriceChange = (plan: keyof PlanPrices, value: number | undefined) => {
        setPrices(prev => ({ ...prev, [plan]: value || 0 }));
    };

    const handleLimitFieldChange = (plan: keyof PlanLimits, field: keyof SinglePlanLimits, value: any) => {
        setLimits(prev => ({
            ...prev,
            [plan]: {
                ...prev[plan],
                [field]: value
            }
        }));
    };

    const handleUpdateSettings = async () => {
        setSaving(true);
        try {
            // 1. Atualiza cotas operacionais, precificação e e-mail alertas por plano via RPC
            const { error: rpcError } = await supabase.rpc('update_plan_settings', { 
                prices_data: prices, 
                limits_data: limits 
            });
            if (rpcError) throw rpcError;

            toast.success('Configurações de planos e alertas atualizadas com sucesso!');
            setInitialPrices(prices);
            setInitialLimits(limits);
        } catch (error: any) {
            toast.error(`Falha ao atualizar: ${error.message}`);
            console.error('Erro:', error);
        } finally {
            setSaving(false);
        }
    };

    const hasChanges = JSON.stringify(prices) !== JSON.stringify(initialPrices) || 
                       JSON.stringify(limits) !== JSON.stringify(initialLimits);

    const renderPlanLimitsGrid = (slug: keyof PlanLimits) => {
        const planLimits = limits[slug];
        const isEmailEnabled = planLimits.email_enabled ?? (slug !== 'free');
        const emailFrequency = planLimits.email_frequency ?? (slug === 'basico' ? 'weekly' : 'daily');

        return (
            <div className="border-t border-dashed border-slate-200 pt-4 mt-2 space-y-3">
                <div className="flex items-center justify-between">
                    <h4 className="text-[11px] font-extrabold text-slate-600 uppercase tracking-widest">Cotas do Plano</h4>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label className="flex items-center gap-1 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                            <Activity className="w-3 h-3 text-slate-400" />
                            Transações
                        </label>
                        <input
                            type="number"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-custom/20 focus:border-custom text-slate-900 font-bold text-sm transition-all"
                            value={planLimits.transactions}
                            min="-1"
                            onChange={(e) => handleLimitFieldChange(slug, 'transactions', parseInt(e.target.value) || 0)}
                            disabled={saving}
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="flex items-center gap-1 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                            <UserCheck className="w-3 h-3 text-slate-400" />
                            Clientes
                        </label>
                        <input
                            type="number"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-custom/20 focus:border-custom text-slate-900 font-bold text-sm transition-all"
                            value={planLimits.clients}
                            min="-1"
                            onChange={(e) => handleLimitFieldChange(slug, 'clients', parseInt(e.target.value) || 0)}
                            disabled={saving}
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="flex items-center gap-1 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                            <Tags className="w-3 h-3 text-slate-400" />
                            Tags
                        </label>
                        <input
                            type="number"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-custom/20 focus:border-custom text-slate-900 font-bold text-sm transition-all"
                            value={planLimits.tags}
                            min="-1"
                            onChange={(e) => handleLimitFieldChange(slug, 'tags', parseInt(e.target.value) || 0)}
                            disabled={saving}
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="flex items-center gap-1 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                            <Wallet className="w-3 h-3 text-slate-400" />
                            Contas
                        </label>
                        <input
                            type="number"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-custom/20 focus:border-custom text-slate-900 font-bold text-sm transition-all"
                            value={planLimits.accounts}
                            min="-1"
                            onChange={(e) => handleLimitFieldChange(slug, 'accounts', parseInt(e.target.value) || 0)}
                            disabled={saving}
                        />
                    </div>
                </div>

                {/* CONTROLE INDIVIDUAL DE E-MAIL ALERTAS POR PLANO */}
                <div className="border-t border-slate-100 pt-3 mt-2 space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Alertas por E-mail</span>
                        
                        {/* Botão Liga/Desliga */}
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => handleLimitFieldChange(slug, 'email_enabled', !isEmailEnabled)}
                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                    isEmailEnabled ? 'bg-teal-600' : 'bg-slate-200'
                                }`}
                                disabled={saving}
                            >
                                <span
                                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                        isEmailEnabled ? 'translate-x-4' : 'translate-x-0'
                                    }`}
                                />
                            </button>
                            <span className="text-[9px] font-bold text-slate-600 uppercase tracking-wider min-w-[32px]">
                                {isEmailEnabled ? 'Ativo' : 'Desat.'}
                            </span>
                        </div>
                    </div>

                    {isEmailEnabled && (
                        <div className="flex bg-slate-100 rounded-lg p-0.5 border border-slate-200 shadow-inner w-full">
                            <button
                                type="button"
                                onClick={() => handleLimitFieldChange(slug, 'email_frequency', 'daily')}
                                className={`flex-1 py-1 rounded-md text-[10px] font-black transition-all ${
                                    emailFrequency === 'daily'
                                        ? 'bg-slate-900 text-white shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700'
                                }`}
                                disabled={saving}
                            >
                                Diário
                            </button>
                            <button
                                type="button"
                                onClick={() => handleLimitFieldChange(slug, 'email_frequency', 'weekly')}
                                className={`flex-1 py-1 rounded-md text-[10px] font-black transition-all ${
                                    emailFrequency === 'weekly'
                                        ? 'bg-slate-900 text-white shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700'
                                }`}
                                disabled={saving}
                            >
                                Semanal
                            </button>
                        </div>
                    )}
                </div>
                
                <p className="text-[9px] text-slate-400 mt-2 font-medium italic">* Digite -1 para liberar cota ilimitada</p>
            </div>
        );
    };

    return (
        <div className="w-full max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500 pb-12">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-8">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-custom/10 rounded-xl text-custom">
                        <Settings className="w-8 h-8" />
                    </div>
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Configurações Globais</h2>
                        <p className="text-slate-500">Gerencie as configurações de valores e limites de todos os planos da plataforma.</p>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/40">
                    <div className="flex items-center gap-3">
                        <div className="bg-custom/10 p-2 rounded-lg">
                            <Shield className="w-5 h-5 text-custom" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Precificação e Cotas Operacionais</h2>
                            <p className="text-sm text-slate-500">Defina o preço recorrente e as barreiras de uso de recursos por plano.</p>
                        </div>
                    </div>
                    {loading && (
                        <RefreshCw className="w-5 h-5 text-slate-300 animate-spin" />
                    )}
                </div>

                <div className="p-6">
                    {loading ? (
                        <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-custom"></div>
                            <span className="text-sm font-medium">Carregando as configurações integradas...</span>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            
                            {/* PLANO FREE */}
                            <div className="bg-slate-50/60 border border-slate-200/60 rounded-2xl p-6 flex flex-col space-y-4 transition-all hover:shadow-md hover:shadow-slate-100">
                                <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 bg-slate-200 text-slate-600 rounded-lg">
                                            <Zap className="w-4 h-4" />
                                        </div>
                                        <h3 className="font-extrabold text-slate-800">Plano Free</h3>
                                    </div>
                                    <span className="bg-slate-200/80 text-slate-700 text-[10px] font-bold uppercase px-2.5 py-1 rounded-full">Permanente</span>
                                </div>
                                
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-wider">Valor Mensal</label>
                                    <input
                                        type="text"
                                        className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 text-slate-500 font-bold cursor-not-allowed select-none shadow-inner"
                                        value="R$ 0,00"
                                        disabled
                                    />
                                </div>

                                {renderPlanLimitsGrid('free')}
                            </div>

                            {/* PLANO BÁSICO */}
                            <div className="bg-white border border-blue-100 rounded-2xl p-6 flex flex-col space-y-4 transition-all hover:shadow-md hover:shadow-blue-50/50">
                                <div className="flex items-center justify-between border-b border-blue-50 pb-4">
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 bg-blue-100 text-blue-600 rounded-lg">
                                            <Star className="w-4 h-4" />
                                        </div>
                                        <h3 className="font-extrabold text-slate-800">Plano Básico</h3>
                                    </div>
                                    <span className="bg-blue-100 text-blue-700 text-[10px] font-bold uppercase px-2.5 py-1 rounded-full">Popular</span>
                                </div>
                                
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-wider">Valor Mensal</label>
                                    <CurrencyInput
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-custom/20 focus:border-custom text-slate-900 transition-all font-bold"
                                        value={prices.basico}
                                        onValueChange={(val) => handlePriceChange('basico', val)}
                                        disabled={saving}
                                    />
                                </div>

                                {renderPlanLimitsGrid('basico')}
                            </div>

                            {/* PLANO PRÓ */}
                            <div className="bg-white border border-custom/20 rounded-2xl p-6 flex flex-col space-y-4 transition-all hover:shadow-md hover:shadow-custom/5">
                                <div className="flex items-center justify-between border-b border-custom/10 pb-4">
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 bg-custom/10 text-custom rounded-lg">
                                            <Award className="w-4 h-4" />
                                        </div>
                                        <h3 className="font-extrabold text-slate-800">Plano Pró</h3>
                                    </div>
                                    <span className="bg-custom text-white text-[10px] font-bold uppercase px-2.5 py-1 rounded-full">Melhor Custo</span>
                                </div>
                                
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-wider">Valor Mensal</label>
                                    <CurrencyInput
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-custom/20 focus:border-custom text-slate-900 transition-all font-bold"
                                        value={prices.pro}
                                        onValueChange={(val) => handlePriceChange('pro', val)}
                                        disabled={saving}
                                    />
                                </div>

                                {renderPlanLimitsGrid('pro')}
                            </div>

                            {/* PLANO PREMIUM */}
                            <div className="bg-white border border-indigo-100 rounded-2xl p-6 flex flex-col space-y-4 transition-all hover:shadow-md hover:shadow-indigo-50/50">
                                <div className="flex items-center justify-between border-b border-indigo-50 pb-4">
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg">
                                            <Shield className="w-4 h-4" />
                                        </div>
                                        <h3 className="font-extrabold text-slate-800">Plano Premium</h3>
                                    </div>
                                    <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold uppercase px-2.5 py-1 rounded-full">Full</span>
                                </div>
                                
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-wider">Valor Mensal</label>
                                    <CurrencyInput
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-custom/20 focus:border-custom text-slate-900 transition-all font-bold"
                                        value={prices.premium}
                                        onValueChange={(val) => handlePriceChange('premium', val)}
                                        disabled={saving}
                                    />
                                </div>

                                {renderPlanLimitsGrid('premium')}
                            </div>


                        </div>
                    )}
                </div>

                <div className="px-6 py-4 bg-slate-50 flex items-center justify-end border-t border-slate-100">
                    <button
                        onClick={handleUpdateSettings}
                        disabled={loading || saving || !hasChanges}
                        className="px-8 py-3 bg-custom text-white rounded-xl text-sm font-bold shadow-lg shadow-custom/20 hover:brightness-105 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 disabled:grayscale disabled:scale-100 disabled:cursor-not-allowed"
                    >
                        <Save className="w-5 h-5" />
                        {saving ? 'Salvando...' : 'Salvar Alterações'}
                    </button>
                </div>
            </section>

            <div className="p-6 bg-amber-50 rounded-2xl border border-amber-100 flex gap-4 items-start">
                <div className="p-2 bg-amber-100 rounded-lg text-amber-600 shrink-0">
                    <Shield className="w-5 h-5" />
                </div>
                <div>
                    <h4 className="font-bold text-amber-900">Painel de Operações & Segurança de Cotas</h4>
                    <p className="text-sm text-amber-800 leading-relaxed mt-1">
                        Os limites operacionais impõem barreiras de uso do sistema. Ao reduzir uma cota abaixo da quantidade atual consumida por um cliente, ele continuará visualizando seus registros antigos, mas ficará temporariamente impedido de adicionar novas entidades (clientes, transações, tags ou contas bancárias) até que faça upgrade ou libere cotas.
                    </p>
                </div>
            </div>
        </div>
    );
}
