// src/pages/SubscriptionPage.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { CreditCard, CheckCircle, Gift, Star, Clock, ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import axios from 'axios';
import { format, parseISO, isFuture } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatCurrency } from '../lib/utils';

// Tipagem para os dados recebidos da RPC
interface PlanPrices {
  basico: number;
  pro: number;
  premium: number;
}

interface UserData {
  credits: number;
  plan: string;
  valid_until: string;
}

interface PageData {
  prices: PlanPrices;
  user: UserData;
}

type PlanName = 'basico' | 'pro' | 'premium';

const SubscriptionPage = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pageData, setPageData] = useState<PageData | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanName | null>(null);
  
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'pending' | 'completed' | 'failed'>('idle');
  const [pixCode, setPixCode] = useState('');
  const [pixQrCode, setPixQrCode] = useState('');
  const [currentExternalReference, setCurrentExternalReference] = useState<string | null>(null);

  // Busca os dados iniciais da página
  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_subscription_page_data');
        if (error) throw error;
        setPageData(data);

        // Se o usuário já tem um plano ativo, marca como pagamento completo
        if (data.user.plan !== 'trial' && data.user.valid_until && isFuture(parseISO(data.user.valid_until))) {
          setPaymentStatus('completed');
        }

      } catch (error: any) {
        toast.error(`Erro ao carregar dados: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user]);

  // Lógica de polling para verificar o status do pagamento (semelhante à anterior)
  useEffect(() => {
    // ... (a lógica de polling pode ser mantida como estava, verificando a tabela de transações)
  }, [paymentStatus, currentExternalReference]);

  const finalAmount = useMemo(() => {
    if (!selectedPlan || !pageData) return 0;
    const planPrice = pageData.prices[selectedPlan];
    const userCredits = pageData.user.credits;
    return Math.max(0, planPrice - userCredits);
  }, [selectedPlan, pageData]);

  const generatePayment = async () => {
    if (!selectedPlan || !pageData || finalAmount <= 0) {
        toast.error("Selecione um plano e verifique o valor antes de pagar.");
        return;
    }

    setLoading(true);
    setPaymentStatus('pending');

    const paymentPayload = {
        amount: finalAmount,
        description: `Assinatura Plano ${selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1)} - RecebimentoSmart`,
        userId: user?.id,
        customerData: { email: user?.email },
        metadata: { plan: selectedPlan }
    };

    try {
        const response = await axios.post('/api/mp/generate-payment-mp', paymentPayload);
        if (!response.data?.success) throw new Error(response.data?.message || 'Erro ao gerar pagamento');
        
        setPixCode(response.data.pixQrCode);
        setPixQrCode(response.data.pixQrCodeBase64);
        setCurrentExternalReference(response.data.externalReference);
        toast.success('QR Code PIX gerado! Aguardando confirmação...');
    } catch (error: any) {
        toast.error(`Falha ao gerar pagamento: ${error.message}`);
        setPaymentStatus('failed');
    } finally {
        setLoading(false);
    }
  };

  const renderCurrentPlan = () => {
    if (!pageData) return null;
    const { plan, valid_until } = pageData.user;

    if (plan !== 'trial' && valid_until && isFuture(parseISO(valid_until))) {
      return (
        <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-6 text-center">
          <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
          <p className="text-green-700 font-medium mb-1">Sua assinatura do plano <span className="font-bold">{plan}</span> está ativa!</p>
          <p className="text-sm text-green-700">Próximo vencimento: <span className="font-bold">{format(parseISO(valid_until), 'dd/MM/yyyy')}</span></p>
        </div>
      );
    }
    return null;
  };

  const renderPlanSelection = () => (
    <div className="space-y-4 mb-6">
      {(['basico', 'pro', 'premium'] as PlanName[]).map(plan => (
        <div 
          key={plan}
          onClick={() => setSelectedPlan(plan)}
          className={`p-4 border rounded-lg cursor-pointer transition-all ${selectedPlan === plan ? 'border-custom ring-2 ring-custom' : 'border-gray-300'}`}>
          <h3 className="font-bold text-lg text-custom-hover">{plan.charAt(0).toUpperCase() + plan.slice(1)}</h3>
          <p className="text-gray-600 text-sm">Descrição breve do plano.</p>
          <p className="text-xl font-bold mt-2">{formatCurrency(pageData?.prices[plan] || 0)}<span className="text-sm font-normal">/mês</span></p>
        </div>
      ))}
    </div>
  );

  const renderPaymentSummary = () => {
    if (!selectedPlan || !pageData) return null;

    return (
        <div className="mb-6 p-4 border border-gray-200 rounded-md bg-gray-50 space-y-2">
            <h3 className="font-semibold text-lg mb-2">Resumo do Pagamento</h3>
            <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Plano {selectedPlan}:</span>
                <span className="font-medium text-gray-800">{formatCurrency(pageData.prices[selectedPlan])}</span>
            </div>
            {pageData.user.credits > 0 && (
                <div className="flex justify-between items-center text-green-600">
                    <span className="text-sm flex items-center"><Gift className="h-4 w-4 mr-1" /> Créditos por Indicação:</span>
                    <span className="font-medium">- {formatCurrency(pageData.user.credits)}</span>
                </div>
            )}
            <hr className="my-2" />
            <div className="flex justify-between items-center text-lg font-bold text-custom-hover">
                <span>Total a Pagar:</span>
                <span>{formatCurrency(finalAmount)}</span>
            </div>
        </div>
    );
  }

  // A função renderPaymentArea (com PIX) pode ser mantida, mas adaptada para usar `finalAmount`
  const renderPaymentArea = () => {
    // ... (UI para exibir QR Code e botão de pagar, usando `finalAmount`)
    return (
        <div>
            <button
                onClick={generatePayment}
                disabled={loading || !selectedPlan || finalAmount <= 0}
                className="w-full flex items-center justify-center px-4 py-3 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-custom hover:bg-custom-hover mt-4 disabled:opacity-50"
            >
                {loading ? 'Processando...' : `Pagar ${formatCurrency(finalAmount)}`}
            </button>
        </div>
    )
  }

  if (loading) {
    return <p className="text-center text-gray-500">Carregando...</p>;
  }

  if (paymentStatus === 'completed') {
    return <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">{renderCurrentPlan()}</div>;
  }

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <div className="flex items-center mb-4">
        <CreditCard className="h-6 w-6 text-custom mr-2" />
        <h1 className="text-2xl font-bold text-gray-800">Faça sua Assinatura</h1>
      </div>
      
      {renderPlanSelection()}
      {renderPaymentSummary()}
      {renderPaymentArea()}

    </div>
  );
};

export default SubscriptionPage;
