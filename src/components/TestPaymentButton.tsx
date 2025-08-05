
import React, { useState } from 'react';
import { Button } from './ui/button';
import MercadoPagoPayment from './MercadoPagoPayment';
import { useAuth } from '../contexts/AuthContext';

const TestPaymentButton: React.FC = () => {
  const [preferenceId, setPreferenceId] = useState<string | null>(null);
  const { user } = useAuth();

  const createPreference = async () => {
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
      }
    } catch (error) {
      console.error('Erro ao criar preferência:', error);
    }
  };

  if (preferenceId) {
    return <MercadoPagoPayment preferenceId={preferenceId} />;
  }

  return <Button onClick={createPreference}>Testar Pagamento</Button>;
};

export default TestPaymentButton;
