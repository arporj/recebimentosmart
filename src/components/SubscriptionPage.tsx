import React, { useState, useEffect, useRef } from 'react';
import { CreditCard, CheckCircle, Gift, Star, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import axios from 'axios';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface PaymentDetails {
  baseFee: number;
  totalCredits: number;
  amountToPay: number;
  creditsUsed: number;
}

interface ReferralInfo {
  was_referred: boolean;
  referrer_name: string | null;
}

const SubscriptionPage = () => { // Renomeado aqui
  const { user, hasFullAccess, isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails | null>(null);
  const [referralInfo, setReferralInfo] = useState<ReferralInfo | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'pending' | 'completed' | 'failed'>('idle');
  const [pixCode, setPixCode] = useState('');
  const [pixQrCode, setPixQrCode] = useState('');
  const [nextDueDate, setNextDueDate] = useState<string | null>(null);
  const pollingIntervalRef = useRef<number | null>(null);
  const [currentExternalReference, setCurrentExternalReference] = useState<string | null>(null);

  useEffect(() => {
    const fetchInitialData = async () => {
      if (!user) return;
      setLoadingDetails(true);

      try {
        const { data, error } = await supabase.rpc('get_subscription_page_data');

        if (error) throw error;

        // 1. Set Referral Info & Next Due Date
        const newReferralInfo = {
          was_referred: data.user.was_referred,
          referrer_name: data.user.referrer_name,
        };
        setReferralInfo(newReferralInfo);

        if (data.user.valid_until) {
          setNextDueDate(format(parseISO(data.user.valid_until), 'dd/MM/yyyy', { locale: ptBR }));
        } else {
          setNextDueDate(null);
        }

        // 2. Calculate and Set Payment Details
        const currentUserPlanName = data.user.plan;
        const currentUserPlan = data.plans.find(p => p.name === currentUserPlanName);
        const baseFee = currentUserPlan ? currentUserPlan.price_monthly : 0;
        
        // Assumindo que cada crédito de indicação vale R$10
        const creditValue = 10;
        const totalCreditsValue = (data.user.credits || 0) * creditValue;

        let amountToPay = baseFee;
        let welcomeDiscountAmount = 0;

        // Aplica desconto de boas-vindas se o usuário foi indicado
        if (newReferralInfo.was_referred) {
          // NOTA: Uma lógica mais robusta verificaria se este é o primeiro pagamento do usuário.
          welcomeDiscountAmount = baseFee * 0.20; // 20% de desconto
          amountToPay -= welcomeDiscountAmount;
        }

        // Aplica créditos de indicação que o usuário possui
        const creditsToUseValue = Math.min(amountToPay, totalCreditsValue);
        amountToPay -= creditsToUseValue;
        const creditsUsedCount = creditsToUseValue > 0 ? Math.round(creditsToUseValue / creditValue) : 0;

        const newPaymentDetails: PaymentDetails = {
          baseFee: baseFee,
          totalCredits: totalCreditsValue,
          amountToPay: Math.max(0, amountToPay),
          creditsUsed: creditsUsedCount,
        };
        setPaymentDetails(newPaymentDetails);

        if (newPaymentDetails.amountToPay === 0 && hasFullAccess) {
          setPaymentStatus('completed');
        }

      } catch (err) {
        console.error('Erro ao buscar dados iniciais:', err);
        toast.error('Não foi possível carregar os detalhes da sua assinatura.');
      } finally {
        setLoadingDetails(false);
      }
    };

    fetchInitialData();
  }, [user, hasFullAccess]);

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

          if (error) throw error;

          if (data?.status === 'COMPLETED') {
            clearInterval(pollingIntervalRef.current!); // Para o polling
            setPaymentStatus('completed');
            setPixCode(''); // Limpa o PIX
            setPixQrCode('');
            toast.success('Pagamento confirmado com sucesso!');
            fetchSubscriptionStatus(); // Atualiza o status da assinatura
          } else if (data?.status === 'FAILED') {
            clearInterval(pollingIntervalRef.current!); // Para o polling
            setPaymentStatus('failed');
            setPixCode(''); // Limpa o PIX
            setPixQrCode('');
            toast.error('Pagamento falhou. Tente novamente.');
          }
        } catch (error) {
          console.error('Erro no polling de pagamento:', error);
          clearInterval(pollingIntervalRef.current!); // Para o polling em caso de erro
          setPaymentStatus('failed');
          toast.error('Erro ao verificar status do pagamento.');
        }
      }, 5000); // Verifica a cada 5 segundos
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [paymentStatus, currentExternalReference]);

  const generatePayment = async () => {
    if (!paymentDetails || paymentDetails.amountToPay <= 0) {
      return;
    }

    setLoading(true);
    setPaymentStatus('pending');

    const paymentPayload = {
        amount: paymentDetails.amountToPay,
        description: `Pagamento Mensalidade RecebimentoSmart - ${user?.email}`,
        userId: user?.id,
        customerData: {
            email: user?.email,
            firstName: user?.user_metadata?.name?.split(' ')[0] || 'Usuário',
            lastName: user?.user_metadata?.name?.split(' ').slice(1).join(' ') || ''
        }
    };

    try {
        const response = await axios.post('/api/mp/generate-payment-mp', paymentPayload);

        if (!response.data || !response.data.success) {
            throw new Error(response.data?.message || 'Erro ao gerar pagamento');
        }

        const { data } = response;
        setPixCode(data.pixQrCode);
        setPixQrCode(data.pixQrCodeBase64);
        setCurrentExternalReference(data.externalReference); // Salva a referência para o polling
        toast.success('QR Code PIX gerado! Aguardando confirmação...');

    } catch (error) {
        console.error('Erro ao gerar pagamento:', error);
        toast.error('Falha ao gerar pagamento. Verifique os dados e tente novamente.');
        setPaymentStatus('failed');
    } finally {
        setLoading(false);
    }
  };

  const copyPixCode = () => {
    navigator.clipboard.writeText(pixCode)
      .then(() => toast.success('Código PIX copiado!'))
      .catch(() => toast.error('Não foi possível copiar o código'));
  };

  const renderPaymentDetails = () => {
    if (loadingDetails) {
      return <p className="text-center text-gray-500">Carregando detalhes...</p>;
    }
    if (!paymentDetails) {
      return <p className="text-center text-red-500">Erro ao carregar detalhes de pagamento.</p>;
    }

    let { baseFee, totalCredits, amountToPay, creditsUsed } = paymentDetails;
    let welcomeDiscountAmount = 0;

    if (referralInfo?.was_referred) {
      welcomeDiscountAmount = baseFee * 0.20;
    }

    return (
      <div className="mb-6 p-4 border border-gray-200 rounded-md bg-gray-50 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Mensalidade Base:</span>
          <span className="font-medium text-gray-800">R$ {baseFee.toFixed(2)}</span>
        </div>

        {referralInfo?.was_referred && (
            <div className="flex justify-between items-center text-yellow-500">
                <span className="text-sm flex items-center">
                    <Star className="h-4 w-4 mr-1" />
                    <span>
                        Desconto por indicação de <strong>{referralInfo.referrer_name || 'um amigo'}</strong>:
                    </span>
                </span>
                <span className="font-medium">- R$ {welcomeDiscountAmount.toFixed(2)}</span>
            </div>
        )}

        {creditsUsed > 0 && (
          <div className="flex justify-between items-center text-green-600">
            <span className="text-sm flex items-center">
              <Gift className="h-4 w-4 mr-1" /> Créditos por Indicação ({creditsUsed}):
            </span>
            <span className="font-medium">- R$ {totalCredits.toFixed(2)}</span>
          </div>
        )}
        <hr className="my-2" />
        <div className="flex justify-between items-center text-lg font-bold text-custom-hover">
          <span>Total a Pagar:</span>
          <span>R$ {amountToPay.toFixed(2)}</span>
        </div>
      </div>
    );
  };

  const renderPaymentArea = () => {
    if (loadingDetails || !paymentDetails) {
      return null;
    }

    if (paymentStatus === 'completed') {
      return (
        <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-6 text-center">
          <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
          <p className="text-green-700 font-medium mb-2">Sua mensalidade está em dia!</p>
          {nextDueDate && (
            <p className="text-sm text-green-700 mt-1">Próximo vencimento: <span className="font-bold">{nextDueDate}</span></p>
          )}
        </div>
      );
    }

    if (pixCode) {
      return (
        <div className="border border-gray-200 rounded-md p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 text-center">Pague com PIX</h2>
          <div className="flex flex-col items-center mb-4">
            <img src={`data:image/jpeg;base64,${pixQrCode}`} alt="QR Code PIX" className="w-48 h-48 mb-4" />
            <div className="flex">
              <input type="text" value={pixCode} readOnly className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md bg-gray-50 text-xs" />
              <button onClick={copyPixCode} className="px-4 py-2 bg-custom text-white rounded-r-md hover:bg-custom-hover text-sm">Copiar</button>
            </div>
          </div>
          {paymentStatus === 'pending' && (
            <div className="mt-4 text-center text-blue-600 flex items-center justify-center">
              <Clock className="h-5 w-5 mr-2 animate-spin" />
              <span>Aguardando confirmação do pagamento...</span>
            </div>
          )}
        </div>
      );
    }

    if (paymentDetails.amountToPay > 0) {
      return (
        <div>
            <button
            onClick={generatePayment}
            disabled={loading}
            className="w-full flex items-center justify-center px-4 py-3 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-custom hover:bg-custom-hover mt-4"
            >
            {loading ? 'Processando...' : `Pagar R$ ${paymentDetails.amountToPay.toFixed(2)}`}
            </button>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <div className="flex items-center mb-4">
        <CreditCard className="h-6 w-6 text-custom mr-2" />
        <h1 className="text-2xl font-bold text-gray-800">Sua Assinatura</h1> {/* Renomeado aqui */}
      </div>

      {hasFullAccess && paymentStatus !== 'completed' && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-md p-3 text-center">
             <p className="text-sm text-green-700 font-medium">Sua mensalidade está em dia!</p>
             {nextDueDate && (
               <p className="text-sm text-green-700 mt-1">Próximo vencimento: <span className="font-bold">{nextDueDate}</span></p>
             )}
        </div>
      )}

      {!hasFullAccess && !isAdmin && (
           <p className="text-sm text-red-600 mb-4 text-center font-medium">
             Seu acesso expirou. Realize o pagamento para continuar utilizando o sistema.
           </p>
      )}

      {renderPaymentDetails()}
      {renderPaymentArea()}

    </div>
  );
};

export default SubscriptionPage; // Renomeado aqui