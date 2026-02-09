// src/pages/SubscriptionPage.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { CreditCard, CheckCircle, Gift, Copy } from 'lucide-react';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useAuth } from '../contexts/AuthContext'; // Importa o useAuth
import { format, parseISO, isFuture } from 'date-fns';
import { formatCurrency } from '../lib/utils';
import { generatePixCopyPaste } from '../lib/pix';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';

type PlanName = 'basico' | 'pro' | 'premium';

const SubscriptionPage = () => {
  const { loading, pageData, paymentStatus, fetchData } = useSubscription();
  const { user } = useAuth(); // Obtém o usuário do AuthContext
  const [selectedPlan, setSelectedPlan] = useState<PlanName | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [pixCopyPaste, setPixCopyPaste] = useState<string | null>(null);

  // Define o plano padrão quando os dados são carregados
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
          // Utilizando o CNPJ da empresa como chave PIX (apenas números)
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

  const renderCurrentPlan = () => {
    if (!pageData || !pageData.user) return null;
    const { plan, valid_until } = pageData.user;

    if (plan && plan !== 'trial' && valid_until && isFuture(parseISO(valid_until))) {
      return (
        <div className="bg-secondary-50 border border-secondary-200 rounded-md p-4 mb-6 text-center">
          <CheckCircle className="h-8 w-8 text-secondary-500 mx-auto mb-2" />
          <p className="text-secondary-700 font-medium mb-1">Sua assinatura do plano <span className="font-bold">{plan}</span> está ativa!</p>
          <p className="text-sm text-secondary-700">Próximo vencimento: <span className="font-bold">{format(parseISO(valid_until), 'dd/MM/yyyy')}</span></p>
        </div>
      );
    }
    return null;
  };

  const handlePlanSelection = (plan: PlanName) => {
    setSelectedPlan(plan);
  }

  const renderPlanSelection = () => {
    if (!pageData || !pageData.plans || pageData.plans.length === 0) {
      return <p className="text-neutral-500">Nenhum plano disponível no momento.</p>;
    }
    
    const planMapping: Record<string, PlanName> = {
      'básico': 'basico',
      'pró': 'pro'
    };
    
    return (
      <div className="space-y-4 mb-6">
        {pageData.plans.filter(p => p.name.toLowerCase() !== 'premium').map(plan => {
          const planKey = planMapping[plan.name.toLowerCase()] || plan.name.toLowerCase() as PlanName;
          const price = plan.price_monthly;
          
          return (
            <div 
              key={planKey}
              onClick={() => handlePlanSelection(planKey)}
              className={`p-4 border rounded-lg cursor-pointer transition-all ${selectedPlan === planKey ? 'border-accent-600 ring-2 ring-accent-500' : 'border-neutral-300'}`}>
              <h3 className="font-bold text-lg text-accent-700">{plan.name}</h3>
              <p className="text-neutral-600 text-sm">{plan.features ? plan.features[0] : 'Descrição breve do plano.'}</p>
              <p className="text-xl font-bold mt-2">{formatCurrency(price)}<span className="text-sm font-normal">/mês</span></p>
            </div>
          );
        })}
      </div>
    );
  };

  const renderPaymentSummary = () => {
    if (!selectedPlan || !pageData) {
      return null;
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
    const planDisplayName = selectedPlanObj ? selectedPlanObj.name : selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1);
    const userCredits = pageData.user?.credits || 0;

    return (
        <div className="mb-6 p-4 border border-secondary-200 rounded-md bg-neutral-50 space-y-2">
            <h3 className="font-semibold text-lg mb-2">Resumo do Pagamento</h3>
            <div className="flex justify-between items-center">
                <span className="text-sm text-neutral-600">Plano {planDisplayName}:</span>
                <span className="font-medium text-neutral-800">{formatCurrency(planPrice)}</span>
            </div>
            {userCredits > 0 && (
                <div className="flex justify-between items-center text-secondary-600">
                    <span className="text-sm flex items-center"><Gift className="h-4 w-4 mr-1" /> Créditos por Indicação:</span>
                    <span className="font-medium">- {formatCurrency(userCredits)}</span>
                </div>
            )}
            <hr className="my-2" />
            <div className="flex justify-between items-center text-lg font-bold text-accent-700">
                <span>Total a Pagar:</span>
                <span>{formatCurrency(finalAmount)}</span>
            </div>
        </div>
    );
  }

  if (loading) {
    return <p className="text-center text-neutral-500">Carregando...</p>;
  }

  if (paymentStatus === 'completed') {
    return <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">{renderCurrentPlan()}</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 p-4 sm:p-8">
      <div className="max-w-5xl mx-auto">
        {pageData && paymentStatus !== 'completed' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-sm">
              <div className="flex items-center mb-6">
                <CreditCard className="h-6 w-6 text-accent-600 mr-3" />
                <h1 className="text-2xl font-bold text-neutral-800">Faça sua Assinatura</h1>
              </div>

              {renderCurrentPlan()}

              <h2 className="text-xl font-semibold text-gray-800 mb-4">1. Escolha seu Plano</h2>
              {renderPlanSelection()}
              
              <div className="mt-8">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">2. Realize o Pagamento via PIX</h3>
                <div className="p-6 border border-green-200 bg-green-50 rounded-md">
                    <div className="text-center mb-6">
                        <p className="font-semibold text-green-800 mb-4 text-lg">Escaneie o QR Code abaixo:</p>
                        
                        {qrCodeUrl ? (
                            <div className="flex flex-col items-center justify-center mb-6">
                                <div className="bg-white p-2 rounded-lg shadow-sm border border-gray-200">
                                    <img src={qrCodeUrl} alt="QR Code PIX" className="w-48 h-48" />
                                </div>
                                <p className="text-sm text-gray-500 mt-2">Abra o app do seu banco e escolha "Pagar com Pix"</p>
                            </div>
                        ) : (
                             <div className="flex flex-col items-center justify-center mb-6 h-48 w-48 mx-auto bg-gray-200 rounded-lg animate-pulse">
                                <span className="text-gray-400 text-xs">Carregando QR Code...</span>
                             </div>
                        )}

                        {pixCopyPaste && (
                            <div className="mb-6 w-full max-w-md mx-auto">
                                <p className="text-sm text-gray-600 mb-1 text-left font-medium">Pix Copia e Cola:</p>
                                <div className="flex shadow-sm">
                                    <input 
                                        type="text" 
                                        readOnly 
                                        value={pixCopyPaste} 
                                        className="block w-full text-xs text-gray-500 bg-white border-gray-300 rounded-l-md focus:ring-green-500 focus:border-green-500"
                                        onClick={(e) => e.currentTarget.select()}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            navigator.clipboard.writeText(pixCopyPaste);
                                            toast.success('Código PIX copiado!');
                                        }}
                                        className="inline-flex items-center px-4 py-2 border border-l-0 border-gray-300 text-sm font-medium rounded-r-md text-gray-700 bg-gray-50 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                                        title="Copiar código"
                                    >
                                        <Copy className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="mt-6 pt-6 border-t border-green-200">
                            <p className="text-sm text-green-800 mb-2">Ou use a chave PIX manual:</p>
                            <div className="bg-white p-3 rounded border border-dashed border-green-300 inline-block">
                                <p className="font-mono text-xl font-bold text-gray-800 select-all">
                                    37.905.181/0001-05
                                </p>
                            </div>
                            <p className="text-xs text-green-700 mt-1">CNPJ - Recebimento Smart</p>
                        </div>
                    </div>

                    <div className="bg-white p-4 rounded-md border border-green-100">
                        <h4 className="font-bold text-gray-700 mb-2 flex items-center">
                            <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
                            Instruções:
                        </h4>
                        <ol className="list-decimal list-inside space-y-2 text-gray-600 text-sm">
                            <li>Abra o aplicativo do seu banco.</li>
                            <li>Escolha a opção de pagamento via PIX.</li>
                            <li>Insira a chave PIX acima ou escaneie (se houver QR Code disponível).</li>
                            <li>Confirme o valor referente ao plano escolhido: <span className="font-bold text-gray-800">{formatCurrency(finalAmount)}</span>.</li>
                            <li>Envie o comprovante para o suporte para liberação imediata.</li>
                        </ol>
                    </div>

                    <div className="mt-6 text-center">
                        <a 
                            href={`https://wa.me/5521967621494?text=Olá, realizei o pagamento da assinatura do plano ${selectedPlan} no valor de ${formatCurrency(finalAmount)}. Segue o comprovante.`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-green-600 hover:bg-green-700 md:py-4 md:text-lg md:px-10 transition-transform transform hover:scale-105"
                        >
                            Enviar Comprovante via WhatsApp
                        </a>
                    </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm h-fit sticky top-8">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Resumo do Pedido</h2>
              {renderPaymentSummary()}
            </div>
          </div>
        ) : (
          <p className="text-center text-neutral-500">Não foi possível carregar os dados da assinatura.</p>
        )}
      </div>
    </div>
  );
};

export default SubscriptionPage;
