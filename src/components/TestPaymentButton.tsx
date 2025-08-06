import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

const TestPaymentButton: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  const createPreferenceAndRedirect = async () => {
    setLoading(true);
    toast.loading('Preparando checkout de teste...');

    try {
      const response = await fetch('/api/mp/create-preference', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Assinatura Mensal - Teste de Qualidade',
          unit_price: 1.00, // Valor que funcionou anteriormente
          quantity: 1,
          userId: user?.id,
        }),
      });

      const data = await response.json();
      toast.dismiss();

      if (response.ok && data.init_point) {
        // Redireciona o usuário para a página de checkout do Mercado Pago
        window.location.href = data.init_point;
      } else {
        throw new Error(data.message || 'Não foi possível iniciar o checkout.');
      }

    } catch (error: any) {
      toast.dismiss();
      console.error('Erro ao criar preferência:', error);
      toast.error(error.message || 'Ocorreu um erro inesperado.');
    } finally {
      // O setLoading não será setado para false aqui, pois a página será redirecionada
    }
  };

  return (
    <button
      onClick={createPreferenceAndRedirect}
      disabled={loading}
      className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
    >
      {loading ? 'Redirecionando...' : 'Iniciar Pagamento de Teste Oficial'}
    </button>
  );
};

export default TestPaymentButton;
