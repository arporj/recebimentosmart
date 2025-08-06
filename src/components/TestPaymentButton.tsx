import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

// Declara o tipo MercadoPago para o TypeScript, para que ele reconheça o objeto global
declare const MercadoPago: any;

const TestPaymentButton: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  // Sua Chave Pública do Mercado Pago
  const mpPublicKey = 'TEST-6122fc5e-2330-49f2-a7ac-b1f0e00e5c54';

  const handleTestCardPayment = async () => {
    setLoading(true);
    toast.loading('Iniciando pagamento de teste...');

    try {
      // Inicializa a biblioteca do Mercado Pago
      const mp = new MercadoPago(mpPublicKey);

      // Dados do cartão de teste (Mastercard)
      const cardData = {
        cardNumber: "5031433215406351",
        cardholderName: "TESTUSER1191943637",
        cardExpirationMonth: "11",
        cardExpirationYear: "2030",
        securityCode: "123",
        identificationType: "CPF",
        identificationNumber: "12345678909" // CPF de teste válido
      };

      // Cria o token do cartão de forma segura
      const { token } = await mp.createCardToken(cardData);

      if (!token) {
        throw new Error('Não foi possível gerar o token do cartão.');
      }

      toast.dismiss();
      toast.loading('Processando pagamento no backend...');

      // Envia o token para o seu backend para processar o pagamento
      const response = await fetch('/api/mp/process-card-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: token,
          description: 'Pagamento de Teste - Assinatura',
          transaction_amount: 0.01, // Usando 1 centavo para o teste
          payer_email: user?.email || 'test_user@test.com',
          userId: user?.id,
        }),
      });

      const result = await response.json();
      toast.dismiss();

      if (response.ok && result.success) {
        toast.success(`Pagamento de teste ${result.status}! ID: ${result.paymentId}`);
      } else {
        throw new Error(result.message || 'Falha ao processar o pagamento no backend.');
      }

    } catch (error: any) {
      toast.dismiss();
      console.error('Erro no pagamento de teste:', error);
      toast.error(error.message || 'Ocorreu um erro inesperado.');
    } finally {
      setLoading(false);
    }
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
