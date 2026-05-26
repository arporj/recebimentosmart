import { useState, useEffect, useCallback } from 'react';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useAuth } from '../../contexts/AuthContext';
import { format, parseISO, isFuture } from 'date-fns';
import { formatCurrency } from '../../lib/utils';
import toast from 'react-hot-toast';
import { CheckCircle, Info, Shield, Copy, Check, MessageSquare, Sparkles, AlertCircle, HelpCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import axios from 'axios';

type PlanName = 'free' | 'basico' | 'pro';

const PLAN_MAPPING: Record<string, PlanName> = {
  'free': 'free',
  'básico': 'basico',
  'basico': 'basico',
  'pró': 'pro',
  'pro': 'pro',
};

// Chave CNPJ oficial do usuário formatada para exibição
const PIX_DISPLAY_KEY = '37.905.181/0001-05';
const PIX_CLEAN_KEY = '37905181000105';

// Função de cálculo de CRC16 CCITT exigido no padrão BR Code do Banco Central para fallback offline
function calculateCRC16(str: string): string {
  let crc = 0xFFFF;
  const polynomial = 0x1021;

  for (let i = 0; i < str.length; i++) {
    const b = str.charCodeAt(i);
    for (let j = 0; j < 8; j++) {
      const bit = ((b >> (7 - j)) & 1) === 1;
      const c15 = ((crc >> 15) & 1) === 1;
      crc <<= 1;
      if (bit !== c15) {
        crc ^= polynomial;
      }
    }
  }

  crc &= 0xFFFF;
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Gera o código do PIX "Copia e Cola" (BR Code) para fallback offline do frontend
const generatePixPayload = (amount: number): string => {
  const name = "Recebimento Smart";
  const city = "Rio de Janeiro";
  
  const merchantAccountInfo = `0014br.gov.bcb.pix0114${PIX_CLEAN_KEY}`;
  const amountStr = amount.toFixed(2);
  const amountTag = `54${amountStr.length.toString().padStart(2, '0')}${amountStr}`;
  
  let payload = "000201" + 
                `26${merchantAccountInfo.length.toString().padStart(2, '0')}${merchantAccountInfo}` + 
                "52040000" + 
                "5303986" + 
                amountTag + 
                "5802BR" + 
                `59${name.length.toString().padStart(2, '0')}${name}` + 
                `60${city.length.toString().padStart(2, '0')}${city}` + 
                "62070503***" + 
                "6304";
                
  const crc = calculateCRC16(payload);
  return payload + crc;
};

interface PlanFeatureList {
  free: string[];
  basico: string[];
  pro: string[];
}

const STATIC_PLAN_FEATURES: PlanFeatureList = {
  free: [
    'Até 15 clientes cadastrados',
    'Até 30 transações mensais',
    'Máximo 2 contas bancárias',
    'Até 10 tags para organização',
    'Exibição de anúncios',
  ],
  basico: [
    'Controle de até 50 clientes',
    'Transações e lançamentos ilimitados',
    'Bancos e contas ilimitadas',
    'Campos personalizados nos cadastros',
    'Sem exibição de anúncios',
  ],
  pro: [
    'Clientes e contatos ilimitados',
    'Transações e contas ilimitadas',
    'Painel de relatórios detalhados',
    'Campos personalizados completos',
    'Suporte prioritário via WhatsApp',
  ]
};

export default function SubscriptionPageV2() {
  const { loading, pageData, fetchData } = useSubscription();
  const { user } = useAuth();

  const [selectedPlan, setSelectedPlan] = useState<PlanName>('basico');
  const [copied, setCopied] = useState(false);
  const [qrCodeLoaded, setQrCodeLoaded] = useState(false);

  // Estados específicos para integração da API do Banco Inter
  const [loadingPix, setLoadingPix] = useState(false);
  const [pixData, setPixData] = useState<{ txid: string; pixCopiaECola: string; simulated?: boolean } | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  // Força a atualização de dados da assinatura ao abrir a tela
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Sincroniza e define o plano selecionado por padrão baseado no plano atual do usuário
  useEffect(() => {
    if (pageData) {
      const userPlanRaw = pageData.user?.plan?.toLowerCase() || '';
      const mappedUserPlan = PLAN_MAPPING[userPlanRaw];
      
      if (mappedUserPlan && mappedUserPlan !== 'premium') {
        setSelectedPlan(mappedUserPlan);
      } else {
        setSelectedPlan('basico'); // Fallback padrão
      }
    }
  }, [pageData]);

  const getSelectedPlanObj = useCallback(() => {
    if (!pageData?.plans) return null;
    return pageData.plans.find(p => {
      const planKey = PLAN_MAPPING[p.name.toLowerCase()] ?? p.name.toLowerCase() as PlanName;
      return planKey === selectedPlan;
    });
  }, [selectedPlan, pageData]);

  const currentPlanObj = getSelectedPlanObj();
  const planPrice = currentPlanObj?.price_monthly ?? (selectedPlan === 'free' ? 0 : selectedPlan === 'basico' ? 9.90 : 24.90);
  const userCredits = pageData?.user?.credits ?? 0;
  const finalAmount = Math.max(0, planPrice - userCredits);
  const planDisplayName = currentPlanObj?.name ?? (selectedPlan === 'free' ? 'Free' : selectedPlan === 'basico' ? 'Básico' : 'Pró');

  const userPlanRaw = pageData?.user?.plan?.toLowerCase() || '';
  const userPlanActive = PLAN_MAPPING[userPlanRaw] || 'free';

  // Geração dinâmica de PIX conectando com nosso backend Express
  useEffect(() => {
    if (selectedPlan === 'free' || !user?.id || selectedPlan === userPlanActive) {
      setPixData(null);
      return;
    }

    const fetchDynamicPix = async () => {
      try {
        setLoadingPix(true);
        setQrCodeLoaded(false);

        console.log(`[PIX] Solicitando geração de PIX para o plano ${planDisplayName}. Valor original: R$ ${finalAmount}`);
        
        const response = await axios.post('/api/pix/create-payment', {
          amount: finalAmount,
          planName: planDisplayName,
          userId: user.id
        });

        if (response.data && response.data.success) {
          setPixData({
            txid: response.data.txid,
            pixCopiaECola: response.data.pixCopiaECola,
            simulated: response.data.simulated
          });
        }
      } catch (error) {
        console.error('[PIX] Erro ao chamar API do Banco Inter, usando fallback local:', error);
        toast.error('Erro de conexão financeira. Utilizando gerador local redundante.');
        
        // Fallback local robusto (offline) para manter o sistema operacional em qualquer falha externa
        const fallbackPayload = generatePixPayload(finalAmount);
        setPixData({
          txid: 'LOCAL_' + Date.now() + Math.floor(Math.random() * 1000),
          pixCopiaECola: fallbackPayload,
          simulated: false
        });
      } finally {
        setLoadingPix(false);
      }
    };

    // Debounce sutil para evitar múltiplos requests ao alternar cliques rapidamente
    const timer = setTimeout(() => {
      fetchDynamicPix();
    }, 300);

    return () => clearTimeout(timer);
  }, [selectedPlan, finalAmount, planDisplayName, user?.id, userPlanActive]);

  // Escuta ativa em Tempo Real no Supabase para aprovação automática do webhook do Banco Inter
  useEffect(() => {
    if (!pixData?.txid || !user?.id || paymentSuccess) return;

    console.log(`[Realtime] Registrando escuta de canal Supabase para transação: ${pixData.txid}`);

    const channel = supabase
      .channel(`pix_checkout_${pixData.txid}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pix_transactions',
          filter: `transaction_id=eq.${pixData.txid}`
        },
        (payload) => {
          console.log('[Realtime] Mudança de status na transação recebida:', payload);
          if (payload.new && payload.new.status === 'COMPLETED') {
            setPaymentSuccess(true);
            setPixData(null);
            fetchData();
          }
        }
      )
      .subscribe();

    // Fallback de Polling: Caso o WebSocket seja bloqueado ou falhe, consultamos a cada 4 segundos
    const pollInterval = setInterval(async () => {
      try {
        console.log(`[Polling] Verificando confirmação do pagamento no banco para txid: ${pixData.txid}`);
        const { data, error } = await supabase
          .from('pix_transactions')
          .select('status')
          .eq('transaction_id', pixData.txid)
          .maybeSingle();

        if (error) {
          console.warn('[Polling] Erro na verificação do Pix:', error.message);
          return;
        }

        if (data && data.status === 'COMPLETED') {
          console.log('[Polling] Sucesso! Pagamento confirmado via polling.');
          setPaymentSuccess(true);
          setPixData(null);
          fetchData();
        }
      } catch (err) {
        console.error('[Polling] Falha crítica de verificação:', err);
      }
    }, 4000);

    return () => {
      console.log(`[Realtime] Removendo canal de escuta e limpando polling: ${pixData.txid}`);
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [pixData?.txid, user?.id, paymentSuccess, fetchData]);

  // Função exclusiva de Sandbox para simulação de recebimento de webhook do Inter
  const handleSimulatePayment = async () => {
    if (!pixData?.txid) return;

    try {
      setSimulating(true);
      console.log(`[Sandbox] Disparando requisição de simulação de webhook para txid: ${pixData.txid}`);
      
      const response = await axios.post('/api/pix/simulate-webhook', {
        txid: pixData.txid
      });

      if (response.data && response.data.success) {
        toast.success('Pagamento simulado enviado com sucesso! Processando ativação...', { duration: 4000 });
      }
    } catch (error) {
      console.error('[Sandbox] Erro ao simular pagamento de webhook:', error);
      toast.error('Não foi possível disparar a simulação do webhook.');
    } finally {
      setSimulating(false);
    }
  };

  const handleCopyKey = () => {
    if (!pixData?.pixCopiaECola) return;
    navigator.clipboard.writeText(pixData.pixCopiaECola);
    setCopied(true);
    toast.success('Código PIX Copia e Cola copiado para a área de transferência!');
    setTimeout(() => setCopied(false), 3000);
  };

  // Gera o link do WhatsApp para envio manual do comprovante em caso de contingência
  const getWhatsAppLink = () => {
    const formattedAmount = formatCurrency(finalAmount);
    const email = user?.email ?? 'N/A';
    const text = `Olá! Realizei o pagamento via PIX para o Recebimento $mart.%0A%0A• *Plano selecionado:* ${planDisplayName}%0A• *Valor pago:* ${formattedAmount}%0A• *Minha Conta (E-mail):* ${email}%0A%0ASegue em anexo o comprovante de pagamento para ativação imediata!`;
    return `https://wa.me/5521967621494?text=${text}`;
  };

  // Filtra e ordena os planos na ordem exata exigida: Free (1º), Básico (2º) e Pró (3º)
  const getOrderedPlans = () => {
    if (!pageData?.plans) return [];
    const order = ['free', 'basico', 'pro'];
    return [...pageData.plans]
      .filter(p => p.name.toLowerCase() !== 'premium')
      .sort((a, b) => {
        const keyA = PLAN_MAPPING[a.name.toLowerCase()] || 'free';
        const keyB = PLAN_MAPPING[b.name.toLowerCase()] || 'free';
        return order.indexOf(keyA) - order.indexOf(keyB);
      });
  };

  const orderedPlans = getOrderedPlans();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#29a8a8]"></div>
      </div>
    );
  }

  // ─── TELA DE SUCESSO PREMIUM (Aprovação Instantânea Realtime) ───
  if (paymentSuccess) {
    return (
      <div className="w-full max-w-2xl mx-auto space-y-8 animate-in zoom-in-95 duration-500 pb-20 px-4 font-['Inter',sans-serif] text-center">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 md:p-12 shadow-xl space-y-6 flex flex-col items-center">
          <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center border border-emerald-100 text-emerald-500 shadow-sm animate-bounce">
            <CheckCircle size={44} />
          </div>
          
          <div className="space-y-2">
            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-black px-3.5 py-1.5 rounded-full uppercase tracking-widest shadow-sm">
              Assinatura Ativada
            </span>
            <h1 className="text-slate-900 text-3xl font-black tracking-tight mt-3">
              Parabéns! Sua conta está liberada!
            </h1>
            <p className="text-slate-500 text-sm max-w-md mx-auto leading-relaxed">
              Seu pagamento via PIX foi confirmado automaticamente pelo Banco Inter. O plano **{planDisplayName}** já está ativo em sua conta.
            </p>
          </div>

          <div className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 text-left text-xs space-y-2.5 max-w-sm">
            <div className="flex justify-between">
              <span className="text-slate-400 font-bold">Plano Contratado:</span>
              <span className="text-slate-800 font-black capitalize">{planDisplayName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 font-bold">Método de Ativação:</span>
              <span className="text-slate-800 font-bold flex items-center gap-1">
                <Shield className="w-3.5 h-3.5 text-[#29a8a8]" />
                Banco Inter PJ mTLS Webhook
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 font-bold">Período de Acesso:</span>
              <span className="text-emerald-600 font-extrabold">+31 dias habilitados</span>
            </div>
          </div>

          <div className="pt-4 w-full max-w-sm space-y-3">
            <button
              onClick={() => {
                window.location.href = '/';
              }}
              className="w-full py-4 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-sm shadow-md transition-all active:scale-95 cursor-pointer block text-center"
            >
              Acessar o Painel Principal
            </button>
            
            <button
              onClick={() => {
                setPaymentSuccess(false);
                setPixData(null);
                fetchData();
              }}
              className="w-full py-3 rounded-2xl bg-white border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition-all cursor-pointer"
            >
              Ver Detalhes do Plano
            </button>
          </div>
        </div>
      </div>
    );
  }

  const userValidUntil = pageData?.user?.valid_until;

  // URL dinâmica para renderizar o QR Code gerado pelo Inter
  const pixQrCodeUrl = pixData?.pixCopiaECola
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(pixData.pixCopiaECola)}`
    : '';

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20 px-4 md:px-6 font-['Inter',sans-serif]">
      
      {/* ─── CABEÇALHO & STATUS DO PLANO ─── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-slate-900 text-2xl font-black tracking-tight flex items-center gap-2">
            Configuração de Assinatura
            <Sparkles className="w-5 h-5 text-[#29a8a8] animate-pulse" />
          </h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-0.5">Selecione seu plano de uso e realize o pagamento com ativação automática em tempo real.</p>
        </div>

        <div className="shrink-0 flex items-center">
          {userPlanRaw === 'admin' ? (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-[#29a8a8] font-bold text-xs shadow-sm">
              <Shield className="w-4 h-4" />
              <span>Acesso Administrador Habilitado</span>
            </div>
          ) : userPlanRaw === 'trial' && userValidUntil && isFuture(parseISO(userValidUntil)) ? (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 font-bold text-xs shadow-sm">
              <Info className="w-4 h-4 text-amber-600" />
              <span>Período de Experiência (Expira em {format(parseISO(userValidUntil), 'dd/MM/yyyy')})</span>
            </div>
          ) : userPlanRaw !== 'trial' && userValidUntil && isFuture(parseISO(userValidUntil)) ? (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-xs shadow-sm">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <span>Assinatura Ativa (Vence em {format(parseISO(userValidUntil), 'dd/MM/yyyy')})</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-bold text-xs shadow-sm">
              <AlertCircle className="w-4 h-4 text-rose-600" />
              <span>Sua conta está no plano gratuito (Free)</span>
            </div>
          )}
        </div>
      </div>

      {/* ─── PAINEL DE PREÇOS (HORIZONTAL E EM ORDEM ESTREITA: Free, Básico, Pró) ─── */}
      <div className="space-y-4">
        <h2 className="text-slate-800 font-black text-lg tracking-tight pl-1">Planos Disponíveis</h2>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {orderedPlans.map(plan => {
            const planKey = PLAN_MAPPING[plan.name.toLowerCase()] || 'free';
            const isSelected = selectedPlan === planKey;
            const isUserCurrent = userPlanActive === planKey && userPlanRaw !== 'admin';
            const price = plan.price_monthly;

            return (
              <div
                key={plan.id || planKey}
                onClick={() => setSelectedPlan(planKey)}
                className={`relative flex flex-col gap-6 rounded-2xl border-2 p-6 md:p-8 transition-all cursor-pointer bg-white shadow-sm select-none hover:shadow-md ${
                  isSelected
                    ? 'border-[#29a8a8] ring-4 ring-[#29a8a8]/5'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {planKey === 'pro' && (
                  <div className="absolute -top-3 right-6 bg-[#29a8a8] text-white text-[9px] font-black px-3.5 py-1.5 rounded-full uppercase tracking-widest shadow-md shadow-[#29a8a8]/20">
                    Recomendado
                  </div>
                )}
                {isUserCurrent && (
                  <div className="absolute -top-3 left-6 bg-slate-900 text-white text-[9px] font-black px-3.5 py-1.5 rounded-full uppercase tracking-widest border border-slate-800 shadow-sm">
                    Seu Plano Atual
                  </div>
                )}

                <div className="space-y-2">
                  <h3 className="text-slate-900 font-black text-lg capitalize">{plan.name}</h3>
                  <p className="text-slate-400 text-xs font-semibold leading-relaxed">
                    {planKey === 'free' ? 'Ideal para testar a ferramenta e controle simples.' : planKey === 'basico' ? 'O empurrão financeiro que seu negócio precisa.' : 'Controle total e sem limites para quem quer crescer.'}
                  </p>
                  <div className="flex items-baseline gap-0.5 pt-3">
                    <span className="text-slate-900 text-3xl font-black tracking-tight">{formatCurrency(price)}</span>
                    <span className="text-slate-400 text-xs font-bold">/mês</span>
                  </div>
                </div>

                <ul className="space-y-3 flex-1 border-t border-slate-100 pt-5 text-xs">
                  {(STATIC_PLAN_FEATURES[planKey] || []).map((feature, i) => (
                    <li key={`${planKey}-feature-${i}`} className="flex items-start gap-2.5 text-slate-600">
                      <Check className="w-4 h-4 text-[#29a8a8] shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button className={`w-full py-3.5 rounded-xl font-bold text-xs transition-all ${
                  isSelected
                    ? 'bg-[#29a8a8] text-white shadow-lg shadow-[#29a8a8]/25'
                    : 'bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                }`}>
                  {isUserCurrent ? 'Plano Ativo' : isSelected ? 'Plano Selecionado' : 'Selecionar'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── PAINEL CENTRAL DE PAGAMENTO (INTEGRADO À API BANCO INTER) ─── */}
      {selectedPlan !== 'free' && selectedPlan !== userPlanActive && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-sm space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
          
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <span className="bg-[#29a8a8] text-white w-7 h-7 rounded-full flex items-center justify-center font-black text-sm shadow-sm">PIX</span>
            <div>
              <h2 className="text-slate-900 text-lg font-black tracking-tight">Pagamento da Assinatura ({planDisplayName})</h2>
              <p className="text-slate-400 text-[11px] font-semibold mt-0.5">Cobrança gerada e validada em tempo real diretamente na API do Banco Inter.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Coluna da Esquerda: Resumo de preço e Instruções */}
            <div className="lg:col-span-7 space-y-6">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 border border-slate-100 rounded-xl p-5">
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Valor do Plano</span>
                  <span className="text-xl font-black text-slate-800 mt-1">{formatCurrency(planPrice)}</span>
                </div>
                
                {userCredits > 0 ? (
                  <div className="flex flex-col border-t sm:border-t-0 sm:border-l border-slate-200 pt-3 sm:pt-0 sm:pl-5">
                    <span className="text-[10px] text-[#29a8a8] font-bold uppercase tracking-wider">🎁 Desconto (Créditos)</span>
                    <span className="text-xl font-black text-[#29a8a8] mt-1">- {formatCurrency(userCredits)}</span>
                  </div>
                ) : (
                  <div className="flex flex-col border-t sm:border-t-0 sm:border-l border-slate-200 pt-3 sm:pt-0 sm:pl-5 justify-center">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Créditos de Indicação</span>
                    <span className="text-xs text-slate-500 font-semibold mt-1">Nenhum bônus acumulado</span>
                  </div>
                )}
              </div>

              <div className="border border-slate-100 rounded-xl p-5 flex items-center justify-between bg-teal-50/15">
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Valor total a transferir</span>
                  <span className="text-2xl font-black text-slate-900 mt-1">{formatCurrency(finalAmount)}</span>
                </div>
                <div className="bg-[#29a8a8]/10 text-[#29a8a8] p-2 rounded-lg shrink-0">
                  <Sparkles size={20} className="animate-pulse" />
                </div>
              </div>

              <div className="space-y-3.5">
                <h4 className="text-slate-800 font-extrabold text-sm">Instruções para liberação:</h4>
                <div className="grid grid-cols-1 gap-2.5 text-xs text-slate-600 pl-1 leading-relaxed">
                  <div className="flex gap-2.5 items-start">
                    <span className="bg-[#29a8a8]/10 text-[#29a8a8] w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0">1</span>
                    <span>Abra o app do seu banco de preferência, selecione **Pagar via Pix** e aponte a câmera para o **QR Code dinâmico**.</span>
                  </div>
                  <div className="flex gap-2.5 items-start">
                    <span className="bg-[#29a8a8]/10 text-[#29a8a8] w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0">2</span>
                    <span>Se preferir pagar pelo celular, copie o código Pix `copia e cola` no campo abaixo e insira no app do seu banco.</span>
                  </div>
                  <div className="flex gap-2.5 items-start text-emerald-600 font-bold">
                    <span className="bg-emerald-50 text-emerald-600 w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0">3</span>
                    <span>**Ativação Instantânea:** Assim que o PIX for compensado, o sistema atualizará sua conta em tempo real automaticamente!</span>
                  </div>
                </div>
              </div>

              {/* Chave PIX copia/cola */}
              <div className="space-y-2 border-t border-slate-100 pt-5">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest block">Código PIX (Copia e Cola)</span>
                  <span className="text-[10px] text-slate-500 font-bold block">Chave CNPJ: {PIX_DISPLAY_KEY}</span>
                </div>
                
                <div className="flex gap-2 items-center bg-slate-50 border border-slate-200 rounded-xl p-2 pl-3.5 overflow-hidden min-h-[52px]">
                  {loadingPix ? (
                    <div className="flex items-center gap-2 pl-2 text-slate-400 text-xs">
                      <div className="animate-spin rounded-full h-4.5 w-4.5 border-b-2 border-[#29a8a8]"></div>
                      <span>Solicitando BR Code seguro ao Banco Inter...</span>
                    </div>
                  ) : pixData?.pixCopiaECola ? (
                    <>
                      <span className="text-slate-500 font-bold text-xs truncate flex-1 leading-relaxed">{pixData.pixCopiaECola}</span>
                      <button
                        onClick={handleCopyKey}
                        className="flex items-center gap-1.5 justify-center py-2 px-4 rounded-lg bg-white border border-slate-200 hover:border-[#29a8a8] hover:text-[#29a8a8] text-slate-600 text-xs font-bold transition-all shrink-0 active:scale-95 shadow-sm"
                      >
                        {copied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-emerald-600">Copiado</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copiar Código</span>
                          </>
                        )}
                      </button>
                    </>
                  ) : (
                    <span className="text-slate-400 text-xs pl-2 italic">Aguardando geração da cobrança...</span>
                  )}
                </div>
              </div>
            </div>

            {/* Coluna da Direita: QR Code e WhatsApp (40%) */}
            <div className="lg:col-span-5 flex flex-col items-center border-t lg:border-t-0 lg:border-l border-slate-100 pt-6 lg:pt-0 lg:pl-8 space-y-6">
              
              {/* QR Code Container */}
              <div className="flex flex-col items-center">
                <div className="relative bg-white border border-slate-200 rounded-2xl p-4 shadow-md flex items-center justify-center w-48 h-48 select-none overflow-hidden">
                  {loadingPix ? (
                    <div className="absolute inset-0 bg-slate-50/50 flex flex-col items-center justify-center gap-2 text-slate-400 text-[10px] font-bold">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#29a8a8]"></div>
                      <span>Gerando QR Code...</span>
                    </div>
                  ) : pixQrCodeUrl ? (
                    <img 
                      src={pixQrCodeUrl} 
                      alt="QR Code PIX Banco Inter" 
                      className={`w-full h-full object-contain rounded-lg transition-opacity duration-300 ${qrCodeLoaded ? 'opacity-100' : 'opacity-0'}`}
                      onLoad={() => setQrCodeLoaded(true)}
                    />
                  ) : (
                    <div className="text-slate-400 text-xs text-center p-4">Erro ao processar QR Code.</div>
                  )}

                  {pixQrCodeUrl && !qrCodeLoaded && !loadingPix && (
                    <div className="absolute inset-0 bg-slate-50 flex items-center justify-center text-slate-400">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#29a8a8]"></div>
                    </div>
                  )}
                </div>
                
                <span className="text-[10px] text-[#29a8a8] font-black mt-3.5 text-center leading-relaxed flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                  QR Code Dinâmico Ativo
                </span>
              </div>

              {/* Ações e Suporte */}
              {finalAmount > 0 ? (
                <div className="w-full space-y-3.5">
                  {/* Botão de Simulação de Pagamento - Exclusivo para UAT/Sandbox */}
                  {pixData?.txid && (pixData.simulated || import.meta.env.DEV) && (
                    <button
                      onClick={handleSimulatePayment}
                      disabled={simulating}
                      className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-extrabold text-xs shadow-sm hover:scale-[1.01] active:scale-95 transition-all text-center cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4 shrink-0 animate-pulse" />
                      {simulating ? 'Confirmando no Banco...' : 'Simular Confirmação Instantânea (Sandbox)'}
                    </button>
                  )}

                  {/* WhatsApp de fallback de contingência */}
                  <a
                    href={getWhatsAppLink()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs shadow-sm hover:scale-[1.01] active:scale-95 transition-all text-center cursor-pointer"
                  >
                    <MessageSquare className="w-4.5 h-4.5 shrink-0" />
                    Enviar Comprovante de Contingência
                  </a>

                  <div className="flex gap-2 items-start bg-slate-50 border border-slate-100 rounded-xl p-3.5 text-slate-500">
                    <Shield className="w-4 h-4 text-[#29a8a8] shrink-0 mt-0.5" />
                    <p className="text-[10px] leading-relaxed">
                      O sistema monitora a transação em tempo real. Não é necessário enviar o comprovante a menos que ocorra alguma inconsistência com o seu aplicativo bancário.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="w-full bg-emerald-50/50 rounded-xl p-4 border border-dashed border-emerald-200 text-center flex flex-col items-center">
                  <span className="text-xs font-bold text-slate-800">Isenção de Pagamento Habilitada</span>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed max-w-[200px]">Seus créditos acumulados cobrem o valor total do plano contratado.</p>
                  <a
                    href={`https://wa.me/5521967621494?text=Olá, tenho saldo de indicações suficiente no e-mail ${user?.email} e desejo liberar o plano ${planDisplayName} com isenção total.`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex mt-4 items-center justify-center gap-2 py-2.5 px-5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all text-[11px] shadow-sm shadow-emerald-600/20"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Liberar Isenção com Suporte
                  </a>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* FAQs Integradas */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-sm space-y-4">
        <h3 className="text-slate-800 font-extrabold text-sm flex items-center gap-2 border-b border-slate-50 pb-3">
          <HelpCircle className="w-4 h-4 text-[#29a8a8]" />
          Dúvidas sobre a Assinatura?
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-600 leading-relaxed">
          <div>
            <h4 className="font-bold text-slate-800 mb-1">Como funciona a liberação automática via Pix?</h4>
            <p>O processo é totalmente seguro e automatizado. Assim que você realiza o pagamento usando o QR Code ou o código copia e cola, nosso sistema identifica a confirmação em poucos segundos e libera todos os recursos do seu plano imediatamente.</p>
          </div>
          <div>
            <h4 className="font-bold text-slate-800 mb-1">E se meu plano não for liberado na mesma hora?</h4>
            <p>Não se preocupe! Se ocorrer qualquer instabilidade temporária na rede que atrase a liberação automática, basta clicar no botão para nos enviar o comprovante de pagamento. Nossa equipe de suporte fará a ativação manual para você em poucos minutos.</p>
          </div>
        </div>
      </div>

    </div>
  );
}
