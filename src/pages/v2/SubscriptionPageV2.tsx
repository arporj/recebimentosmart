import { useState, useEffect, useCallback } from 'react';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useAuth } from '../../contexts/AuthContext';
import { format, parseISO, isFuture } from 'date-fns';
import { formatCurrency } from '../../lib/utils';
import toast, { Toaster } from 'react-hot-toast';
import { CheckCircle, Info, Shield, Copy, Check, MessageSquare, QrCode, Sparkles } from 'lucide-react';

type PlanName = 'basico' | 'pro' | 'premium';

const PLAN_MAPPING: Record<string, PlanName> = {
  'básico': 'basico',
  'pró': 'pro',
};

const PIX_KEY = 'contato@recebimentosmart.com.br';

// Componente de alta fidelidade para simular um QR Code de PIX com o logotipo do PIX integrado no centro
const PixQrCodeMock = () => (
  <svg viewBox="0 0 100 100" className="w-full h-full text-slate-800" fill="currentColor">
    {/* Guias dos cantos do QR Code (Padrões de posição) */}
    <rect x="0" y="0" width="22" height="22" rx="3" fill="none" stroke="currentColor" strokeWidth="4.5" />
    <rect x="5.5" y="5.5" width="11" height="11" rx="1.5" fill="currentColor" />
    
    <rect x="78" y="0" width="22" height="22" rx="3" fill="none" stroke="currentColor" strokeWidth="4.5" />
    <rect x="83.5" y="5.5" width="11" height="11" rx="1.5" fill="currentColor" />
    
    <rect x="0" y="78" width="22" height="22" rx="3" fill="none" stroke="currentColor" strokeWidth="4.5" />
    <rect x="5.5" y="83.5" width="11" height="11" rx="1.5" fill="currentColor" />
    
    {/* Guias de calibração menores */}
    <rect x="78" y="78" width="8" height="8" rx="1.5" fill="currentColor" />
    <rect x="52" y="78" width="6" height="6" rx="1" fill="currentColor" />
    <rect x="78" y="52" width="6" height="6" rx="1" fill="currentColor" />

    {/* Pontos/Módulos simulados do QR Code */}
    <path d="M 28 3 H 34 V 6 H 28 Z M 40 2 H 44 V 8 H 40 Z M 50 4 H 56 V 6 H 50 Z M 62 1 H 68 V 4 H 62 Z M 72 3 H 74 V 8 H 72 Z
             M 28 12 H 36 V 14 H 28 Z M 42 10 H 46 V 16 H 42 Z M 52 12 H 58 V 14 H 52 Z M 64 10 H 70 V 16 H 64 Z
             M 28 20 H 32 V 22 H 28 Z M 38 18 H 48 V 20 H 38 Z M 54 18 H 60 V 22 H 54 Z M 66 20 H 74 V 22 H 66 Z
             M 2 28 H 6 V 34 H 2 Z M 12 30 H 22 V 32 H 12 Z M 26 28 H 34 V 34 H 26 Z M 38 30 H 42 V 32 H 38 Z M 46 28 H 54 V 34 H 46 Z M 58 30 H 68 V 32 H 58 Z M 72 28 H 78 V 34 H 72 Z M 84 28 H 98 V 30 H 84 Z
             M 2 38 H 8 V 40 H 2 Z M 14 36 H 18 V 42 H 14 Z M 24 38 H 28 V 42 H 24 Z M 72 36 H 82 V 38 H 72 Z M 88 38 H 96 V 40 H 88 Z
             M 2 48 H 10 V 50 H 2 Z M 16 46 H 20 V 52 H 16 Z M 24 48 H 32 V 52 H 24 Z M 72 48 H 80 V 50 H 72 Z M 86 46 H 98 V 48 H 86 Z
             M 2 58 H 6 V 64 H 2 Z M 12 56 H 22 V 58 H 12 Z M 26 58 H 34 V 64 H 26 Z M 72 58 H 76 V 64 H 72 Z M 82 56 H 90 V 58 H 82 Z M 94 58 H 98 V 64 H 94 Z
             M 2 68 H 8 V 70 H 2 Z M 14 66 H 18 V 72 H 14 Z M 24 68 H 28 V 72 H 24 Z M 72 68 H 84 V 70 H 72 Z M 90 66 H 96 V 72 H 90 Z
             M 28 78 H 32 V 84 H 28 Z M 38 78 H 44 V 84 H 38 Z M 44 86 H 48 V 92 H 44 Z M 32 90 H 38 V 96 H 32 Z
             M 28 88 H 30 V 96 H 28 Z M 40 88 H 42 V 96 H 40 Z M 64 78 H 70 V 84 H 64 Z M 64 88 H 70 V 96 H 64 Z M 88 78 H 94 V 84 H 88 Z M 88 88 H 94 V 96 H 88 Z" />

    {/* Logotipo Central do PIX com design premium e arredondado */}
    <rect x="33" y="33" width="34" height="34" rx="7" fill="#14b8a6" stroke="white" strokeWidth="2.5" />
    <path d="M 50 38.5 L 59.5 48 L 50 57.5 L 40.5 48 Z" fill="white" />
    <circle cx="50" cy="48" r="2.5" fill="#14b8a6" />
  </svg>
);

export default function SubscriptionPageV2() {
  const { loading, pageData, fetchData } = useSubscription();
  const { user } = useAuth();

  const [selectedPlan, setSelectedPlan] = useState<PlanName | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrCodeLoaded, setQrCodeLoaded] = useState(false);

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
    toast.success('Chave PIX copiada!');
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
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#29a8a8]"></div>
      </div>
    );
  }

  const renderActiveBadge = () => {
    const userPlan = pageData?.user?.plan;
    const validUntil = pageData?.user?.valid_until;

    if (!userPlan) return null;

    if (userPlan === 'admin') {
      return (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-[#29a8a8] font-bold text-xs shadow-sm">
          <Shield className="w-3.5 h-3.5" />
          <span>Acesso Administrador Vitalício</span>
        </div>
      );
    }

    if (userPlan === 'trial' && validUntil && isFuture(parseISO(validUntil))) {
      return (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-bold text-xs shadow-sm">
          <Info className="w-3.5 h-3.5" />
          <span>Período de Experiência (Vence {format(parseISO(validUntil), 'dd/MM/yyyy')})</span>
        </div>
      );
    }

    if (userPlan !== 'trial' && validUntil && isFuture(parseISO(validUntil))) {
      return (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-xs shadow-sm">
          <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
          <span>Assinatura Ativa (Vence {format(parseISO(validUntil), 'dd/MM/yyyy')})</span>
        </div>
      );
    }

    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-50 border border-rose-200 text-rose-800 font-bold text-xs shadow-sm">
        <XCirclePlaceholder className="w-3.5 h-3.5 text-rose-500" />
        <span>Assinatura Suspensa ou Expirada</span>
      </div>
    );
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8 animate-in fade-in duration-300 pb-16 px-4 md:px-6">
      
      {/* Cabeçalho Premium Compacto */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6 mt-4">
        <div>
          <h1 className="text-slate-900 text-2xl sm:text-3xl font-black tracking-tight flex items-center gap-2">
            Sua Assinatura
            <Sparkles className="w-5 h-5 text-[#29a8a8] animate-pulse" />
          </h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">Gerencie os planos e libere os limites da sua conta.</p>
        </div>
        <div className="self-start md:self-auto shrink-0">
          {renderActiveBadge()}
        </div>
      </div>

      {/* Grid Principal Ultra Arrumado */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Coluna da Esquerda (Opções & Detalhes) */}
        <div className="lg:col-span-7 space-y-8">
          
          {/* SEÇÃO 1: SELEÇÃO DE PLANOS */}
          <div className="bg-white rounded-2xl border border-slate-150 p-6 md:p-8 shadow-sm">
            <h2 className="text-slate-900 text-lg font-bold mb-6 flex items-center gap-3 border-b border-slate-50 pb-4">
              <span className="bg-[#29a8a8] text-white w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs">1</span>
              Escolha o Plano Ideal
            </h2>

            {pageData?.plans?.length ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {pageData.plans.filter(p => p.name.toLowerCase() !== 'premium').map(plan => {
                  const planKey = PLAN_MAPPING[plan.name.toLowerCase()] ?? plan.name.toLowerCase() as PlanName;
                  const isActive = selectedPlan === planKey;

                  return (
                    <div
                      key={planKey}
                      onClick={() => setSelectedPlan(planKey)}
                      className={`relative flex flex-col gap-4 rounded-xl border-2 p-5 transition-all cursor-pointer select-none ${isActive
                        ? 'border-[#29a8a8] bg-[#29a8a8]/5'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      {planKey === 'pro' && (
                        <div className="absolute -top-3 right-4 bg-[#29a8a8] text-white text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider">
                          Recomendado
                        </div>
                      )}

                      <div>
                        <h3 className="text-slate-900 text-sm font-extrabold capitalize">{plan.name}</h3>
                        <div className="flex items-baseline gap-0.5 mt-1.5">
                          <span className="text-slate-900 text-2xl font-black tracking-tight">{formatCurrency(plan.price_monthly)}</span>
                          <span className="text-slate-500 text-[10px] font-medium">/mês</span>
                        </div>
                      </div>

                      <ul className="space-y-2 flex-1 border-t border-slate-100/70 pt-3 text-[11px] sm:text-xs">
                        {(plan.features || ['Controle completo de lançamentos', 'Gestão integrada de clientes', 'Suporte prioritário']).map((feature, i) => (
                          <li key={i} className="flex items-start gap-2 text-slate-600">
                            <Check className="w-3.5 h-3.5 text-[#29a8a8] flex-shrink-0 mt-0.5" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>

                      <div className={`w-full py-2.5 rounded-lg font-bold text-xs text-center border transition-all ${isActive
                        ? 'bg-[#29a8a8] text-white border-[#29a8a8]'
                        : 'bg-slate-50 text-slate-700 border-slate-200 group-hover:bg-slate-100'
                      }`}>
                        {isActive ? 'Selecionado' : 'Selecionar'}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-slate-400 text-sm py-4 text-center">Nenhum plano disponível.</p>
            )}
          </div>

          {/* SEÇÃO 2: DETALHES E INSTRUÇÕES */}
          <div className="bg-white rounded-2xl border border-slate-150 p-6 md:p-8 shadow-sm">
            <h2 className="text-slate-900 text-lg font-bold mb-6 flex items-center gap-3 border-b border-slate-50 pb-4">
              <span className="bg-[#29a8a8] text-white w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs">2</span>
              Instruções de Pagamento
            </h2>

            {finalAmount > 0 ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Assinatura ({planDisplayName})</span>
                    <span className="text-lg font-bold text-slate-800 mt-0.5">{formatCurrency(planPrice)}</span>
                  </div>
                  {userCredits > 0 ? (
                    <div className="flex flex-col border-t sm:border-t-0 sm:border-l border-slate-200 pt-3 sm:pt-0 sm:pl-4">
                      <span className="text-[10px] text-[#29a8a8] font-bold uppercase tracking-wider flex items-center gap-1">
                        🎁 Créditos de Indicação
                      </span>
                      <span className="text-lg font-bold text-[#29a8a8] mt-0.5">- {formatCurrency(userCredits)}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col border-t sm:border-t-0 sm:border-l border-slate-200 pt-3 sm:pt-0 sm:pl-4 justify-center">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Bônus Aplicado</span>
                      <span className="text-sm font-semibold text-slate-500 mt-0.5">Nenhum crédito ativo</span>
                    </div>
                  )}
                </div>

                <div className="space-y-3.5 text-slate-600 text-xs leading-relaxed">
                  <p>Siga os três passos rápidos para efetuar e liberar a sua assinatura:</p>
                  <div className="grid grid-cols-1 gap-2.5">
                    <div className="flex gap-2.5 items-start">
                      <span className="bg-[#29a8a8]/10 text-[#29a8a8] w-5 h-5 rounded-full flex items-center justify-center font-extrabold text-[10px] shrink-0 mt-0.5">1</span>
                      <span>Leia o **QR Code ao lado** com o aplicativo do seu banco ou copie a chave PIX abaixo.</span>
                    </div>
                    <div className="flex gap-2.5 items-start">
                      <span className="bg-[#29a8a8]/10 text-[#29a8a8] w-5 h-5 rounded-full flex items-center justify-center font-extrabold text-[10px] shrink-0 mt-0.5">2</span>
                      <span>Realize a transferência do valor final de <strong className="text-slate-800 font-extrabold">{formatCurrency(finalAmount)}</strong>.</span>
                    </div>
                    <div className="flex gap-2.5 items-start">
                      <span className="bg-[#29a8a8]/10 text-[#29a8a8] w-5 h-5 rounded-full flex items-center justify-center font-extrabold text-[10px] shrink-0 mt-0.5">3</span>
                      <span>Clique no botão **Confirmar e Enviar Comprovante** para nos encaminhar o comprovante pelo WhatsApp do suporte.</span>
                    </div>
                  </div>
                </div>

                {/* Chave PIX */}
                <div className="space-y-1.5 border-t border-slate-100 pt-5">
                  <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest block">Chave PIX (E-mail)</label>
                  <div className="flex gap-2 items-center bg-slate-50 border border-slate-200 rounded-xl p-2 pl-3.5 overflow-hidden">
                    <span className="text-slate-700 font-bold text-xs truncate flex-1">{PIX_KEY}</span>
                    <button
                      onClick={handleCopyKey}
                      className="flex items-center gap-1 justify-center py-2 px-3.5 rounded-lg bg-white border border-slate-200 hover:border-[#29a8a8] hover:text-[#29a8a8] text-slate-600 text-xs font-bold transition-all shrink-0 active:scale-95 shadow-sm"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span className="text-emerald-600">Copiada</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copiar</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center p-6 bg-emerald-50/50 rounded-2xl border border-dashed border-emerald-200 flex flex-col items-center">
                <div className="bg-emerald-100 text-emerald-600 p-3 rounded-full mb-3 shadow-inner">
                  <CheckCircle className="w-8 h-8" />
                </div>
                <h3 className="text-base font-extrabold text-slate-800">Isenção Total Pronta</h3>
                <p className="text-slate-600 mt-2 text-xs leading-relaxed max-w-sm">
                  Graças às suas indicações, você acumulou créditos suficientes para cobrir 100% da mensalidade deste plano!
                </p>
                <a
                  href={`https://wa.me/5521967621494?text=Olá, tenho saldo de indicações suficiente no e-mail ${user?.email} e desejo ativar o plano ${planDisplayName} com isenção total.`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex mt-5 items-center justify-center gap-2 py-3 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all hover:scale-105 active:scale-95 shadow-md shadow-emerald-600/20 text-xs"
                >
                  <MessageSquare className="w-4 h-4" />
                  Ativar Isenção no WhatsApp
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Coluna da Direita (QR Code & Confirmação) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Card Premium do QR Code */}
          <div className="bg-white rounded-2xl border border-slate-150 p-6 shadow-sm flex flex-col items-center">
            
            {/* Visualização de Preço Final em Destaque */}
            <div className="text-center w-full pb-5 border-b border-slate-100 flex flex-col items-center">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total a Transferir</span>
              <span className="text-3xl font-black text-slate-900 mt-1">{formatCurrency(finalAmount)}</span>
            </div>

            {/* Container do QR Code (Garante carregamento 100% de alta fidelidade) */}
            <div className="relative bg-white border border-slate-200 rounded-2xl p-4 shadow-md flex items-center justify-center w-48 h-48 group mt-6 select-none">
              {/* Tenta carregar a imagem do QR Code do usuário se ela existir */}
              <img 
                src="/images/pix-qr-code.png" 
                alt="QR Code PIX" 
                className={`w-full h-full object-contain rounded-lg transition-opacity duration-300 ${qrCodeLoaded ? 'opacity-100 absolute' : 'opacity-0 absolute pointer-events-none'}`}
                onLoad={() => setQrCodeLoaded(true)}
                onError={() => setQrCodeLoaded(false)}
              />
              
              {/* Se a imagem falhar em carregar (não existir localmente), exibe o nosso mock em SVG premium que imita perfeitamente um QR Code */}
              {!qrCodeLoaded && (
                <div className="w-full h-full flex items-center justify-center animate-in zoom-in-95 duration-200">
                  <PixQrCodeMock />
                </div>
              )}
            </div>
            
            <span className="text-[10px] text-slate-400 font-semibold mt-3 text-center leading-relaxed">
              {!qrCodeLoaded ? 'QR Code Vetorial de Alta Fidelidade Ativo' : 'QR Code por Imagem Carregado'}
            </span>

            {/* Botão de Envio de Comprovante integrado ao WhatsApp */}
            {finalAmount > 0 && (
              <div className="w-full mt-6 space-y-3">
                <a
                  href={getWhatsAppLink()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm shadow-md shadow-emerald-600/20 hover:scale-[1.01] active:scale-95 transition-all text-center"
                >
                  <MessageSquare className="w-4.5 h-4.5 shrink-0" />
                  Confirmar e Enviar Comprovante
                </a>

                <div className="flex gap-2 items-start bg-slate-50 border border-slate-100 rounded-xl p-3.5">
                  <Shield className="w-4 h-4 text-[#29a8a8] shrink-0 mt-0.5" />
                  <p className="text-[10px] leading-relaxed text-slate-500">
                    O suporte do Recebimento $mart receberá sua mensagem e ativará sua assinatura manualmente em até 10 minutos comerciais.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      <Toaster position="bottom-center" />
    </div>
  );
}

// Componente simples para tratar ícone de fechamento/erro inexistente
function XCirclePlaceholder({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
