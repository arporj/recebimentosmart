import React, { useState, useEffect, useRef } from 'react';
import { CreditCard, DollarSign, CheckCircle, AlertCircle, Gift, Info, QrCode, Landmark, Ticket } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import axios from 'axios';

// Deixamos a variável mp como uma referência para ser instanciada depois
let mp: any = null;

interface PaymentDetails {
  baseFee: number;
  totalCredits: number;
  amountToPay: number;
  amountToReceive: number;
}

type PaymentMethod = 'pix' | 'credit_card' | 'ticket';

const PaymentIntegration = () => {
  const { user, isPaid } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'pending' | 'completed' | 'failed'>('idle');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>('pix');

  const [pixCode, setPixCode] = useState('');
  const [pixQrCode, setPixQrCode] = useState('');
  const [ticketUrl, setTicketUrl] = useState('');

  const [cardData, setCardData] = useState({
    cardNumber: '',
    cardholderName: '',
    expirationDate: '',
    cvv: '',
    cpf: ''
  });

  // Usamos useEffect para instanciar o MercadoPago de forma segura no cliente
  useEffect(() => {
    if (window.MercadoPago) {
      mp = new window.MercadoPago('TEST-cd143501-ccad-4bf4-9b56-a8edeb915b80');
    }
  }, []);

  useEffect(() => {
    const fetchPaymentDetails = async () => {
      setLoadingDetails(true);
      try {
        // A API de detalhes não existe, vamos simular uma resposta por enquanto
        // const response = await axios.get('/api/payment/details');
        const simulatedResponse = {
            data: {
                success: true,
                baseFee: 35,
                totalCredits: 5,
                amountToPay: 30,
                amountToReceive: 0
            }
        }
        if (simulatedResponse.data?.success) {
          setPaymentDetails(simulatedResponse.data);
        } else {
          throw new Error('Erro ao buscar detalhes de pagamento');
        }
      } catch (error) {
        console.error('Erro ao buscar detalhes de pagamento:', error);
        toast.error('Não foi possível carregar os detalhes de pagamento.');
        setPaymentDetails({ baseFee: 35, totalCredits: 0, amountToPay: 35, amountToReceive: 0 });
      } finally {
        setLoadingDetails(false);
      }
    };

    if (user) {
      fetchPaymentDetails();
    }
  }, [user]);

  const handleCardDataChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCardData(prev => ({ ...prev, [name]: value }));
  };

  const generatePayment = async () => {
    if (!paymentDetails || paymentDetails.amountToPay <= 0) {
      toast.error('Nenhum valor a pagar.');
      return;
    }

    setLoading(true);
    setPaymentStatus('pending');
    
    let paymentPayload: any = {
        amount: paymentDetails.amountToPay,
        description: `Pagamento Mensalidade RecebimentoSmart - ${user?.email}`,
        userId: user?.id,
        paymentMethod: selectedPaymentMethod,
        customerData: {
            email: user?.email,
            cpf: cardData.cpf,
            firstName: user?.user_metadata?.name?.split(' ')[0] || 'Usuário',
            lastName: user?.user_metadata?.name?.split(' ').slice(1).join(' ') || ''
        }
    };

    try {
        if (selectedPaymentMethod === 'credit_card') {
            if (!mp) {
                toast.error("Erro ao carregar o serviço de pagamento. Tente recarregar a página.");
                setLoading(false);
                return;
            }
            const [expMonth, expYear] = cardData.expirationDate.split('/');
            const cardToken = await mp.createCardToken({
                cardNumber: cardData.cardNumber.replace(/\s/g, ''),
                cardholderName: cardData.cardholderName,
                cardExpirationMonth: expMonth,
                cardExpirationYear: `20${expYear}`,
                securityCode: cardData.cvv,
                identificationType: 'CPF',
                identificationNumber: cardData.cpf
            });

            paymentPayload.cardData = {
                token: cardToken.id,
                payment_method_id: 'visa'
            };
        }

        const response = await axios.post('/api/generate-payment-mp', paymentPayload);

        if (!response.data || !response.data.success) {
            throw new Error(response.data?.message || 'Erro ao gerar pagamento');
        }

        const { data } = response;

        if (data.paymentMethod === 'pix') {
            setPixCode(data.pixQrCode);
            setPixQrCode(data.pixQrCodeBase64);
            toast.success('QR Code PIX gerado!');
        } else if (data.paymentMethod === 'ticket') {
            setTicketUrl(data.ticketUrl);
            toast.success('Boleto gerado!');
        } else if (data.paymentMethod === 'credit_card') {
            setPaymentStatus('completed');
            toast.success('Pagamento com cartão aprovado!');
        }

    } catch (error) {
        console.error('Erro ao gerar pagamento:', error);
        toast.error('Falha ao gerar pagamento. Verifique os dados e tente novamente.');
        setPaymentStatus('failed');
    } finally {
        setLoading(false);
    }
  };

  // ... (o resto do código permanece o mesmo)

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
              <Gift className="h-4 w-4 mr-1" /> Créditos por Indicação:
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

  const renderPaymentMethodSelection = () => {
      return (
          <div className="flex justify-around mb-4">
              <button onClick={() => setSelectedPaymentMethod('pix')} className={`flex items-center p-2 rounded-md ${selectedPaymentMethod === 'pix' ? 'bg-indigo-100' : ''}`}>
                  <QrCode className="h-5 w-5 mr-2" /> PIX
              </button>
              <button onClick={() => setSelectedPaymentMethod('credit_card')} className={`flex items-center p-2 rounded-md ${selectedPaymentMethod === 'credit_card' ? 'bg-indigo-100' : ''}`}>
                  <CreditCard className="h-5 w-5 mr-2" /> Cartão
              </button>
              <button onClick={() => setSelectedPaymentMethod('ticket')} className={`flex items-center p-2 rounded-md ${selectedPaymentMethod === 'ticket' ? 'bg-indigo-100' : ''}`}>
                  <Ticket className="h-5 w-5 mr-2" /> Boleto
              </button>
          </div>
      )
  }

  const renderCreditCardForm = () => {
      return (
          <div className="space-y-3">
              <input type="text" name="cardNumber" placeholder="Número do Cartão" onChange={handleCardDataChange} className="w-full p-2 border rounded"/>
              <input type="text" name="cardholderName" placeholder="Nome no Cartão" onChange={handleCardDataChange} className="w-full p-2 border rounded"/>
              <div className="flex space-x-3">
                <input type="text" name="expirationDate" placeholder="MM/AA" onChange={handleCardDataChange} className="w-1/2 p-2 border rounded"/>
                <input type="text" name="cvv" placeholder="CVV" onChange={handleCardDataChange} className="w-1/2 p-2 border rounded"/>
              </div>
              <input type="text" name="cpf" placeholder="CPF do Titular" onChange={handleCardDataChange} className="w-full p-2 border rounded"/>
          </div>
      )
  }

  const renderPaymentArea = () => {
    if (loadingDetails || !paymentDetails) {
      return null;
    }

    const { amountToPay, amountToReceive } = paymentDetails;

    if (paymentStatus === 'completed') {
      return (
        <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-6 text-center">
          <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
          <p className="text-green-700 font-medium mb-2">Pagamento confirmado com sucesso!</p>
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
              <button onClick={copyPixCode} className="px-4 py-2 bg-indigo-600 text-white rounded-r-md hover:bg-indigo-700 text-sm">Copiar</button>
            </div>
          </div>
        </div>
      );
    }
    
    if (ticketUrl) {
        return (
            <div className="text-center">
                <a href={ticketUrl} target="_blank" rel="noopener noreferrer" className="inline-block px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700">
                    Clique para ver o Boleto
                </a>
            </div>
        )
    }

    if (amountToPay > 0) {
      return (
        <div>
            {renderPaymentMethodSelection()}
            {selectedPaymentMethod === 'credit_card' && renderCreditCardForm()}
            <button
            onClick={generatePayment}
            disabled={loading}
            className="w-full flex items-center justify-center px-4 py-3 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-indigo-600 hover:bg-indigo-700 mt-4"
            >
            {loading ? 'Processando...' : `Pagar R$ ${amountToPay.toFixed(2)}`}
            </button>
        </div>
      );
    }

    if (amountToReceive > 0) {
      return (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4 text-center">
          <Info className="h-6 w-6 text-blue-500 mx-auto mb-2" />
          <p className="text-blue-700 font-medium mb-1">Você tem R$ {amountToReceive.toFixed(2)} a receber!</p>
        </div>
      );
    }

    return (
        <div className="bg-green-50 border border-green-200 rounded-md p-4 text-center">
          <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
          <p className="text-green-700 font-medium mb-2">Sua mensalidade está coberta pelos créditos!</p>
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
          <li>O QR Code PIX gerado tem validade de 30 minutos.</li>
        </ul>
      </div>
    </div>
  );
};

export default PaymentIntegration;
