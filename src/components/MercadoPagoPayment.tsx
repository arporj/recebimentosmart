
import React, { useEffect } from 'react';
import useMercadoPago from '../hooks/useMercadoPago';

interface MercadoPagoPaymentProps {
  preferenceId: string;
}

const MercadoPagoPayment: React.FC<MercadoPagoPaymentProps> = ({ preferenceId }) => {
  const mercadoPago = useMercadoPago();

  useEffect(() => {
    if (mercadoPago && preferenceId) {
      mercadoPago.checkout({
        preference: {
          id: preferenceId,
        },
        render: {
          container: '#payment-brick-container',
          label: 'Pagar',
        },
      });
    }
  }, [mercadoPago, preferenceId]);

  return <div id="payment-brick-container"></div>;
};

export default MercadoPagoPayment;
