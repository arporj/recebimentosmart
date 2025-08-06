import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

// Declara o tipo MercadoPago para o TypeScript
declare const MercadoPago: any;

const TestPaymentButton: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  const mpPublicKey = 'TEST-6122fc5e-2330-49f2-a7ac-b1f0e00e5c54';

  const handleTestCardPayment = async () => {
    setLoading(true);
    toast.loading('Iniciando pagamento de teste...');

    // Adiciona um pequeno delay para garantir que o script do MP carregou
    setTimeout(async () => {
      try {
        const mp = new MercadoPago(mpPublicKey);

        const cardData = {
          cardNumber: "5031433215406351", // Mastercard de teste
          cardholderName: "APRO", // Nome para forçar aprovação
          cardExpirationMonth: "11",
          cardExpirationYear: "2030",
          securityCode: "123",
          identificationType: "CPF",
          identificationNumber: "12345678909", // CPF de teste genérico
        };

        const token = await mp.createCardToken(cardData);

        if (!token) {
          throw new Error('Não foi possível gerar o token do cartão. Verifique os dados.');
        }

        toast.dismiss();
        toast.loading('Processando pagamento no backend...');

        const response = await fetch('/api/mp/process-card-payment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token: token.id, // Enviando o ID do token
            description: 'Pagamento de Teste - Assinatura',
            transaction_amount: 0.01,
            payer_email: user?.email || 'test_user@test.com',
            userId: user?.id,
          }),
        });

        const result = await response.json();
        toast.dismiss();

        if (response.ok && result.success) {
          toast.success(`Pagamento ${result.status}! ID: ${result.paymentId}`);
        } else {
          throw new Error(result.message || 'Falha ao processar o pagamento.');
        }

      } catch (error: any) {
        toast.dismiss();
        console.error('Erro no pagamento de teste:', error);
        toast.error(error.message || 'Ocorreu um erro inesperado.');
      } finally {
        setLoading(false);
      }
    }, 500); // Atraso de 500ms
  };

  return (
    <button
      onClick={handleTestCardPayment}
      disabled={loading}
      className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
    >
      {loading ? 'Processando Teste...' : 'Testar Pagamento com Cartão'}
    </button>
  );
};

export default TestPaymentButton;