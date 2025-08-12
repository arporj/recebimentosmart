
import React, { useEffect } from 'react';
import useMercadoPago from '../hooks/useMercadoPago';

interface MercadoPagoPaymentProps {
  preferenceId: string;
}

const MercadoPagoPayment: React.FC<MercadoPagoPaymentProps> = ({ preferenceId }) => {
  const mercadoPago = useMercadoPago();

  useEffect(() => {
    if (mercadoPago && preferenceId) {
      // Inicializar o SDK MercadoPago.JS V2 e gerar device ID
      const mp = new (window as any).MercadoPago(process.env.REACT_APP_MP_PUBLIC_KEY, {
        locale: 'pt-BR'
      });
      const deviceId = mp.device.sessionId();
      // Enviar deviceId para o backend junto com a preferência
      mercadoPago.checkout({
        preference: {
          id: preferenceId,
        },
        render: {
          container: '#payment-brick-container',
          label: 'Pagar',
        },
        // deviceId pode ser enviado como parte dos dados do payer ou metadata
        metadata: {
          device_id: deviceId
        }
      });
    }
  }, [mercadoPago, preferenceId]);

  return <div id="payment-brick-container"></div>;
};

export default MercadoPagoPayment;
