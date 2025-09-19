import React from 'react';
import { Link } from 'react-router-dom';
import { XCircle } from 'lucide-react';

const PaymentFailurePage: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-50 text-center p-4">
      <XCircle className="w-16 h-16 text-red-500 mb-4" />
      <h1 className="text-3xl font-bold text-neutral-800 mb-2">Pagamento Recusado</h1>
      <p className="text-neutral-600 mb-6">Houve um problema ao processar seu pagamento. Por favor, tente novamente.</p>
      <p className="text-sm text-neutral-500 mb-8">Nenhum valor foi cobrado.</p>
      <Link 
        to="/configuracoes"
        className="px-6 py-2 bg-accent-600 text-white font-semibold rounded-md hover:bg-accent-700 transition-colors shadow-sm"
      >
        Tentar Novamente
      </Link>
    </div>
  );
};

export default PaymentFailurePage;
