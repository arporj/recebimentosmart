import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { Settings, Save, RefreshCw, CreditCard } from 'lucide-react';
import { CurrencyInput } from '../../components/ui/CurrencyInput';
import { supabase } from '../../lib/supabase';

interface PlanPrices {
    basico: number;
    pro: number;
    premium: number;
}

const normalizePlanName = (name: string) =>
    name.toLowerCase().normalize("NFD").replace(/[^\w\s]/gi, '');

export default function AdminSettingsV2() {
    const [prices, setPrices] = useState<PlanPrices>({ basico: 0, pro: 0, premium: 0 });
    const [initialPrices, setInitialPrices] = useState<PlanPrices>({ basico: 0, pro: 0, premium: 0 });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchPrices();
    }, []);

    const fetchPrices = async () => {
        setLoading(true);
        try {
            const { data: pricesData, error: pricesError } = await supabase.rpc('get_all_plans_with_prices');
            if (pricesError) throw pricesError;

            if (pricesData) {
                const fetchedPrices: Partial<PlanPrices> = {};
                pricesData.forEach((plan: any) => {
                    const normalizedName = normalizePlanName(plan.name);
                    const price = Math.round(parseFloat(plan.price_monthly || '0') * 100);
                    if (normalizedName === 'basico') fetchedPrices.basico = price;
                    if (normalizedName === 'pro') fetchedPrices.pro = price;
                    if (normalizedName === 'premium') fetchedPrices.premium = price;
                });

                const numericPrices: PlanPrices = {
                    basico: fetchedPrices.basico || 0,
                    pro: fetchedPrices.pro || 0,
                    premium: fetchedPrices.premium || 0,
                };

                setPrices(numericPrices);
                setInitialPrices(numericPrices);
            }
        } catch (error: any) {
            toast.error(error.message || 'Erro ao carregar preços');
            console.error('Erro:', error);
        } finally {
            setLoading(false);
        }
    };

    const handlePriceChange = (plan: keyof PlanPrices, value: number | undefined) => {
        setPrices(prev => ({ ...prev, [plan]: value || 0 }));
    };

    const handleUpdatePrices = async () => {
        setSaving(true);
        try {
            const { error } = await supabase.rpc('update_plan_prices', { prices_data: prices });
            if (error) throw error;
            toast.success('Preços dos planos atualizados com sucesso!');
            setInitialPrices(prices);
        } catch (error: any) {
            toast.error(`Falha ao atualizar: ${error.message}`);
            console.error('Erro:', error);
        } finally {
            setSaving(false);
        }
    };

    const hasChanges = JSON.stringify(prices) !== JSON.stringify(initialPrices);

    return (
        <div className="w-full max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500 pb-12">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-8">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-custom/10 rounded-xl text-custom">
                        <Settings className="w-8 h-8" />
                    </div>
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Configurações Globais</h2>
                        <p className="text-slate-500">Gerencie as configurações fundamentais do sistema e valores dos planos.</p>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="bg-blue-50 p-2 rounded-lg">
                            <CreditCard className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Preços dos Planos</h2>
                            <p className="text-sm text-slate-500">Defina o valor mensal para cada nível de assinatura.</p>
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
                            <span className="text-sm font-medium">Carregando configurações...</span>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-slate-700">Plano Básico</label>
                                <CurrencyInput
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-custom/20 focus:border-custom text-slate-900 transition-all font-semibold"
                                    value={prices.basico}
                                    onValueChange={(val) => handlePriceChange('basico', val)}
                                    disabled={saving}
                                />
                                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Valor mensal atual</p>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-slate-700">Plano Pró</label>
                                <CurrencyInput
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-custom/20 focus:border-custom text-slate-900 transition-all font-semibold"
                                    value={prices.pro}
                                    onValueChange={(val) => handlePriceChange('pro', val)}
                                    disabled={saving}
                                />
                                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Valor mensal atual</p>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-slate-700">Plano Premium</label>
                                <CurrencyInput
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-custom/20 focus:border-custom text-slate-900 transition-all font-semibold"
                                    value={prices.premium}
                                    onValueChange={(val) => handlePriceChange('premium', val)}
                                    disabled={saving}
                                />
                                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Valor mensal atual</p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 bg-slate-50 flex items-center justify-end border-t border-slate-100">
                    <button
                        onClick={handleUpdatePrices}
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
                    <Settings className="w-5 h-5" />
                </div>
                <div>
                    <h4 className="font-bold text-amber-900">Nota de Migração</h4>
                    <p className="text-sm text-amber-800 leading-relaxed mt-1">
                        Os campos de <strong>CPF/CNPJ</strong> foram movidos para a página de <strong>Configurações da Conta</strong>.
                        O recurso de <strong>Teste de Pagamento</strong> foi removido desta interface para simplificação.
                    </p>
                </div>
            </div>
        </div>
    );
}
