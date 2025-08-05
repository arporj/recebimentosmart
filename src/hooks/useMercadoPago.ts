
import { useEffect, useState } from 'react';
import { loadMercadoPago } from '@mercadopago/sdk-js';

const useMercadoPago = () => {
  const [mercadoPago, setMercadoPago] = useState<any>(null);

  useEffect(() => {
    const initializeMercadoPago = async () => {
      await loadMercadoPago();
      const mp = new window.MercadoPago(import.meta.env.VITE_MERCADO_PAGO_PUBLIC_KEY);
      setMercadoPago(mp);
    };

    initializeMercadoPago();
  }, []);

  return mercadoPago;
};

export default useMercadoPago;
