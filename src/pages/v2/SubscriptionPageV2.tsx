import { useState, useMemo, useEffect } from 'react';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useAuth } from '../../contexts/AuthContext';
import { format, parseISO } from 'date-fns';
import { formatCurrency } from '../../lib/utils';
import { generatePixCopyPaste } from '../../lib/pix';
import QRCode from 'qrcode';
import toast, { Toaster } from 'react-hot-toast';
import { CheckCircle, Copy, Info, Shield, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';

type PlanName = 'basico' | 'pro' | 'premium';

export default function SubscriptionPageV2() {
    const { loading, pageData, paymentStatus } = useSubscription();
    const [selectedPlan, setSelectedPlan] = useState<PlanName | null>(null);
    const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
    const [pixCopyPaste, setPixCopyPaste] = useState<string | null>(null);

    // Define o plano padrão
    useEffect(() => {
        if (pageData && !selectedPlan) {
            const basicPlan = pageData.plans.find(p => p.name.toLowerCase() === 'básico');
            if (basicPlan) {
                setSelectedPlan('basico');
            } else if (pageData.plans.length > 0) {
                const firstPlanKey = pageData.plans[0].name.toLowerCase() as PlanName;
                setSelectedPlan(firstPlanKey);
            }
        }
    }, [pageData, selectedPlan]);

    const finalAmount = useMemo(() => {
        if (!selectedPlan || !pageData) {
            return 0;
        }

        const planMapping: Record<string, PlanName> = {
            'básico': 'basico',
            'pró': 'pro',
        };

        const selectedPlanObj = pageData.plans.find(plan => {
            const planKey = planMapping[plan.name.toLowerCase()] || plan.name.toLowerCase() as PlanName;
            return planKey === selectedPlan;
        });

        const planPrice = selectedPlanObj ? selectedPlanObj.price_monthly : 0;
        const userCredits = pageData.user?.credits || 0;

        return Math.max(0, planPrice - userCredits);
    }, [selectedPlan, pageData]);

    useEffect(() => {
        const generateQR = async () => {
            if (finalAmount > 0) {
                try {
                    const pixKey = '37905181000105';
                    const payload = generatePixCopyPaste(
                        pixKey,
                        finalAmount,
                        'Recebimento Smart',
                        'Sao Paulo'
                    );
                    setPixCopyPaste(payload);
                    const url = await QRCode.toDataURL(payload);
                    setQrCodeUrl(url);
                } catch (error) {
                    console.error('Erro ao gerar QR Code:', error);
                    toast.error('Erro ao gerar o QR Code para pagamento.');
                }
            } else {
                setQrCodeUrl(null);
                setPixCopyPaste(null);
            }
        };
        generateQR();
    }, [finalAmount]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-custom"></div>
            </div>
        );
    }

    if (paymentStatus === 'completed' && pageData?.user) {
        const { plan, valid_until } = pageData.user;
        return (
            <div className="max-w-xl mx-auto mt-10 p-8 bg-white rounded-2xl shadow-xl border border-slate-100 text-center animate-in fade-in slide-in-from-bottom-4">
                <div className="flex justify-center mb-6">
                    <div className="bg-emerald-100 p-4 rounded-full">
                        <CheckCircle className="h-12 w-12 text-emerald-500" />
                    </div>
                </div>
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Assinatura Ativa</h2>
                <p className="text-slate-600 mb-6">Sua assinatura do plano <span className="font-bold text-custom">{plan}</span> está ativa e funcionando perfeitamente!</p>
                <div className="bg-slate-50 rounded-xl p-4 mb-8 border border-slate-100">
                    <p className="text-sm text-slate-500">Próximo vencimento</p>
                    <p className="text-xl font-bold text-slate-800">{format(parseISO(valid_until), 'dd/MM/yyyy')}</p>
                </div>
                <Link to="/v2/dashboard" className="inline-block bg-custom text-white font-bold py-3 px-8 rounded-xl hover:bg-custom-hover transition-colors">
                    Acessar Dashboard
                </Link>
            </div>
        );
    }

    const renderPlanSelection = () => {
        if (!pageData || !pageData.plans || pageData.plans.length === 0) {
            return <p className="text-slate-500">Nenhum plano disponível no momento.</p>;
        }

        const planMapping: Record<string, PlanName> = {
            'básico': 'basico',
            'pró': 'pro'
        };

        return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {pageData.plans.filter(p => p.name.toLowerCase() !== 'premium').map(plan => {
                    const planKey = planMapping[plan.name.toLowerCase()] || plan.name.toLowerCase() as PlanName;
                    const price = plan.price_monthly;
                    const isActive = selectedPlan === planKey;

                    return (
                        <div
                            key={planKey}
                            onClick={() => setSelectedPlan(planKey)}
                            className={`group relative flex flex-col gap-6 rounded-xl border-2 p-8 transition-all cursor-pointer ${isActive
                                ? 'border-custom bg-custom/5 shadow-xl shadow-custom/5'
                                : 'border-slate-200 bg-white hover:border-custom/50'
                                }`}
                        >
                            {planKey === 'pro' && (
                                <div className="absolute -top-4 right-6 bg-custom text-white text-xs font-bold px-4 py-1.5 rounded-full tracking-wider uppercase">
                                    Mais Popular
                                </div>
                            )}

                            <div className="flex flex-col gap-2">
                                <h3 className="text-slate-900 text-lg font-bold capitalize">{plan.name}</h3>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-slate-900 text-4xl font-black tracking-tight">{formatCurrency(price)}</span>
                                    <span className="text-slate-500 text-base font-medium">/mês</span>
                                </div>
                            </div>

                            <ul className="space-y-4 flex-1">
                                {(plan.features || ['Controle básico de fluxo', 'Relatórios mensais PDF', 'Suporte via email']).map((feature, i) => (
                                    <li key={i} className={`flex items-start gap-3 text-sm ${isActive ? 'text-slate-700' : 'text-slate-600'}`}>
                                        <CheckCircle className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-custom' : 'text-custom/70'}`} />
                                        <span>{feature}</span>
                                    </li>
                                ))}
                            </ul>

                            <button className={`w-full py-3 rounded-xl font-bold transition-all ${isActive
                                ? 'bg-custom text-white shadow-lg shadow-custom/20'
                                : 'border-2 border-custom text-custom hover:bg-custom/5'
                                }`}>
                                {isActive ? 'Plano Selecionado' : 'Selecionar'}
                            </button>
                        </div>
                    );
                })}
            </div>
        );
    };

    const getSelectedPlanData = () => {
        if (!selectedPlan || !pageData) return null;
        const planMapping: Record<string, PlanName> = { 'básico': 'basico', 'pró': 'pro' };
        return pageData.plans.find(plan => {
            const planKey = planMapping[plan.name.toLowerCase()] || plan.name.toLowerCase() as PlanName;
            return planKey === selectedPlan;
        });
    };

    const selectedPlanObj = getSelectedPlanData();
    const planPrice = selectedPlanObj ? selectedPlanObj.price_monthly : 0;
    const userCredits = pageData?.user?.credits || 0;
    const planDisplayName = selectedPlanObj?.name || (selectedPlan ? selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1) : '');

    return (
        <div className="w-full max-w-7xl mx-auto space-y-10 animate-in fade-in duration-500 pb-16">
            {/* Hero Title */}
            <div className="mb-10 mt-8">
                <h1 className="text-slate-900 text-4xl md:text-5xl font-black leading-tight tracking-tight mb-3">Faça sua Assinatura</h1>
                <p className="text-slate-500 text-lg max-w-2xl">Escolha o plano ideal para o seu negócio e finalize o pagamento via PIX para liberação imediata.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <div className="lg:col-span-8 space-y-10">

                    <section>
                        <div className="flex items-center gap-3 mb-6">
                            <span className="bg-custom text-white w-8 h-8 rounded-full flex items-center justify-center font-bold">1</span>
                            <h2 className="text-slate-900 text-2xl font-bold leading-tight">Escolha seu plano</h2>
                        </div>
                        {renderPlanSelection()}
                    </section>

                    <section className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
                        <div className="flex items-center gap-3 mb-8">
                            <span className="bg-custom text-white w-8 h-8 rounded-full flex items-center justify-center font-bold">2</span>
                            <h2 className="text-slate-900 text-2xl font-bold leading-tight">Pagamento via PIX</h2>
                        </div>

                        {finalAmount > 0 ? (
                            <div className="flex flex-col md:flex-row items-center gap-10">
                                {/* QR Code */}
                                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-inner flex flex-col items-center gap-4 shrink-0">
                                    <div className="w-48 h-48 bg-slate-50 flex items-center justify-center relative overflow-hidden rounded-lg border border-slate-100">
                                        {qrCodeUrl ? (
                                            <img src={qrCodeUrl} alt="QR Code PIX" className="w-full h-full object-contain" />
                                        ) : (
                                            <div className="animate-pulse flex flex-col items-center justify-center h-full w-full">
                                                <Wallet className="w-10 h-10 text-slate-300 mb-2" />
                                                <span className="text-xs text-slate-400">Gerando QR...</span>
                                            </div>
                                        )}
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">Escaneie o QR Code</span>
                                </div>

                                {/* Text and Actions */}
                                <div className="flex-1 w-full space-y-6">
                                    {pixCopyPaste && (
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 mb-2">PIX Copia e Cola</label>
                                            <div className="relative flex items-center">
                                                <input
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 pr-24 text-sm text-slate-500 font-mono focus:ring-custom focus:border-custom outline-none"
                                                    readOnly
                                                    type="text"
                                                    value={pixCopyPaste}
                                                    onClick={(e) => e.currentTarget.select()}
                                                />
                                                <button
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(pixCopyPaste);
                                                        toast.success('Código PIX copiado!');
                                                    }}
                                                    className="absolute right-2 px-4 py-1.5 bg-custom/10 text-custom text-xs font-bold rounded-lg hover:bg-custom hover:text-white transition-all flex items-center gap-1"
                                                >
                                                    <Copy className="w-3 h-3" /> Copiar
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-4 pt-4 border-t border-slate-100">
                                        <p className="text-sm text-slate-500">Após realizar o pagamento, envie o comprovante para agilizar a ativação:</p>
                                        <a
                                            href={`https://wa.me/5521967621494?text=Olá, realizei o pagamento da assinatura do plano ${planDisplayName} no valor de ${formatCurrency(finalAmount)}. Segue o comprovante.`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="w-full flex items-center justify-center gap-3 py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold text-lg shadow-lg shadow-emerald-500/20 hover:scale-[1.02] transition-transform"
                                        >
                                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"></path>
                                            </svg>
                                            Enviar Comprovante
                                        </a>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center p-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                <div className="inline-flex bg-emerald-100 p-4 rounded-full mb-4">
                                    <CheckCircle className="w-8 h-8 text-emerald-600" />
                                </div>
                                <h3 className="text-lg font-bold text-slate-800">Isenção Recebida!</h3>
                                <p className="text-slate-500 mt-2">Você possui créditos de indicação suficientes para cobrir o valor deste plano. Entre em contato com o suporte para ativar a isenção.</p>
                                <a
                                    href={`https://wa.me/5521967621494?text=Olá, tenho saldo de indicações suficiente e desejo ativar o plano ${planDisplayName} que zera através do meu desconto.`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex mt-6 items-center justify-center gap-2 py-3 px-6 rounded-xl bg-custom text-white font-bold hover:bg-custom-hover transition-colors"
                                >
                                    Ativar Isenção via WhatsApp
                                </a>
                            </div>
                        )}
                    </section>
                </div>

                <aside className="lg:col-span-4 sticky top-24">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
                        <div className="bg-custom/5 border-b border-custom/10 p-6">
                            <h3 className="text-slate-900 text-lg font-bold">Resumo do Pedido</h3>
                        </div>

                        <div className="p-6 space-y-6">
                            <div className="space-y-4">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-500">Assinatura Mensal ({planDisplayName})</span>
                                    <span className="text-slate-900 font-semibold">{formatCurrency(planPrice || 0)}</span>
                                </div>

                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-500">Taxa de Ativação</span>
                                    <span className="text-emerald-600 font-bold uppercase text-[10px] bg-emerald-50 px-2 py-1 rounded">Grátis</span>
                                </div>

                                {userCredits > 0 && (
                                    <div className="flex justify-between items-center text-sm">
                                        <div className="flex items-center gap-1.5 group relative">
                                            <span className="text-custom font-medium">Bônus de Indicação</span>
                                            <Info className="w-4 h-4 text-custom cursor-help" />
                                            <div className="absolute opacity-0 group-hover:opacity-100 transition-opacity bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-800 text-white text-xs rounded shadow-lg pointer-events-none z-10 w-max max-w-[200px] text-center">
                                                Desconto aplicado graças às suas indicações bem-sucedidas.
                                            </div>
                                        </div>
                                        <span className="text-custom font-bold">- {formatCurrency(userCredits)}</span>
                                    </div>
                                )}
                            </div>

                            <div className="border-t border-dashed border-slate-200 pt-6">
                                <div className="flex justify-between items-end">
                                    <div className="flex flex-col">
                                        <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Total a pagar</span>
                                        <span className="text-slate-900 text-3xl font-black">{formatCurrency(finalAmount)}</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="block text-[10px] text-slate-400 font-medium">Liberação em até</span>
                                        <span className="text-custom font-bold text-sm">5 minutos</span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-50 rounded-xl p-4 flex gap-3 items-start border border-slate-100">
                                <Shield className="w-5 h-5 text-custom shrink-0 mt-0.5" />
                                <p className="text-[11px] leading-relaxed text-slate-500">
                                    Transação processada em ambiente seguro. A renovação será automática a cada 30 dias na sua carteira, para cancelar basta nos solicitar.
                                </p>
                            </div>
                        </div>
                    </div>
                </aside>
            </div>
            <Toaster position="bottom-center" />
        </div>
    );
}
