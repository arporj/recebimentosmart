import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, ArrowRight, BarChart, Users, Zap, DollarSign, ShieldCheck, Rocket } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';

const normalizePlanName = (name: string) => 
  name.toLowerCase().normalize("NFD").replace(/[^\w\s]/gi, '');

const initialTiers = [
  {
    name: 'Básico',
    price: '--,--',
    features: [
      'Controle de usuários',
      'Notificação por e-mail',
      'Dashboard simples',
    ],
    icon: (props: any) => <Users {...props} />,
    popular: false,
  },
  {
    name: 'Pro',
    price: '--,--',
    features: [
      'Tudo do plano Básico',
      'Relatórios detalhados',
      'Análises de performance',
      'Suporte via chat',
    ],
    icon: (props: any) => <BarChart {...props} />,
    popular: true,
  },
  {
    name: 'Premium',
    price: '--,--',
    features: [
      'Tudo do plano Pro',
      'Notificação por WhatsApp',
      'Suporte prioritário',
      'Acesso antecipado a recursos',
    ],
    icon: (props: any) => <Zap {...props} />,
    popular: false,
  },
];

const LandingPage: React.FC = () => {
  const [pricingTiers, setPricingTiers] = useState(initialTiers);

  useEffect(() => {
    const fetchPrices = async () => {
      const { data, error } = await supabase.rpc('get_all_plans_with_prices');

      if (error) {
        console.error("Error fetching prices:", error);
      } else if (data) {
        setPricingTiers(prevTiers => prevTiers.map(tier => {
          // Lógica de busca corrigida para usar a normalização
          const planData = data.find(p => normalizePlanName(p.name) === normalizePlanName(tier.name));
          const newPrice = planData ? formatCurrency(planData.price_monthly) : tier.price;
          return { ...tier, price: newPrice.replace('R$\xa0', '') };
        }));
      }
    };

    fetchPrices();
  }, []);

  const features = [
    {
      icon: <DollarSign size={32} className="text-accent-600" />,
      title: 'Gestão de Cobranças',
      description: 'Automatize o envio de cobranças e lembretes para seus clientes, reduzindo a inadimplência.',
    },
    {
      icon: <Users size={32} className="text-secondary-600" />,
      title: 'Controle de Clientes',
      description: 'Mantenha um cadastro completo e organizado de seus clientes, com histórico de pagamentos.',
    },
    {
      icon: <BarChart size={32} className="text-accent-600" />,
      title: 'Relatórios Inteligentes',
      description: 'Tenha acesso a relatórios visuais que ajudam a entender a saúde financeira do seu negócio.',
    },
    {
      icon: <ShieldCheck size={32} className="text-secondary-600" />,
      title: 'Segurança de Dados',
      description: 'Seus dados e de seus clientes são protegidos com as melhores práticas de segurança do mercado.',
    },
  ];

  return (
    <div className="bg-neutral-50 min-h-screen text-neutral-800 font-sans">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-50 border-b border-secondary-100">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-custom">Recebimento Smart</h1>
          <nav>
            <Link to="/login" className="text-neutral-600 hover:text-accent-600 mr-4 font-medium">Login</Link>
            <Link to="/cadastro" className="bg-custom text-white font-bold py-2 px-4 rounded-lg hover:bg-custom-hover transition-colors">
              Registrar
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <main className="container mx-auto px-6 pt-24 pb-16 text-center">
        <h2 className="text-4xl md:text-6xl font-extrabold text-neutral-900 leading-tight">
          Gestão de Recebimentos, <span className="text-custom">Simples e Inteligente</span>.
        </h2>
        <p className="mt-4 text-lg text-neutral-600 max-w-3xl mx-auto">
          Pare de perder tempo com planilhas. Automatize suas cobranças, gerencie seus clientes e visualize suas finanças de forma clara e eficiente.
        </p>
        <a href="#pricing" className="mt-8 inline-block bg-accent-600 text-white font-bold py-4 px-10 rounded-lg hover:bg-accent-700 transition-transform transform hover:scale-105 text-lg shadow-md">
          Comece Agora com 7 Dias Grátis
        </a>
      </main>

      {/* Features Section */}
      <section id="features" className="bg-white py-20 border-t border-b border-secondary-100">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h3 className="text-3xl md:text-4xl font-bold text-neutral-900">Tudo que você precisa para crescer</h3>
            <p className="text-neutral-600 mt-2">Ferramentas poderosas para impulsionar seu negócio.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="bg-neutral-50 p-8 rounded-xl shadow-md hover:shadow-xl transition-shadow duration-300 border border-secondary-100">
                <div className="mb-4">{feature.icon}</div>
                <h4 className="text-xl font-bold text-neutral-900 mb-2">{feature.title}</h4>
                <p className="text-neutral-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section id="how-it-works" className="py-20">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h3 className="text-3xl md:text-4xl font-bold text-neutral-900">Comece em 3 Passos Simples</h3>
          </div>
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div className="p-6">
              <div className="flex items-center justify-center h-20 w-20 rounded-full bg-secondary-600 text-white mx-auto mb-6 font-bold text-3xl shadow-md">1</div>
              <h4 className="text-xl font-bold text-neutral-900 mb-2">Crie sua Conta</h4>
              <p className="text-neutral-600">O cadastro é rápido e você já ganha 7 dias de teste para explorar tudo.</p>
            </div>
            <div className="p-6">
              <div className="flex items-center justify-center h-20 w-20 rounded-full bg-accent-600 text-white mx-auto mb-6 font-bold text-3xl shadow-md">2</div>
              <h4 className="text-xl font-bold text-neutral-900 mb-2">Cadastre seus Clientes</h4>
              <p className="text-neutral-600">Importe ou cadastre seus clientes e configure os valores e datas de pagamento.</p>
            </div>
            <div className="p-6">
              <div className="flex items-center justify-center h-20 w-20 rounded-full bg-secondary-600 text-white mx-auto mb-6 font-bold text-3xl shadow-md">3</div>
              <h4 className="text-xl font-bold text-neutral-900 mb-2">Relaxe e Acompanhe</h4>
              <p className="text-neutral-600">Deixe nosso sistema trabalhar por você e acompanhe seu faturamento crescer.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="bg-white py-20">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h3 className="text-3xl md:text-4xl font-bold text-neutral-900">Planos e Preços</h3>
            <p className="text-neutral-600 mt-2">Escolha o plano que melhor se adapta ao seu negócio. Cancele quando quiser.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 items-center">
            {pricingTiers.map((tier) => (
              <div key={tier.name} className={`bg-neutral-50 rounded-xl shadow-lg p-8 flex flex-col relative ${tier.popular ? 'border-2 border-accent-500 transform scale-105 ring-2 ring-accent-500 ring-opacity-50' : ''}`}>
                {tier.popular && (
                  <div className="absolute top-0 -translate-y-1/2 bg-accent-600 text-white text-sm font-bold px-4 py-1 rounded-full right-8 shadow-sm">Mais Popular</div>
                )}
                <div className="flex-grow">
                  <div className="flex items-center justify-center h-16 w-16 rounded-full bg-accent-600 text-white mx-auto mb-6 shadow-sm">
                    <tier.icon size={32} />
                  </div>
                  <h4 className="text-2xl font-bold text-center text-neutral-900">{tier.name}</h4>
                  <p className="text-center my-4">
                    <span className="text-4xl font-extrabold text-neutral-900">R$ {tier.price}</span>
                    <span className="text-neutral-500">/mês</span>
                  </p>
                  <ul className="space-y-3 text-neutral-600 mt-6">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start">
                        <CheckCircle className="text-secondary-600 mr-3 mt-1 flex-shrink-0" size={20} />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-8">
                  <Link to="/cadastro" className={`w-full block text-center font-bold py-3 px-6 rounded-lg transition-colors shadow-sm ${tier.popular ? 'bg-accent-600 text-white hover:bg-accent-700' : 'bg-white text-accent-600 border border-accent-600 hover:bg-neutral-100'}`}>
                    Começar Agora
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-accent-600 text-white">
        <div className="container mx-auto px-6 py-16 text-center">
          <h3 className="text-3xl font-bold">Pronto para decolar seu negócio?</h3>
          <p className="mt-2 text-lg opacity-90">Junte-se a centenas de empreendedores que já estão otimizando seu tempo e dinheiro.</p>
          <Link to="/cadastro" className="mt-8 inline-block bg-white text-accent-600 font-bold py-3 px-8 rounded-lg hover:bg-neutral-200 transition-colors text-lg shadow-sm">
            Criar minha conta grátis <Rocket className="inline-block ml-2" size={20} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-neutral-100 py-8 border-t border-secondary-100">
        <div className="container mx-auto px-6 text-center text-neutral-600">
          <p>&copy; {new Date().getFullYear()} Recebimento Smart. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;