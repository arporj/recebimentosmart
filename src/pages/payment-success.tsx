import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';

const PaymentSuccessPage: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 text-center p-4">
      <CheckCircle className="w-16 h-16 text-green-500 mb-4" />
      <h1 className="text-3xl font-bold text-gray-800 mb-2">Pagamento Aprovado!</h1>
      <p className="text-gray-600 mb-6">Seu pagamento foi processado com sucesso. Obrigado!</p>
      <p className="text-sm text-gray-500 mb-8">Você será redirecionado em breve ou pode voltar para o início.</p>
      <Link 
        to="/"
        className="px-6 py-2 bg-custom text-white font-semibold rounded-md hover:bg-custom-hover transition-colors"
      >
        Voltar ao Início
      </Link>
    </div>
  );
};

export default PaymentSuccessPage;
