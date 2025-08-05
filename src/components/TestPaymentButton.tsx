import React, { useState } from 'react';
import MercadoPagoPayment from './MercadoPagoPayment';
import { useAuth } from '../contexts/AuthContext';

const TestPaymentButton: React.FC = () => {
  const [preferenceId, setPreferenceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  const createPreference = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/mp/create-preference', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Assinatura Mensal - Teste',
          unit_price: 1, // 1 centavo para teste
          quantity: 1,
          userId: user?.id,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setPreferenceId(data.preferenceId);
      } else {
        // Adicionar um toast de erro aqui seria uma boa prática
        console.error('Falha ao criar preferência de pagamento');
      }
    } catch (error) {
      console.error('Erro ao criar preferência:', error);
    } finally {
      setLoading(false);
    }
  };

  if (preferenceId) {
    return <MercadoPagoPayment preferenceId={preferenceId} />;
  }

  return (
    <button 
      onClick={createPreference} 
      disabled={loading}
      className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-custom hover:bg-custom-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-custom disabled:opacity-50"
    >
      {loading ? 'Gerando Pagamento...' : 'Testar Pagamento com Mercado Pago'}
    </button>
  );
};

export default TestPaymentButton;