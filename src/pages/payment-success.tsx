import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';

const PaymentSuccessPage: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-50 text-center p-4">
      <CheckCircle className="w-16 h-16 text-secondary-500 mb-4" />
      <h1 className="text-3xl font-bold text-neutral-800 mb-2">Pagamento Aprovado!</h1>
      <p className="text-neutral-600 mb-6">Seu pagamento foi processado com sucesso. Obrigado!</p>
      <p className="text-sm text-neutral-500 mb-8">Você será redirecionado em breve ou pode voltar para o início.</p>
      <Link 
        to="/"
        className="px-6 py-2 bg-accent-600 text-white font-semibold rounded-md hover:bg-accent-700 transition-colors shadow-sm"
      >
        Voltar ao Início
      </Link>
    </div>
  );
};

export default PaymentSuccessPage;
