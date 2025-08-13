
import React, { useEffect } from 'react';
import useMercadoPago from '../hooks/useMercadoPago';

interface MercadoPagoPaymentProps {
  preferenceId: string;
}

const MercadoPagoPayment: React.FC<MercadoPagoPaymentProps> = ({ preferenceId }) => {
  const mercadoPago = useMercadoPago();

  useEffect(() => {
    if (mercadoPago && preferenceId) {
      // Inicializar Brick/CardForm oficial do MercadoPago.JS V2
      const mp = new window.MercadoPago(import.meta.env.VITE_MERCADO_PAGO_PUBLIC_KEY, {
        locale: 'pt-BR'
      });
      const bricksBuilder = mp.bricks();
      bricksBuilder.create('cardPayment', '#payment-brick-container', {
        initialization: {
          amount: 1.00, // Valor de teste
          preferenceId: preferenceId,
        },
        customization: {
          paymentMethods: {
            creditCard: 'all',
            debitCard: 'all',
          },
          visual: {
            style: {
              theme: 'default',
            },
          },
        },
        callbacks: {
          onReady: () => {
            // Brick pronto
          },
          onSubmit: (cardFormData) => {
            // Aqui você pode enviar o token do cartão e deviceId para o backend
            // Exemplo: fetch('/api/mp/process-card', { ... })
          },
          onError: (error) => {
            console.error('Erro no Brick/CardForm:', error);
          },
        },
      });
    }
  }, [mercadoPago, preferenceId]);

  return <div id="payment-brick-container"></div>;
};

export default MercadoPagoPayment;
