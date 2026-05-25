import { useState, useEffect, useCallback } from 'react';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useAuth } from '../../contexts/AuthContext';
import { format, parseISO, isFuture } from 'date-fns';
import { formatCurrency } from '../../lib/utils';
import toast, { Toaster } from 'react-hot-toast';
import { CheckCircle, CreditCard, Info, Shield, Copy, Check, MessageSquare, QrCode } from 'lucide-react';

type PlanName = 'basico' | 'pro' | 'premium';

const PLAN_MAPPING: Record<string, PlanName> = {
  'básico': 'basico',
  'pró': 'pro',
};

const PIX_KEY = 'contato@recebimentosmart.com.br';

export default function SubscriptionPageV2() {
  const { loading, pageData, fetchData } = useSubscription();
  const { user } = useAuth();

  const [selectedPlan, setSelectedPlan] = useState<PlanName | null>(null);
  const [copied, setCopied] = useState(false);

  // Recarrega dados ao montar a tela para garantir informações atualizadas do usuário
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Define o plano padrão quando os dados carregam
  useEffect(() => {
    if (pageData && !selectedPlan) {
      const userPlan = pageData.user?.plan?.toLowerCase();
      
      // 1. Tenta selecionar o plano atual do usuário, se ele constar nos planos carregados
      if (userPlan && userPlan !== 'trial' && userPlan !== 'admin') {
        const mappedUserPlan = PLAN_MAPPING[userPlan] ?? (userPlan as PlanName);
        if (pageData.plans.some(p => (PLAN_MAPPING[p.name.toLowerCase()] ?? p.name.toLowerCase()) === mappedUserPlan)) {
          setSelectedPlan(mappedUserPlan);
          return;
        }
      }

      // 2. Fallback: seleciona o Básico, se existir
      const basicPlan = pageData.plans.find(p => p.name.toLowerCase() === 'básico' || p.name.toLowerCase() === 'basico');
      if (basicPlan) {
        setSelectedPlan('basico');
        return;
      }

      // 3. Fallback final: seleciona o primeiro plano da lista
      if (pageData.plans.length > 0) {
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

  const handleCopyKey = () => {
    navigator.clipboard.writeText(PIX_KEY);
    setCopied(true);
    toast.success('Chave PIX copiada para a área de transferência!');
    setTimeout(() => setCopied(false), 3000);
  };

  const selectedPlanObj = getSelectedPlanData();
  const planPrice = selectedPlanObj?.price_monthly ?? 0;
  const userCredits = pageData?.user?.credits ?? 0;
  const finalAmount = Math.max(0, planPrice - userCredits);
  const planDisplayName = selectedPlanObj?.name ?? (selectedPlan ? selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1) : '');

  // Gera o link dinâmico para envio do comprovante pelo WhatsApp
  const getWhatsAppLink = () => {
    const formattedAmount = formatCurrency(finalAmount);
    const email = user?.email ?? 'N/A';
    const text = `Olá! Realizei o pagamento via PIX para assinatura do Recebimento $mart.%0A%0A• *Plano selecionado:* ${planDisplayName}%0A• *Valor pago:* ${formattedAmount}%0A• *Minha Conta (E-mail):* ${email}%0A%0ASegue em anexo o comprovante de pagamento para liberação da minha conta!`;
    return `https://wa.me/5521967621494?text=${text}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-custom"></div>
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
              className={`group relative flex flex-col gap-6 rounded-2xl border-2 p-6 md:p-8 transition-all cursor-pointer ${isActive
                ? 'border-[#29a8a8] bg-[#29a8a8]/5 shadow-xl shadow-[#29a8a8]/5'
                : 'border-slate-200 bg-white hover:border-[#29a8a8]/50'
              }`}
            >
              {planKey === 'pro' && (
                <div className="absolute -top-3.5 right-6 bg-[#29a8a8] text-white text-[10px] md:text-xs font-extrabold px-4 py-1.5 rounded-full tracking-wider uppercase shadow-md shadow-[#29a8a8]/25">
                  Mais Popular
                </div>
              )}

              <div className="flex flex-col gap-2">
                <h3 className="text-slate-900 text-lg font-bold capitalize">{plan.name}</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-slate-900 text-3xl md:text-4xl font-black tracking-tight">{formatCurrency(plan.price_monthly)}</span>
                  <span className="text-slate-500 text-sm font-medium">/mês</span>
                </div>
              </div>

              <ul className="space-y-3.5 flex-1 border-t border-slate-100 pt-5">
                {(plan.features || ['Controle completo de lançamentos', 'Gestão integrada de clientes', 'Suporte prioritário']).map((feature, i) => (
                  <li key={i} className={`flex items-start gap-3 text-sm ${isActive ? 'text-slate-700' : 'text-slate-600'}`}>
                    <CheckCircle className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-[#29a8a8]' : 'text-slate-400'}`} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <button className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all ${isActive
                ? 'bg-[#29a8a8] text-white shadow-lg shadow-[#29a8a8]/25'
                : 'border-2 border-slate-200 text-slate-700 hover:border-[#29a8a8] hover:text-[#29a8a8]'
              }`}>
                {isActive ? 'Plano Selecionado' : 'Selecionar Plano'}
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-10 animate-in fade-in duration-500 pb-16 px-4 sm:px-6">
      <div className="mb-10 mt-8">
        <h1 className="text-slate-900 text-3xl md:text-5xl font-black leading-tight tracking-tight mb-3">Assinatura do Sistema</h1>
        <p className="text-slate-500 text-base md:text-lg max-w-2xl">Escolha o plano ideal para continuar organizando as finanças do seu negócio com o Recebimento $mart.</p>
      </div>

      {(() => {
        const userPlan = pageData?.user?.plan;
        const validUntil = pageData?.user?.valid_until;

        if (!userPlan) return null;

        // Caso 1: Administrador (acesso vitalício/irrestrito)
        if (userPlan === 'admin') {
          return (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8 flex items-start gap-4 shadow-lg text-white">
              <div className="bg-[#29a8a8]/20 p-3 rounded-xl shrink-0">
                <Shield className="h-6 w-6 text-[#29a8a8]" />
              </div>
              <div>
                <h3 className="font-bold text-lg mb-1">Acesso Administrativo Habilitado</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Sua conta possui nível de acesso <span className="font-bold text-[#29a8a8]">Administrador</span>.
                  Você tem acesso total, livre e vitalício a todas as funcionalidades do sistema sem restrições.
                </p>
              </div>
            </div>
          );
        }

        // Caso 2: Em período de Trial
        if (userPlan === 'trial' && validUntil && isFuture(parseISO(validUntil))) {
          return (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mb-8 flex items-start gap-4 shadow-sm">
              <div className="bg-amber-100 p-3 rounded-xl shrink-0">
                <Info className="h-6 w-6 text-amber-600" />
              </div>
              <div className="text-sm">
                <h3 className="text-amber-950 font-bold text-base mb-1">Período de Experiência Ativo</h3>
                <p className="text-amber-800 leading-relaxed">
                  Você está aproveitando o seu período de <span className="font-bold">Testes Gratuitos (Trial)</span>.
                  O seu acesso expira em <span className="font-bold">{format(parseISO(validUntil), 'dd/MM/yyyy')}</span>.
                  Assine um dos nossos planos abaixo antes do vencimento para não perder o ritmo!
                </p>
              </div>
            </div>
          );
        }

        // Caso 3: Assinatura regular ativa (Básico, Pró, etc)
        if (userPlan !== 'trial' && validUntil && isFuture(parseISO(validUntil))) {
          return (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 mb-8 flex items-start gap-4 shadow-sm">
              <div className="bg-emerald-100 p-3 rounded-xl shrink-0">
                <CheckCircle className="h-6 w-6 text-emerald-600" />
              </div>
              <div className="text-sm">
                <h3 className="text-emerald-950 font-bold text-base mb-1">Assinatura Ativa e Regular</h3>
                <p className="text-emerald-800 leading-relaxed">
                  Parabéns! Sua assinatura do plano <span className="font-bold capitalize text-[#29a8a8]">{userPlan}</span> está ativa.
                  O próximo vencimento é em <span className="font-bold text-slate-900">{format(parseISO(validUntil), 'dd/MM/yyyy')}</span>.
                  Você pode realizar pagamentos extras ou renovar sua assinatura antecipadamente abaixo.
                </p>
              </div>
            </div>
          );
        }

        return null;
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-8 space-y-10">

          {/* Passo 1: Escolha do plano */}
          <section>
            <div className="flex items-center gap-3 mb-6">
              <span className="bg-[#29a8a8] text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-md shadow-[#29a8a8]/25">1</span>
              <h2 className="text-slate-900 text-xl md:text-2xl font-black tracking-tight">Escolha o plano desejado</h2>
            </div>
            {renderPlanSelection()}
          </section>

          {/* Passo 2: Pagamento */}
          <section className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-8">
              <span className="bg-[#29a8a8] text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-md shadow-[#29a8a8]/25">2</span>
              <h2 className="text-slate-900 text-xl md:text-2xl font-black tracking-tight">Efetuar Pagamento</h2>
            </div>

            {finalAmount > 0 ? (
              <div className="space-y-8">
                {/* Info do valor */}
                <div className="bg-slate-50 rounded-2xl p-6 text-center border border-slate-100 flex flex-col items-center">
                  <span className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Valor Final da Assinatura</span>
                  <span className="text-3xl md:text-4xl font-black text-slate-900">{formatCurrency(finalAmount)}</span>
                  {userCredits > 0 && (
                    <span className="text-xs bg-[#29a8a8]/10 text-[#29a8a8] font-bold px-3 py-1 rounded-full mt-2.5">
                      🎁 Crédito de indicação aplicado: - {formatCurrency(userCredits)}
                    </span>
                  )}
                </div>

                {/* Grid PIX */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center border-t border-dashed border-slate-200 pt-8">
                  {/* QR Code */}
                  <div className="md:col-span-4 flex flex-col items-center justify-center text-center">
                    <div className="relative bg-white border border-slate-200 rounded-2xl p-3.5 shadow-md flex items-center justify-center w-44 h-44 group">
                      <img 
                        src="/images/pix-qr-code.png" 
                        alt="QR Code PIX" 
                        className="w-full h-full object-contain rounded-lg"
                        onError={(e) => {
                          // Se o usuário não tiver a imagem ainda, exibe um ícone placeholder amigável
                          e.currentTarget.style.display = 'none';
                          const placeholder = e.currentTarget.parentElement?.querySelector('.qr-placeholder');
                          if (placeholder) placeholder.classList.remove('hidden');
                        }}
                      />
                      <div className="qr-placeholder hidden flex-col items-center justify-center text-slate-300">
                        <QrCode className="w-16 h-16 text-[#29a8a8]/35 mb-2" />
                        <span className="text-[10px] text-slate-400 font-semibold px-2">Aguardando Imagem</span>
                      </div>
                    </div>
                    <span className="text-[11px] text-slate-400 font-medium mt-3 leading-relaxed">
                      Escaneie com o app do seu banco
                    </span>
                  </div>

                  {/* Instruções + Chave Copia/Cola */}
                  <div className="md:col-span-8 space-y-5">
                    <h4 className="text-slate-800 font-bold text-base">Instruções para liberação rápida:</h4>
                    
                    <ol className="text-slate-600 text-sm space-y-2 list-decimal list-inside pl-1">
                      <li>Escaneie o QR Code ao lado ou use a Chave PIX abaixo.</li>
                      <li>Transfira o valor exato de <strong className="text-slate-900 font-extrabold">{formatCurrency(finalAmount)}</strong>.</li>
                      <li>Clique no botão verde de confirmação para abrir o suporte no WhatsApp e enviar a imagem do comprovante.</li>
                    </ol>

                    <div className="space-y-2 mt-4">
                      <label className="text-xs text-slate-400 font-bold uppercase tracking-wider block">Chave PIX (E-mail)</label>
                      <div className="flex gap-2 items-center bg-slate-50 border border-slate-200 rounded-xl p-2.5 pl-4 overflow-hidden">
                        <span className="text-slate-700 font-semibold text-sm truncate flex-1">{PIX_KEY}</span>
                        <button
                          onClick={handleCopyKey}
                          className="flex items-center gap-1.5 justify-center py-2 px-4 rounded-lg bg-white border border-slate-200 hover:border-[#29a8a8] hover:text-[#29a8a8] text-slate-600 text-xs font-bold transition-all shrink-0 active:scale-95 shadow-sm"
                        >
                          {copied ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-500 animate-in zoom-in-50" />
                              <span className="text-emerald-500">Copiada</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copiar</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Botão Confirmação WhatsApp */}
                <div className="border-t border-slate-100 pt-6 flex flex-col items-center gap-3">
                  <a
                    href={getWhatsAppLink()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-3.5 py-4 rounded-2xl bg-emerald-600 text-white font-extrabold text-lg shadow-xl shadow-emerald-600/20 hover:bg-emerald-500 hover:scale-[1.01] active:scale-95 transition-all text-center"
                  >
                    <MessageSquare className="w-6 h-6 shrink-0" />
                    Confirmar e Enviar Comprovante
                  </a>
                  
                  <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-[#29a8a8]" />
                    Processamento direto e seguro via PIX direto para o suporte oficial.
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-center p-8 bg-emerald-50/50 rounded-3xl border border-dashed border-emerald-200">
                <div className="inline-flex bg-emerald-100 p-4 rounded-2xl mb-4 text-emerald-600 shadow-inner">
                  <CheckCircle className="w-10 h-10" />
                </div>
                <h3 className="text-xl font-bold text-slate-800">Isenção Total Disponível!</h3>
                <p className="text-slate-600 mt-2.5 text-sm leading-relaxed max-w-md mx-auto">
                  Parabéns! Você acumulou saldo de indicações suficiente para abater 100% do valor da sua mensalidade.
                </p>
                <a
                  href={`https://wa.me/5521967621494?text=Olá, tenho saldo de indicações suficiente no e-mail ${user?.email} e desejo ativar o plano ${planDisplayName} com isenção total.`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex mt-6 items-center justify-center gap-2 py-3.5 px-8 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all hover:scale-105 active:scale-95 shadow-lg shadow-emerald-600/20 text-sm"
                >
                  <MessageSquare className="w-4 h-4" />
                  Ativar Isenção via WhatsApp
                </a>
              </div>
            )}
          </section>
        </div>

        {/* Sidebar: resumo do pedido */}
        <aside className="lg:col-span-4 sticky top-24">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-lg overflow-hidden">
            <div className="bg-[#29a8a8]/5 border-b border-[#29a8a8]/10 p-6">
              <h3 className="text-slate-900 text-lg font-bold">Resumo da Assinatura</h3>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Plano Selecionado</span>
                  <span className="text-slate-800 font-bold capitalize">{planDisplayName || 'Nenhum'}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Mensalidade Padrão</span>
                  <span className="text-slate-900 font-semibold">{formatCurrency(planPrice || 0)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Taxa de Adesão</span>
                  <span className="text-emerald-600 font-bold uppercase text-[9px] bg-emerald-100/60 px-2.5 py-1 rounded-md">Grátis</span>
                </div>
                {userCredits > 0 && (
                  <div className="flex justify-between items-center text-sm border-t border-slate-50 pt-3">
                    <span className="text-slate-500 font-medium flex items-center gap-1">
                      Bônus de Indicação
                    </span>
                    <span className="text-[#29a8a8] font-bold">- {formatCurrency(userCredits)}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-dashed border-slate-200 pt-6">
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Total a Transferir</span>
                  <span className="text-slate-900 text-3xl font-black tracking-tight">{formatCurrency(finalAmount)}</span>
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-4 flex gap-3 items-start border border-slate-100">
                <Shield className="w-5 h-5 text-[#29a8a8] shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed text-slate-500">
                  Ao assinar, seu acesso é renovado por 30 dias contados a partir da data de ativação manual feita pelo suporte do Recebimento $mart.
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
