import React, { useState, useEffect } from 'react';
import { CreditCard, CheckCircle, Gift, Star } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import axios from 'axios';

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

const PaymentIntegration = () => {
  const { user, hasFullAccess, isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails | null>(null);
  const [referralInfo, setReferralInfo] = useState<ReferralInfo | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'pending' | 'completed' | 'failed'>('idle');
  const [pixCode, setPixCode] = useState('');
  const [pixQrCode, setPixQrCode] = useState('');

  useEffect(() => {
    const fetchInitialData = async () => {
      if (!user) return;
      setLoadingDetails(true);
      try {
        // Buscar detalhes de pagamento e informações de indicação em paralelo
        const [paymentResponse, referralResponse] = await Promise.all([
          axios.get(`/api/mp/payment-details/${user.id}`),
          supabase.rpc('get_referral_stats', { p_user_id: user.id })
        ]);

        if (paymentResponse.data?.success) {
          setPaymentDetails(paymentResponse.data);
          if (paymentResponse.data.amountToPay === 0) {
            setPaymentStatus('completed');
          }
        } else {
          throw new Error('Erro ao buscar detalhes de pagamento');
        }

        if (referralResponse.error) throw referralResponse.error;
        // A RPC retorna um array, pegamos o primeiro elemento
        if (referralResponse.data && referralResponse.data.length > 0) {
            setReferralInfo(referralResponse.data[0]);
        }


      } catch (error) {
        console.error('Erro ao buscar dados iniciais:', error);
        toast.error('Não foi possível carregar os detalhes da página.');
      } finally {
        setLoadingDetails(false);
      }
    };

    fetchInitialData();
  }, [user]);

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
        const response = await axios.post('/api/mp/generate-payment', paymentPayload);

        if (!response.data || !response.data.success) {
            throw new Error(response.data?.message || 'Erro ao gerar pagamento');
        }

        const { data } = response;
        setPixCode(data.pixQrCode);
        setPixQrCode(data.pixQrCodeBase64);
        toast.success('QR Code PIX gerado!');

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

    const { baseFee, totalCredits, amountToPay, creditsUsed } = paymentDetails;
    const welcomeDiscount = baseFee * 0.20;

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
                <span className="font-medium">- R$ {welcomeDiscount.toFixed(2)}</span>
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
          <p className="text-green-700 font-medium mb-2">Sua mensalidade está coberta pelos créditos!</p>
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
        <h1 className="text-2xl font-bold text-gray-800">Pagamento da Mensalidade</h1>
      </div>

      {hasFullAccess && paymentStatus !== 'completed' && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-md p-3 text-center">
             <p className="text-sm text-green-700 font-medium">Seu pagamento está em dia!</p>
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

export default PaymentIntegration;
