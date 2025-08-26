import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, ArrowRight, BarChart, Mail, Users, Zap } from 'lucide-react';

const LandingPage: React.FC = () => {
  const pricingTiers = [
    {
      name: 'Básico',
      price: '15,00',
      features: [
        'Controle de usuários',
        'Notificação por e-mail',
      ],
      icon: (props: any) => <Users {...props} />
    },
    {
      name: 'Pro',
      price: '25,00',
      features: [
        'Tudo do plano Básico',
        'Relatórios detalhados',
        'Análises de performance',
      ],
      icon: (props: any) => <BarChart {...props} />
    },
    {
      name: 'Premium',
      price: '40,00',
      features: [
        'Tudo do plano Pro',
        'Notificação por WhatsApp',
        'Suporte prioritário',
      ],
      icon: (props: any) => <Zap {...props} />
    },
  ];

  return (
    <div className="bg-gray-50 min-h-screen text-gray-800">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-custom">Recebimento Smart</h1>
          <nav>
            <Link to="/login" className="text-gray-600 hover:text-custom mr-4">Login</Link>
            <Link to="/cadastro" className="bg-custom text-white font-bold py-2 px-4 rounded-lg hover:bg-custom-hover transition-colors">
              Registrar
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <main className="container mx-auto px-6 py-16 text-center">
        <h2 className="text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight">
          Simplifique a gestão de seus recebimentos.
        </h2>
        <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
          Automatize seus processos, ganhe tempo e tenha total controle sobre suas finanças com a nossa plataforma inteligente.
        </p>
        <a href="#pricing" className="mt-8 inline-block bg-custom text-white font-bold py-3 px-8 rounded-lg hover:bg-custom-hover transition-colors text-lg">
          Conheça os Planos <ArrowRight className="inline-block ml-2" size={20} />
        </a>
      </main>

      {/* Pricing Section */}
      <section id="pricing" className="bg-white py-20">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h3 className="text-3xl font-bold text-gray-900">Planos e Preços</h3>
            <p className="text-gray-600 mt-2">Escolha o plano que melhor se adapta ao seu negócio.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {pricingTiers.map((tier) => (
              <div key={tier.name} className="bg-gray-50 rounded-xl shadow-lg p-8 flex flex-col">
                <div className="flex-grow">
                  <div className="flex items-center justify-center h-16 w-16 rounded-full bg-custom text-white mx-auto mb-6">
                    <tier.icon size={32} />
                  </div>
                  <h4 className="text-2xl font-bold text-center text-gray-900">{tier.name}</h4>
                  <p className="text-center my-4">
                    <span className="text-4xl font-extrabold text-gray-900">R$ {tier.price}</span>
                    <span className="text-gray-500">/mês</span>
                  </p>
                  <ul className="space-y-3 text-gray-600">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start">
                        <CheckCircle className="text-green-500 mr-3 mt-1 flex-shrink-0" size={20} />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-8">
                  <Link to="/cadastro" className="w-full block text-center bg-custom text-white font-bold py-3 px-6 rounded-lg hover:bg-custom-hover transition-colors">
                    Começar Agora
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-100 py-8">
        <div className="container mx-auto px-6 text-center text-gray-600">
          <p>&copy; {new Date().getFullYear()} Recebimento Smart. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
