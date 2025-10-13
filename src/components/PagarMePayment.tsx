import React, { useState, useEffect } from 'react';

interface PagarMePaymentProps {
  amount: number;
}

declare global {
  interface Window {
    pagarme: any;
  }
}

const PagarMePayment: React.FC<PagarMePaymentProps> = ({ amount }) => {
  const [pagarmeClient, setPagarmeClient] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [cardNumber, setCardNumber] = useState<string>('');
  const [cardHolderName, setCardHolderName] = useState<string>('');
  const [cardExpirationDate, setCardExpirationDate] = useState<string>('');
  const [cardCvv, setCardCvv] = useState<string>('');
  const [isFormValid, setIsFormValid] = useState<boolean>(false);

  useEffect(() => {
    const initPagarme = () => {
      if (window.pagarme) {
        console.log('Pagar.me script loaded.');
        const encryptionKey = import.meta.env.VITE_PAGARME_ENCRYPTION_KEY;
        if (!encryptionKey) {
          console.error('VITE_PAGARME_ENCRYPTION_KEY is not set.');
          alert('A chave de criptografia do Pagar.me não está configurada.');
          return;
        }
        
        window.pagarme.connect({ encryption_key: encryptionKey })
          .then((client: any) => {
            console.log('Pagar.me client connected successfully.');
            setPagarmeClient(client);
          })
          .catch((error: any) => {
            console.error('Error connecting to Pagar.me:', error);
          });

      } else {
        console.error('Pagar.me script not found. Please check if the script is loaded.');
      }
    };

    // O script é carregado de forma síncrona, mas vamos dar um pequeno tempo para garantir que ele esteja disponível
    const timeoutId = setTimeout(initPagarme, 100);

    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const validateForm = () => {
      const isCardNumberValid = cardNumber.replace(/\s/g, '').length >= 13;
      const isCardHolderNameValid = cardHolderName.trim().length > 2;
      const isCardExpirationValid = /^(0[1-9]|1[0-2])\/([0-9]{2})$/.test(cardExpirationDate);
      const isCardCvvValid = cardCvv.length >= 3 && cardCvv.length <= 4;
      
      setIsFormValid(
        isCardNumberValid &&
        isCardHolderNameValid &&
        isCardExpirationValid &&
        isCardCvvValid &&
        amount > 0
      );
    };
    validateForm();
  }, [cardNumber, cardHolderName, cardExpirationDate, cardCvv, amount]);

  const handleExpirationDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/[^0-9]/g, '');
    if (value.length > 4) {
      value = value.slice(0, 4);
    }
    if (value.length > 2) {
      value = value.slice(0, 2) + '/' + value.slice(2);
    }
    setCardExpirationDate(value);
  };

  const handlePayment = async () => {
    setLoading(true);
    if (!pagarmeClient) {
      alert('Cliente Pagar.me não inicializado.');
      setLoading(false);
      return;
    }

    const card = {
      card_number: cardNumber.replace(/\s/g, ''),
      card_holder_name: cardHolderName,
      card_expiration_date: cardExpirationDate.replace('/', ''),
      card_cvv: cardCvv,
    };

    try {
      const cardToken = await pagarmeClient.cards.createToken(card);

      console.log('Card token created:', cardToken);

      // Lógica de chamada de API para criar o pagamento
      alert('Simulação de pagamento bem-sucedida! Token: ' + cardToken.id);

    } catch (error) {
      console.error('Error processing payment:', error);
      alert('Erro ao processar o pagamento.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <input
          type="text"
          placeholder="Número do Cartão"
          value={cardNumber}
          onChange={(e) => setCardNumber(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-500"
        />
        <input
          type="text"
          placeholder="Nome no Cartão"
          value={cardHolderName}
          onChange={(e) => setCardHolderName(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-500"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <input
          type="text"
          placeholder="MM/AA"
          value={cardExpirationDate}
          onChange={handleExpirationDateChange}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-500"
        />
        <input
          type="text"
          placeholder="CVV"
          value={cardCvv}
          onChange={(e) => setCardCvv(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-500"
        />
      </div>
      <button
        onClick={handlePayment}
        disabled={!isFormValid || loading || !pagarmeClient}
        className={`w-full font-bold py-2 px-4 rounded-md transition-colors ${
          !isFormValid || loading || !pagarmeClient
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-accent-600 text-white hover:bg-accent-700'
        }`}
      >
        {loading ? 'Processando...' : `Pagar ${formatCurrency(amount / 100)}`}
      </button>
    </div>
  );
};

function formatCurrency(value: number) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(value);
}

export default PagarMePayment;