// src/pages/SubscriptionPage.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { CreditCard, CheckCircle, Gift } from 'lucide-react';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useAuth } from '../contexts/AuthContext'; // Importa o useAuth
import { format, parseISO, isFuture } from 'date-fns';
import { formatCurrency } from '../lib/utils';

type PlanName = 'basico' | 'pro' | 'premium';

const SubscriptionPage = () => {
  const { loading, pageData, paymentStatus, fetchData } = useSubscription();
  const { user } = useAuth(); // Obtém o usuário do AuthContext
  const [selectedPlan, setSelectedPlan] = useState<PlanName | null>(null);
  const [pixData, setPixData] = useState<{ qrCodeText: string; qrCodeImageUrl: string; transactionId: string } | null>(null);
  const [generatingPix, setGeneratingPix] = useState(false);

  // Efeito para polling do status do PIX
  useEffect(() => {
    if (!pixData) return;

    const intervalId = setInterval(async () => {
      try {
        const response = await fetch(`/api/get-pix-status?transactionId=${pixData.transactionId}`);
        if (!response.ok) {
          console.error('Erro ao buscar status do PIX, parando polling.');
          clearInterval(intervalId);
          return;
        }

        const data = await response.json();

        if (data.status === 'COMPLETED') {
          clearInterval(intervalId);
          setPixData(null);
          toast.success('Pagamento confirmado com sucesso!');
          fetchData();
        }

      } catch (error) {
        console.error('Erro no polling do status do PIX:', error);
        clearInterval(intervalId);
      }
    }, 3000);

    return () => clearInterval(intervalId);
  }, [pixData, fetchData]);


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

  const handleGeneratePix = async () => {
    if (!user || finalAmount <= 0) return; // Verifica se o usuário existe

    setGeneratingPix(true);
    try {
      const response = await fetch('/api/generate-pix', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount: finalAmount, userId: user.id }), // Usa user.id do useAuth
      });

      if (!response.ok) {
        throw new Error('Failed to generate PIX');
      }

      const data = await response.json();
      setPixData(data);
    } catch (error) {
      console.error('Error generating PIX:', error);
      alert('Erro ao gerar PIX. Tente novamente.');
    } finally {
      setGeneratingPix(false);
    }
  };

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
      'pró': 'pro',
      'premium': 'premium'
    };
    
    return (
      <div className="space-y-4 mb-6">
        {pageData.plans.map(plan => {
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
                <h3 className="text-lg font-semibold text-gray-800 mb-4">2. Realize o Pagamento</h3>
                {!pixData ? (
                  <div className="space-y-4">
                    <button
                      onClick={handleGeneratePix}
                      disabled={generatingPix || finalAmount <= 0}
                      className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {generatingPix ? 'Gerando PIX...' : 'Pagar com PIX'}
                    </button>

                  </div>
                ) : (
                  <div className="text-center p-4 border border-green-200 bg-green-50 rounded-md">
                    <p className="font-semibold text-green-700 mb-2">Escaneie o QR Code para pagar:</p>
                    <img src={pixData.qrCodeImageUrl} alt="QR Code PIX" className="mx-auto mb-4" />
                    <p className="text-sm text-green-600 break-all">Ou copie e cole: <span className="font-mono font-bold">{pixData.qrCodeText}</span></p>
                    <p className="text-xs text-green-500 mt-2">Aguardando confirmação do pagamento...</p>
                  </div>
                )}
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