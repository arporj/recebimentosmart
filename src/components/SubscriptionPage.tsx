import React, { useState, useEffect, useMemo, useRef } from 'react';
import { CreditCard, CheckCircle, Gift, Star, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import axios from 'axios';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Tipos de dados
interface Plan {
  name: string;
  price_monthly: number;
}

interface PaymentDetails {
  baseFee: number;
  totalCreditsValue: number;
  amountToPay: number;
  creditsUsed: number;
  welcomeDiscount: number;
}

interface ReferralInfo {
  was_referred: boolean;
  referrer_name: string | null;
}

const SubscriptionPage = () => {
  const { user, hasFullAccess, isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(true);
  
  // Estados da página
  const [allPlans, setAllPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [currentUserPlan, setCurrentUserPlan] = useState<Plan | null>(null);
  const [referralInfo, setReferralInfo] = useState<ReferralInfo | null>(null);
  const [userCredits, setUserCredits] = useState(0);
  const [nextDueDate, setNextDueDate] = useState<string | null>(null);

  // Estados do fluxo de pagamento
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'pending' | 'completed' | 'failed'>('idle');
  const [pixCode, setPixCode] = useState('');
  const [pixQrCode, setPixQrCode] = useState('');
  const pollingIntervalRef = useRef<number | null>(null);
  const [currentExternalReference, setCurrentExternalReference] = useState<string | null>(null);

  // Efeito para buscar todos os dados iniciais
  useEffect(() => {
    const fetchInitialData = async () => {
      if (!user) return;
      setLoadingDetails(true);
      try {
        const { data, error } = await supabase.rpc('get_subscription_page_data');
        if (error) throw error;

        const plans = data.plans || [];
        setAllPlans(plans);

        const currentPlan = plans.find(p => p.name === data.user.plan);
        setCurrentUserPlan(currentPlan || null);
        setSelectedPlan(currentPlan || plans[0] || null);
        
        setReferralInfo({
          was_referred: data.user.was_referred,
          referrer_name: data.user.referrer_name,
        });
        setUserCredits(data.user.credits || 0);

        if (data.user.valid_until) {
          setNextDueDate(format(parseISO(data.user.valid_until), 'dd/MM/yyyy', { locale: ptBR }));
        }

      } catch (err) {
        console.error('Erro ao buscar dados iniciais:', err);
        toast.error('Não foi possível carregar os detalhes da sua assinatura.');
      } finally {
        setLoadingDetails(false);
      }
    };
    fetchInitialData();
  }, [user]);

  // Lógica de cálculo dos detalhes de pagamento
  const paymentDetails: PaymentDetails | null = useMemo(() => {
    if (!selectedPlan) return null;

    const baseFee = selectedPlan.price_monthly;
    const creditValue = 10; // Cada crédito vale R$10
    const totalCreditsValue = userCredits * creditValue;
    let amountToPay = baseFee;
    let welcomeDiscount = 0;

    if (referralInfo?.was_referred && (!currentUserPlan || selectedPlan.price_monthly > currentUserPlan.price_monthly)) {
      welcomeDiscount = baseFee * 0.20;
      amountToPay -= welcomeDiscount;
    }

    const creditsToUseValue = Math.min(amountToPay, totalCreditsValue);
    amountToPay -= creditsToUseValue;
    const creditsUsed = creditsToUseValue > 0 ? Math.round(creditsToUseValue / creditValue) : 0;

    return {
      baseFee,
      totalCreditsValue,
      amountToPay: Math.max(0, amountToPay),
      creditsUsed,
      welcomeDiscount,
    };
  }, [selectedPlan, userCredits, referralInfo, currentUserPlan]);

  // Polling para verificar o status do pagamento
  useEffect(() => {
    if (paymentStatus === 'pending' && currentExternalReference) {
      pollingIntervalRef.current = window.setInterval(async () => {
        try {
          const { data, error } = await supabase
            .from('payment_transactions')
            .select('status')
            .eq('reference_id', currentExternalReference)
            .single();

          if (error && error.code !== 'PGRST116') throw error;

          if (data?.status === 'COMPLETED') {
            clearInterval(pollingIntervalRef.current!); 
            setPaymentStatus('completed');
            setPixCode('');
            setPixQrCode('');
            toast.success('Pagamento confirmado com sucesso!');
            // TODO: Idealmente, forçar um re-fetch dos dados iniciais aqui.
          } else if (data?.status === 'FAILED') {
            clearInterval(pollingIntervalRef.current!); 
            setPaymentStatus('failed');
            toast.error('Pagamento falhou. Tente novamente.');
          }
        } catch (error) {
          console.error('Erro no polling de pagamento:', error);
          clearInterval(pollingIntervalRef.current!); 
          setPaymentStatus('failed');
        }
      }, 5000);
    }
    return () => { if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current); };
  }, [paymentStatus, currentExternalReference]);

  const generatePayment = async () => {
    if (!paymentDetails || !selectedPlan || paymentDetails.amountToPay <= 0) return;

    setLoading(true);
    setPaymentStatus('pending');

    const paymentPayload = {
        amount: paymentDetails.amountToPay,
        description: `Assinatura Plano ${selectedPlan.name} - RecebimentoSmart`,
        userId: user?.id,
        metadata: {
          user_id: user?.id,
          plan_name: selectedPlan.name, // Envia o plano selecionado no metadata
        },
        customerData: {
            email: user?.email,
            firstName: user?.user_metadata?.name?.split(' ')[0] || 'Usuário',
            lastName: user?.user_metadata?.name?.split(' ').slice(1).join(' ') || ''
        }
    };

    try {
        const response = await axios.post('/api/mp/generate-payment-mp', paymentPayload);
        if (!response.data?.success) throw new Error(response.data?.message);

        setPixCode(response.data.pixQrCode);
        setPixQrCode(response.data.pixQrCodeBase64);
        setCurrentExternalReference(response.data.externalReference);
        toast.success('QR Code PIX gerado! Aguardando confirmação...');
    } catch (error) {
        console.error('Erro ao gerar pagamento:', error);
        toast.error('Falha ao gerar pagamento.');
        setPaymentStatus('failed');
    } finally {
        setLoading(false);
    }
  };

  const copyPixCode = () => {
    navigator.clipboard.writeText(pixCode).then(() => toast.success('Código PIX copiado!'));
  };

  const renderPlanSelector = () => {
    if (loadingDetails || allPlans.length === 0) return null;
    return (
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Escolha seu plano:</h2>
        <div className="space-y-3">
          {allPlans.map(plan => (
            <div 
              key={plan.name}
              onClick={() => setSelectedPlan(plan)}
              className={`p-4 border rounded-lg cursor-pointer transition-all ${
                selectedPlan?.name === plan.name
                  ? 'border-custom shadow-md bg-custom-light'
                  : 'border-gray-200 bg-white hover:border-gray-400'
              }`}>
              <div className="flex justify-between items-center">
                <span className="font-bold text-gray-800">{plan.name}</span>
                <span className="font-semibold text-custom-hover">R$ {plan.price_monthly.toFixed(2)}/mês</span>
                {currentUserPlan?.name === plan.name && (
                  <span className="ml-2 px-2 py-1 text-xs font-semibold text-white bg-blue-500 rounded-full">Atual</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderPaymentDetails = () => {
    if (loadingDetails || !paymentDetails) {
      return <p className="text-center text-gray-500">Carregando detalhes...</p>;
    }

    return (
      <div className="mb-6 p-4 border border-gray-200 rounded-md bg-gray-50 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Mensalidade (Plano {selectedPlan?.name}):</span>
          <span className="font-medium text-gray-800">R$ {paymentDetails.baseFee.toFixed(2)}</span>
        </div>

        {paymentDetails.welcomeDiscount > 0 && (
            <div className="flex justify-between items-center text-yellow-500">
                <span className="text-sm flex items-center"><Star className="h-4 w-4 mr-1" />Desconto de boas-vindas:</span>
                <span className="font-medium">- R$ {paymentDetails.welcomeDiscount.toFixed(2)}</span>
            </div>
        )}

        {paymentDetails.creditsUsed > 0 && (
          <div className="flex justify-between items-center text-green-600">
            <span className="text-sm flex items-center"><Gift className="h-4 w-4 mr-1" />Créditos por Indicação ({paymentDetails.creditsUsed}):</span>
            <span className="font-medium">- R$ {(paymentDetails.creditsUsed * 10).toFixed(2)}</span>
          </div>
        )}
        <hr className="my-2" />
        <div className="flex justify-between items-center text-lg font-bold text-custom-hover">
          <span>Total a Pagar:</span>
          <span>R$ {paymentDetails.amountToPay.toFixed(2)}</span>
        </div>
      </div>
    );
  };

  const renderPaymentArea = () => {
    if (loadingDetails || !paymentDetails) return null;

    if (paymentStatus === 'completed' || (hasFullAccess && paymentDetails.amountToPay <= 0)) {
      return (
        <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-6 text-center">
          <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
          <p className="text-green-700 font-medium mb-2">Sua assinatura está em dia!</p>
          {nextDueDate && <p className="text-sm text-green-700 mt-1">Próximo vencimento: <span className="font-bold">{nextDueDate}</span></p>}
        </div>
      );
    }

    if (pixCode) {
      return (
        <div className="border border-gray-200 rounded-md p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 text-center">Pague com PIX</h2>
          <div className="flex flex-col items-center mb-4">
            <img src={`data:image/jpeg;base64,${pixQrCode}`} alt="QR Code PIX" className="w-48 h-48 mb-4" />
            <div className="flex"><input type="text" value={pixCode} readOnly className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md bg-gray-50 text-xs" /><button onClick={copyPixCode} className="px-4 py-2 bg-custom text-white rounded-r-md hover:bg-custom-hover text-sm">Copiar</button></div>
          </div>
          {paymentStatus === 'pending' && <div className="mt-4 text-center text-blue-600 flex items-center justify-center"><Clock className="h-5 w-5 mr-2 animate-spin" /><span>Aguardando confirmação...</span></div>}
        </div>
      );
    }

    if (paymentDetails.amountToPay > 0) {
      return <button onClick={generatePayment} disabled={loading} className="w-full flex items-center justify-center px-4 py-3 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-custom hover:bg-custom-hover mt-4">{loading ? 'Processando...' : `Pagar R$ ${paymentDetails.amountToPay.toFixed(2)}`}</button>;
    }

    return null;
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <div className="flex items-center mb-4">
        <CreditCard className="h-6 w-6 text-custom mr-2" />
        <h1 className="text-2xl font-bold text-gray-800">Sua Assinatura</h1>
      </div>

      {!hasFullAccess && !isAdmin && <p className="text-sm text-red-600 mb-4 text-center font-medium">Seu acesso expirou. Realize o pagamento para continuar utilizando o sistema.</p>}

      {renderPlanSelector()}
      {renderPaymentDetails()}
      {renderPaymentArea()}

    </div>
  );
};

export default SubscriptionPage;