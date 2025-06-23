import React, { useState, useEffect } from 'react';
import { CreditCard, DollarSign, CheckCircle, AlertCircle, Gift, Info } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import axios from 'axios';

interface PaymentDetails {
  baseFee: number;
  totalCredits: number;
  amountToPay: number;
  amountToReceive: number;
}

const PaymentIntegration = () => {
  const { user, isPaid } = useAuth(); // isPaid indica se já existe um pagamento concluído
  const [loading, setLoading] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails | null>(null);
  const [pixCode, setPixCode] = useState('');
  const [pixQrCode, setPixQrCode] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'pending' | 'completed' | 'failed'>('idle');
  const [transactionId, setTransactionId] = useState<string>('');

  // Buscar detalhes de pagamento ao carregar
  useEffect(() => {
    const fetchPaymentDetails = async () => {
      setLoadingDetails(true);
      try {
        const response = await axios.get('/api/payment/details');
        if (response.data?.success) {
          setPaymentDetails(response.data);
        } else {
          throw new Error(response.data?.message || 'Erro ao buscar detalhes de pagamento');
        }
      } catch (error) {
        console.error('Erro ao buscar detalhes de pagamento:', error);
        toast.error('Não foi possível carregar os detalhes de pagamento.');
        // Definir valores padrão em caso de erro para evitar quebrar a UI
        setPaymentDetails({ baseFee: 35, totalCredits: 0, amountToPay: 35, amountToReceive: 0 });
      } finally {
        setLoadingDetails(false);
      }
    };

    if (user) {
      fetchPaymentDetails();
    }
  }, [user]);

  // Gerar QR code PIX
  const generatePixPayment = async () => {
    if (!paymentDetails || paymentDetails.amountToPay <= 0) {
      toast.error('Nenhum valor a pagar.');
      return;
    }

    setLoading(true);
    setPaymentStatus('pending');

    try {
      const response = await axios.post('/api/generate-pix', {
        amount: paymentDetails.amountToPay,
        description: `Pagamento Mensalidade RecebimentoSmart - ${user?.email}`,
        userEmail: user?.email,
        userName: user?.user_metadata?.name || 'Usuário'
      });

      if (!response.data || !response.data.success) {
        throw new Error(response.data?.message || 'Erro ao gerar pagamento PIX');
      }

      const { pixCode, qrCodeImage, transactionId } = response.data;
      setPixCode(pixCode);
      setPixQrCode(qrCodeImage);
      setTransactionId(transactionId);
      toast.success('QR Code PIX gerado com sucesso!');
      
      // Exibir mensagem informativa sobre o webhook
      toast.success('Aguardando confirmação de pagamento...', {
        duration: 5000,
        icon: '⏳'
      });
      
      // Explicação para o usuário sobre o processo de confirmação
      toast.custom(
        (t) => (
          <div className={`${
            t.visible ? 'animate-enter' : 'animate-leave'
          } max-w-md w-full bg-white shadow-lg rounded-lg pointer-events-auto flex flex-col`}>
            <div className="p-4">
              <div className="flex items-start">
                <div className="ml-3 flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    Confirmação automática
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    Após realizar o pagamento, o sistema receberá uma notificação automática do banco e atualizará seu status. Não é necessário atualizar a página.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ),
        { duration: 8000 }
      );

    } catch (error) {
      console.error('Erro ao gerar pagamento PIX:', error);
      toast.error('Não foi possível gerar o pagamento PIX.');
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

    const { baseFee, totalCredits, amountToPay, amountToReceive } = paymentDetails;

    return (
      <div className="mb-6 p-4 border border-gray-200 rounded-md bg-gray-50 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Mensalidade Base:</span>
          <span className="font-medium text-gray-800">R$ {baseFee.toFixed(2)}</span>
        </div>
        {totalCredits > 0 && (
          <div className="flex justify-between items-center text-green-600">
            <span className="text-sm flex items-center">
              <Gift className="h-4 w-4 mr-1" /> Créditos por Indicação (Nível 1 e 2):
            </span>
            <span className="font-medium">- R$ {totalCredits.toFixed(2)}</span>
          </div>
        )}
        <hr className="my-2" />
        {amountToPay > 0 ? (
          <div className="flex justify-between items-center text-lg font-bold text-indigo-700">
            <span>Total a Pagar:</span>
            <span>R$ {amountToPay.toFixed(2)}</span>
          </div>
        ) : (
          <div className="flex justify-between items-center text-lg font-bold text-green-700">
            <span>Total a Receber:</span>
            <span>R$ {amountToReceive.toFixed(2)}</span>
          </div>
        )}
      </div>
    );
  };

  const renderPaymentArea = () => {
    if (loadingDetails || !paymentDetails) {
      return null; // Detalhes já mostram o loading/erro
    }

    const { amountToPay, amountToReceive } = paymentDetails;

    if (paymentStatus === 'completed') {
      return (
        <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-6 text-center">
          <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
          <p className="text-green-700 font-medium mb-2">Pagamento confirmado com sucesso!</p>
          <p className="text-sm text-green-600">
            Seu acesso está liberado. Obrigado!
          </p>
        </div>
      );
    }

    if (pixCode) { // Mostra QR Code e aguarda pagamento
      return (
        <div className="border border-gray-200 rounded-md p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 text-center">Pague com PIX</h2>
          <div className="flex flex-col items-center mb-4">
            {pixQrCode && (
              <img src={pixQrCode} alt="QR Code PIX" className="w-48 h-48 mb-4" />
            )}
            <div className="text-center">
              <p className="text-sm text-gray-500 mb-2">Escaneie o QR Code acima com o app do seu banco</p>
              <div className="flex items-center justify-center">
                <span className="text-lg font-bold text-gray-800 mr-2">R$ {amountToPay.toFixed(2)}</span>
                {paymentStatus === 'pending' && (
                  <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full animate-pulse">
                    Aguardando pagamento...
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="border-t border-gray-200 pt-4">
            <p className="text-sm text-gray-600 mb-2">Ou copie o código PIX:</p>
            <div className="flex">
              <input type="text" value={pixCode} readOnly className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md bg-gray-50 text-xs" />
              <button onClick={copyPixCode} className="px-4 py-2 bg-indigo-600 text-white rounded-r-md hover:bg-indigo-700 text-sm">Copiar</button>
            </div>
          </div>
          
          {/* Botão para verificar status manualmente (alternativa ao polling) */}
          <div className="mt-4 text-center">
            <button 
              onClick={() => window.location.reload()} 
              className="text-sm text-indigo-600 hover:text-indigo-800 underline"
            >
              Já paguei e quero verificar o status
            </button>
          </div>
        </div>
      );
    }

    if (amountToPay > 0) { // Mostra botão para gerar PIX
      return (
        <button
          onClick={generatePixPayment}
          disabled={loading}
          className="w-full flex items-center justify-center px-4 py-3 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          {loading ? 'Gerando PIX...' : `Pagar R$ ${amountToPay.toFixed(2)} com PIX`}
        </button>
      );
    }

    if (amountToReceive > 0) { // Mostra mensagem de valor a receber
      return (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4 text-center">
          <Info className="h-6 w-6 text-blue-500 mx-auto mb-2" />
          <p className="text-blue-700 font-medium mb-1">Você tem R$ {amountToReceive.toFixed(2)} a receber!</p>
          <p className="text-sm text-blue-600">
            Garanta que sua chave PIX esteja cadastrada em seu perfil. O valor será depositado até o dia 5 do próximo mês.
          </p>
        </div>
      );
    }

    // Caso não tenha valor a pagar nem a receber (crédito igual à mensalidade)
    return (
        <div className="bg-green-50 border border-green-200 rounded-md p-4 text-center">
          <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
          <p className="text-green-700 font-medium mb-2">Sua mensalidade está coberta pelos créditos!</p>
          <p className="text-sm text-green-600">
            Seu acesso continua ativo. Continue indicando!
          </p>
        </div>
      );
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <div className="flex items-center mb-4">
        <CreditCard className="h-6 w-6 text-indigo-600 mr-2" />
        <h1 className="text-2xl font-bold text-gray-800">Pagamento da Mensalidade</h1>
      </div>

      {isPaid && paymentStatus !== 'completed' && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-md p-3 text-center">
             <p className="text-sm text-green-700 font-medium">Seu pagamento está em dia!</p>
        </div>
      )}

      {!isPaid && (
           <p className="text-sm text-red-600 mb-4 text-center font-medium">
             Seu acesso expirou. Realize o pagamento para continuar utilizando o sistema.
           </p>
      )}

      {renderPaymentDetails()}
      {renderPaymentArea()}

      <div className="mt-8 border-t border-gray-200 pt-6">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Informações importantes:</h3>
        <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1">
          <li>A mensalidade é de R$ 35,00.</li>
          <li>Você ganha R$ 5,00 de crédito para cada indicação direta (Nível 1) e R$ 1,00 para cada indicação indireta (Nível 2) que realizar o primeiro pagamento.</li>
          <li>O QR Code PIX gerado tem validade de 30 minutos.</li>
          <li>Valores a receber serão pagos via PIX até o dia 5 do mês seguinte.</li>
        </ul>
      </div>
    </div>
  );
};

export default PaymentIntegration;
