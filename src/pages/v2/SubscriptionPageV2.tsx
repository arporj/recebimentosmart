import { useState, useEffect, useCallback } from 'react';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useAuth } from '../../contexts/AuthContext';
import { format, parseISO, isFuture } from 'date-fns';
import { formatCurrency } from '../../lib/utils';
import toast, { Toaster } from 'react-hot-toast';
import { CheckCircle, Info, Shield, Copy, Check, MessageSquare, Sparkles, AlertCircle, HelpCircle } from 'lucide-react';

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
// Chave CNPJ limpa para montagem do BR Code
const PIX_CLEAN_KEY = '37905181000105';

// Função de cálculo de CRC16 CCITT (Polinômio 0x1021, valor inicial 0xFFFF) exigido no padrão BR Code do Banco Central
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

// Gera o código do PIX "Copia e Cola" (BR Code) dinamicamente baseado no valor da assinatura
const generatePixPayload = (amount: number): string => {
  const name = "Recebimento Smart";
  const city = "Rio de Janeiro";
  
  // ID 26: Merchant Account Information - Contém a chave PIX do usuário
  // GUI (00): br.gov.bcb.pix
  // Chave PIX (01): CNPJ
  const merchantAccountInfo = `0014br.gov.bcb.pix0114${PIX_CLEAN_KEY}`;
  
  // ID 54: Transaction Amount - Formata o valor exato com 2 casas decimais e separador ponto (ex: 24.90)
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

  // Gera o código do PIX "Copia e Cola" dinamicamente baseado no valor da mensalidade e créditos deduzidos
  const pixCopyPasteCode = generatePixPayload(finalAmount);

  // Gera a URL da imagem do QR Code a partir de uma API pública gratuita e instantânea
  const pixQrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(pixCopyPasteCode)}`;

  const handleCopyKey = () => {
    navigator.clipboard.writeText(pixCopyPasteCode);
    setCopied(true);
    toast.success('PIX Copia e Cola copiado com sucesso!');
    setTimeout(() => setCopied(false), 3000);
  };

  // Gera o link do WhatsApp para envio do comprovante
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

  const userPlanRaw = pageData?.user?.plan?.toLowerCase() || '';
  const userPlanActive = PLAN_MAPPING[userPlanRaw] || 'free';
  const userValidUntil = pageData?.user?.valid_until;

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20 px-4 md:px-6 font-['Inter',sans-serif]">
      
      {/* ─── CABEÇALHO & STATUS DO PLANO ─── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-slate-900 text-2xl font-black tracking-tight flex items-center gap-2">
            Configuração de Assinatura
            <Sparkles className="w-5 h-5 text-[#29a8a8] animate-pulse" />
          </h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-0.5">Selecione seu plano de uso e realize o pagamento com liberação manual.</p>
        </div>

        {/* Informações da conta atual do usuário */}
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
                key={plan.id}
                onClick={() => setSelectedPlan(planKey)}
                className={`relative flex flex-col gap-6 rounded-2xl border-2 p-6 md:p-8 transition-all cursor-pointer bg-white shadow-sm select-none hover:shadow-md ${
                  isSelected
                    ? 'border-[#29a8a8] ring-4 ring-[#29a8a8]/5'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Badges de destaque */}
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

                {/* Recursos do Plano */}
                <ul className="space-y-3 flex-1 border-t border-slate-100 pt-5 text-xs">
                  {(STATIC_PLAN_FEATURES[planKey] || []).map((feature, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-slate-600">
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

      {/* ─── PAINEL CENTRAL DE PAGAMENTO (FOCADO, ARRUMADO E LIMPO) ─── */}
      {selectedPlan !== 'free' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-sm space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
          
          {/* Título de Pagamento */}
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <span className="bg-[#29a8a8] text-white w-7 h-7 rounded-full flex items-center justify-center font-black text-sm shadow-sm">PIX</span>
            <div>
              <h2 className="text-slate-900 text-lg font-black tracking-tight">Pagamento da Assinatura ({planDisplayName})</h2>
              <p className="text-slate-400 text-[11px] font-semibold mt-0.5">Realize o pagamento escaneando o QR Code dinâmico ou copiando a chave.</p>
            </div>
          </div>

          {/* Grid de Checkout e Instruções */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Coluna da Esquerda: Resumo, Valores e Copia e Cola (60%) */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* Box de detalhamento de preço */}
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

              {/* Total final em destaque */}
              <div className="border border-slate-100 rounded-xl p-5 flex items-center justify-between bg-teal-50/15">
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Valor total a transferir</span>
                  <span className="text-2xl font-black text-slate-900 mt-1">{formatCurrency(finalAmount)}</span>
                </div>
                <div className="bg-[#29a8a8]/10 text-[#29a8a8] p-2 rounded-lg shrink-0">
                  <Sparkles size={20} className="animate-pulse" />
                </div>
              </div>

              {/* Instruções de Pagamento */}
              <div className="space-y-3.5">
                <h4 className="text-slate-800 font-extrabold text-sm">Instruções para liberação:</h4>
                <div className="grid grid-cols-1 gap-2.5 text-xs text-slate-600 pl-1 leading-relaxed">
                  <div className="flex gap-2.5 items-start">
                    <span className="bg-[#29a8a8]/10 text-[#29a8a8] w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0">1</span>
                    <span>Abra o app do seu banco, escolha a opção **PIX** e aponte a câmera para o **QR Code dinâmico ao lado**.</span>
                  </div>
                  <div className="flex gap-2.5 items-start">
                    <span className="bg-[#29a8a8]/10 text-[#29a8a8] w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0">2</span>
                    <span>Se preferir, clique em **Copiar Código PIX** logo abaixo para efetuar a transferência na modalidade *PIX Copia e Cola*.</span>
                  </div>
                  <div className="flex gap-2.5 items-start">
                    <span className="bg-[#29a8a8]/10 text-[#29a8a8] w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0">3</span>
                    <span>Após efetuar o PIX, clique no botão **Confirmar e Enviar Comprovante** para nos encaminhar o comprovante pelo WhatsApp do suporte.</span>
                  </div>
                </div>
              </div>

              {/* Chave PIX copia/cola */}
              <div className="space-y-2 border-t border-slate-100 pt-5">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest block">Código PIX (Copia e Cola)</span>
                  <span className="text-[10px] text-slate-500 font-bold block">Chave CNPJ: {PIX_DISPLAY_KEY}</span>
                </div>
                
                <div className="flex gap-2 items-center bg-slate-50 border border-slate-200 rounded-xl p-2 pl-3.5 overflow-hidden">
                  <span className="text-slate-500 font-bold text-xs truncate flex-1 leading-relaxed">{pixCopyPasteCode}</span>
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
                </div>
              </div>
            </div>

            {/* Coluna da Direita: QR Code Real/Dinâmico e WhatsApp (40%) */}
            <div className="lg:col-span-5 flex flex-col items-center border-t lg:border-t-0 lg:border-l border-slate-100 pt-6 lg:pt-0 lg:pl-8 space-y-6">
              
              {/* QR Code Container (Gera imagem do PIX dinâmica com API pública instantânea) */}
              <div className="flex flex-col items-center">
                <div className="relative bg-white border border-slate-200 rounded-2xl p-4 shadow-md flex items-center justify-center w-48 h-48 select-none overflow-hidden">
                  {/* API pública gera a imagem do QR Code real na hora a partir do payload PIX completo */}
                  <img 
                    src={pixQrCodeUrl} 
                    alt="QR Code PIX Real" 
                    className="w-full h-full object-contain rounded-lg transition-opacity duration-300"
                    onLoad={() => setQrCodeLoaded(true)}
                  />
                  
                  {!qrCodeLoaded && (
                    <div className="absolute inset-0 bg-slate-50 flex items-center justify-center text-slate-400">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#29a8a8]"></div>
                    </div>
                  )}
                </div>
                
                <span className="text-[10px] text-[#29a8a8] font-bold mt-3.5 text-center leading-relaxed flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                  QR Code PIX Dinâmico Ativo (Valor Exato)
                </span>
              </div>

              {/* Ação principal: Botão de confirmação do WhatsApp */}
              {finalAmount > 0 ? (
                <div className="w-full space-y-3">
                  <a
                    href={getWhatsAppLink()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm shadow-md shadow-emerald-600/20 hover:scale-[1.01] active:scale-95 transition-all text-center cursor-pointer animate-pulse"
                  >
                    <MessageSquare className="w-4.5 h-4.5 shrink-0" />
                    Confirmar e Enviar Comprovante
                  </a>

                  <div className="flex gap-2 items-start bg-slate-50 border border-slate-100 rounded-xl p-3.5 text-slate-500">
                    <Shield className="w-4 h-4 text-[#29a8a8] shrink-0 mt-0.5" />
                    <p className="text-[10px] leading-relaxed">
                      Seu plano é ativado em até 10 minutos após o recebimento do seu comprovante pelo suporte oficial.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="w-full bg-emerald-50/50 rounded-xl p-4 border border-dashed border-emerald-200 text-center flex flex-col items-center">
                  <span className="text-xs font-bold text-slate-800">Isenção de Pagamento Pronta</span>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed max-w-[200px]">Você possui créditos de indicação suficientes para isentar este plano!</p>
                  <a
                    href={`https://wa.me/5521967621494?text=Olá, tenho saldo de indicações suficiente no e-mail ${user?.email} e desejo ativar o plano ${planDisplayName} com isenção total.`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex mt-4 items-center justify-center gap-2 py-2.5 px-5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all text-[11px] shadow-sm shadow-emerald-600/20"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Ativar Isenção via WhatsApp
                  </a>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* FAQs Integradas para dar suporte editorial na página de Assinaturas */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-sm space-y-4">
        <h3 className="text-slate-800 font-extrabold text-sm flex items-center gap-2 border-b border-slate-50 pb-3">
          <HelpCircle className="w-4 h-4 text-[#29a8a8]" />
          Dúvidas sobre a Assinatura?
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-600 leading-relaxed">
          <div>
            <h4 className="font-bold text-slate-800 mb-1">Como funciona o pagamento via PIX manual?</h4>
            <p>O PIX manual permite manter custos de transação mínimos, nos permitindo oferecer planos extremamente acessíveis. Você transfere o valor e nos envia o comprovante de forma prática pelo botão do WhatsApp.</p>
          </div>
          <div>
            <h4 className="font-bold text-slate-800 mb-1">O que acontece ao atingir o vencimento da assinatura?</h4>
            <p>Sua conta é suspensa temporariamente, mantendo seus dados cadastrados protegidos por até 30 dias. Você poderá regularizar o acesso a qualquer momento através do pagamento de um novo plano.</p>
          </div>
        </div>
      </div>

      <Toaster position="bottom-center" />
    </div>
  );
}
