import { useState, useEffect, useCallback } from 'react';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useAuth } from '../../contexts/AuthContext';
import { format, parseISO } from 'date-fns';
import { formatCurrency } from '../../lib/utils';
import toast, { Toaster } from 'react-hot-toast';
import { CheckCircle, CreditCard, Info, Loader2, Shield, XCircle } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';

type PlanName = 'basico' | 'pro' | 'premium';

const PLAN_MAPPING: Record<string, PlanName> = {
  'básico': 'basico',
  'pró': 'pro',
};

export default function SubscriptionPageV2() {
  const { loading, pageData, paymentStatus } = useSubscription();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

  const [selectedPlan, setSelectedPlan] = useState<PlanName | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [paymentResult, setPaymentResult] = useState<'success' | 'cancelled' | null>(null);

  // Detecta retorno do Stripe via query params
  useEffect(() => {
    const payment = searchParams.get('payment');
    if (payment === 'success') setPaymentResult('success');
    if (payment === 'cancelled') setPaymentResult('cancelled');
  }, [searchParams]);

  // Define o plano padrão quando os dados carregam
  useEffect(() => {
    if (pageData && !selectedPlan) {
      const basicPlan = pageData.plans.find(p => p.name.toLowerCase() === 'básico');
      if (basicPlan) {
        setSelectedPlan('basico');
      } else if (pageData.plans.length > 0) {
        const firstKey = PLAN_MAPPING[pageData.plans[0].name.toLowerCase()] ?? (pageData.plans[0].name.toLowerCase() as PlanName);
        setSelectedPlan(firstKey);
      }
    }
  }, [pageData, selectedPlan]);

  const getSelectedPlanData = useCallback(() => {
    if (!selectedPlan || !pageData) return null;
    return pageData.plans.find(plan => {
      const planKey = PLAN_MAPPING[plan.name.toLowerCase()] ?? plan.name.toLowerCase() as PlanName;
      return planKey === selectedPlan;
    });
  }, [selectedPlan, pageData]);

  const selectedPlanObj = getSelectedPlanData();
  const planPrice = selectedPlanObj?.price_monthly ?? 0;
  const userCredits = pageData?.user?.credits ?? 0;
  const finalAmount = Math.max(0, planPrice - userCredits);
  const planDisplayName = selectedPlanObj?.name ?? (selectedPlan ? selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1) : '');

  const handleCheckout = async () => {
    if (!selectedPlanObj || !user) {
      toast.error('Selecione um plano antes de continuar.');
      return;
    }

    if (finalAmount <= 0) {
      toast('Você possui créditos suficientes. Entre em contato com o suporte para ativar.', { icon: '🎁' });
      return;
    }

    setIsRedirecting(true);

    try {
      const { data } = await axios.post('/api/stripe/create-checkout-session', {
        amount: finalAmount,
        planName: planDisplayName,
        userId: user.id,
        userEmail: user.email,
      });

      if (data.success && data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('URL de checkout não retornada.');
      }
    } catch (error) {
      console.error('Erro ao iniciar checkout:', error);
      toast.error('Erro ao iniciar o pagamento. Tente novamente.');
      setIsRedirecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-custom"></div>
      </div>
    );
  }

  // Tela de assinatura já ativa
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
        <p className="text-slate-600 mb-6">
          Sua assinatura do plano <span className="font-bold text-custom">{plan}</span> está ativa e funcionando perfeitamente!
        </p>
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

  // Tela de retorno do Stripe: pagamento com sucesso
  if (paymentResult === 'success') {
    return (
      <div className="max-w-xl mx-auto mt-10 p-8 bg-white rounded-2xl shadow-xl border border-slate-100 text-center animate-in fade-in slide-in-from-bottom-4">
        <div className="flex justify-center mb-6">
          <div className="bg-emerald-100 p-4 rounded-full">
            <CheckCircle className="h-12 w-12 text-emerald-500" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Pagamento Confirmado!</h2>
        <p className="text-slate-500 mb-8">
          Seu pagamento foi processado com sucesso. Sua assinatura será ativada em instantes.
        </p>
        <Link to="/v2/dashboard" className="inline-block bg-custom text-white font-bold py-3 px-8 rounded-xl hover:bg-custom-hover transition-colors">
          Ir para o Dashboard
        </Link>
      </div>
    );
  }

  // Tela de retorno do Stripe: pagamento cancelado
  if (paymentResult === 'cancelled') {
    return (
      <div className="max-w-xl mx-auto mt-10 p-8 bg-white rounded-2xl shadow-xl border border-slate-100 text-center">
        <div className="flex justify-center mb-6">
          <div className="bg-red-100 p-4 rounded-full">
            <XCircle className="h-12 w-12 text-red-400" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Pagamento Cancelado</h2>
        <p className="text-slate-500 mb-8">
          O pagamento foi cancelado. Você pode tentar novamente quando quiser.
        </p>
        <button
          onClick={() => setPaymentResult(null)}
          className="inline-block bg-custom text-white font-bold py-3 px-8 rounded-xl hover:bg-custom-hover transition-colors"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  const renderPlanSelection = () => {
    if (!pageData?.plans?.length) {
      return <p className="text-slate-500">Nenhum plano disponível no momento.</p>;
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {pageData.plans.filter(p => p.name.toLowerCase() !== 'premium').map(plan => {
          const planKey = PLAN_MAPPING[plan.name.toLowerCase()] ?? plan.name.toLowerCase() as PlanName;
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
                  <span className="text-slate-900 text-4xl font-black tracking-tight">{formatCurrency(plan.price_monthly)}</span>
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

  return (
    <div className="w-full max-w-7xl mx-auto space-y-10 animate-in fade-in duration-500 pb-16">
      <div className="mb-10 mt-8">
        <h1 className="text-slate-900 text-4xl md:text-5xl font-black leading-tight tracking-tight mb-3">Faça sua Assinatura</h1>
        <p className="text-slate-500 text-lg max-w-2xl">Escolha o plano ideal para o seu negócio e finalize o pagamento de forma segura.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-8 space-y-10">

          {/* Passo 1: Escolha do plano */}
          <section>
            <div className="flex items-center gap-3 mb-6">
              <span className="bg-custom text-white w-8 h-8 rounded-full flex items-center justify-center font-bold">1</span>
              <h2 className="text-slate-900 text-2xl font-bold leading-tight">Escolha seu plano</h2>
            </div>
            {renderPlanSelection()}
          </section>

          {/* Passo 2: Pagamento */}
          <section className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-8">
              <span className="bg-custom text-white w-8 h-8 rounded-full flex items-center justify-center font-bold">2</span>
              <h2 className="text-slate-900 text-2xl font-bold leading-tight">Pagamento</h2>
            </div>

            {finalAmount > 0 ? (
              <div className="flex flex-col items-center gap-6 text-center">
                <div className="bg-slate-50 rounded-xl p-6 w-full border border-slate-100">
                  <p className="text-sm text-slate-500 mb-1">Valor a pagar</p>
                  <p className="text-4xl font-black text-slate-900">{formatCurrency(finalAmount)}</p>
                  {userCredits > 0 && (
                    <p className="text-xs text-custom mt-2">🎁 Desconto de {formatCurrency(userCredits)} aplicado</p>
                  )}
                </div>

                <button
                  onClick={handleCheckout}
                  disabled={isRedirecting || !selectedPlan}
                  className="w-full flex items-center justify-center gap-3 py-4 rounded-xl bg-custom text-white font-bold text-lg shadow-lg shadow-custom/20 hover:bg-custom-hover transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isRedirecting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Redirecionando...
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-5 h-5" />
                      Pagar com Cartão
                    </>
                  )}
                </button>

                <p className="text-xs text-slate-400 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5" />
                  Pagamento processado com segurança via Stripe
                </p>
              </div>
            ) : (
              <div className="text-center p-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <div className="inline-flex bg-emerald-100 p-4 rounded-full mb-4">
                  <CheckCircle className="w-8 h-8 text-emerald-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-800">Isenção Recebida!</h3>
                <p className="text-slate-500 mt-2">
                  Você possui créditos de indicação suficientes. Entre em contato com o suporte para ativar a isenção.
                </p>
                <a
                  href={`https://wa.me/5521967621494?text=Olá, tenho saldo de indicações suficiente e desejo ativar o plano ${planDisplayName} com isenção.`}
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

        {/* Sidebar: resumo do pedido */}
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
                      <div className="absolute opacity-0 group-hover:opacity-100 transition-opacity bottom-full left-1/2 -translate-x-1/2 mb-2 p-2 bg-slate-800 text-white text-xs rounded shadow-lg pointer-events-none z-10 max-w-[200px] text-center">
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
                    <span className="block text-[10px] text-slate-400 font-medium">Acesso em até</span>
                    <span className="text-custom font-bold text-sm">5 minutos</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 flex gap-3 items-start border border-slate-100">
                <Shield className="w-5 h-5 text-custom shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed text-slate-500">
                  Pagamento processado com segurança via Stripe. Seus dados financeiros são protegidos com criptografia de ponta.
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
