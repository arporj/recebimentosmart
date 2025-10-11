// src/pages/SubscriptionPage.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { CreditCard, CheckCircle, Gift, Star, Clock, ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import axios from 'axios';
import { format, parseISO, isFuture } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatCurrency } from '../lib/utils';
import PagarMePayment from '../components/PagarMePayment'; // Importa o novo componente

// Tipagem para os dados recebidos da RPC
interface Plan {
  name: string;
  price_monthly: number;
  features?: string[];
}

interface UserData {
  credits: number;
  plan: string;
  valid_until: string;
}

interface PageData {
  plans: Plan[];
  user: UserData;
}

type PlanName = 'basico' | 'pro' | 'premium';

const SubscriptionPage = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pageData, setPageData] = useState<PageData | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanName | null>('basico'); // Inicializar com plano básico como padrão
  
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'pending' | 'completed' | 'failed'>('idle');
  const [currentExternalReference, setCurrentExternalReference] = useState<string | null>(null);

  // Busca os dados iniciais da página
  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      setLoading(true);
      try {
        console.log('Buscando dados da página de assinatura...');
        
        // Criar dados padrão para garantir que a página seja renderizada corretamente
        const defaultData: PageData = {
          plans: [
            { name: 'Básico', price_monthly: 19.90 },
            { name: 'Pró', price_monthly: 39.90 },
            { name: 'Premium', price_monthly: 59.90 }
          ],
          user: {
            credits: 0,
            plan: 'trial',
            valid_until: ''
          }
        };
        
        // Tentar buscar dados do servidor
        const { data, error } = await supabase.rpc('get_subscription_page_data');
        
        if (error) {
          console.error('Erro na RPC get_subscription_page_data:', error);
          console.log('Usando dados padrão devido ao erro');
          setPageData(defaultData);
          return;
        }
        
        console.log('Dados recebidos:', data);
        
        // Verificar se os dados estão no formato esperado
        if (!data) {
          console.error('Dados recebidos em formato inválido:', data);
          console.log('Usando dados padrão devido a dados inválidos');
          setPageData(defaultData);
          return;
        }
        
        // Garantir que os planos estejam definidos
        if (!data.plans || !Array.isArray(data.plans) || data.plans.length === 0) {
          console.warn('Planos não encontrados ou em formato inválido, usando valores padrão');
          data.plans = defaultData.plans;
        }
        
        // Garantir que os dados do usuário estejam definidos
        if (!data.user) {
          console.warn('Dados do usuário não encontrados, usando valores padrão');
          data.user = defaultData.user;
        }
        
        setPageData(data);

        // Se o usuário já tem um plano ativo, marca como pagamento completo
        if (data.user && data.user.plan !== 'trial' && data.user.valid_until && isFuture(parseISO(data.user.valid_until))) {
          setPaymentStatus('completed');
        }

      } catch (error: any) {
        console.error('Erro completo:', error);
        toast.error(`Erro ao carregar dados: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user]);

  // Lógica de polling para verificar o status do pagamento (semelhante à anterior)
  useEffect(() => {
    // ... (a lógica de polling pode ser mantida como estava, verificando a tabela de transações)
  }, [paymentStatus, currentExternalReference]);

  const finalAmount = useMemo(() => {
    console.log('Calculando valor final, selectedPlan:', selectedPlan, 'pageData:', pageData);
    
    if (!selectedPlan) {
      console.log('Nenhum plano selecionado');
      return 0;
    }
    
    if (!pageData) {
      console.log('pageData é null ou undefined');
      return 0;
    }
    
    // Encontrar o plano selecionado no array de planos
    const selectedPlanObj = pageData.plans.find(plan => {
      const planName = plan.name.toLowerCase();
      return planName === selectedPlan || 
             (selectedPlan === 'basico' && planName === 'básico') || 
             (selectedPlan === 'pro' && planName === 'pró');
    });
    
    // Obter o preço do plano selecionado
    const planPrice = selectedPlanObj ? selectedPlanObj.price_monthly : 0;
    
    // Usar 0 como valor padrão para créditos se não estiverem disponíveis
    const userCredits = pageData.user?.credits || 0;
    
    console.log('Preço do plano:', planPrice, 'Créditos do usuário:', userCredits);
    const finalValue = Math.max(0, planPrice - userCredits);
    console.log('Valor final calculado:', finalValue);
    
    return finalValue;
  }, [selectedPlan, pageData]);

  const renderCurrentPlan = () => {
    if (!pageData || !pageData.user) return null;
    const { plan, valid_until } = pageData.user;

    if (plan && plan !== 'trial' && valid_until && isFuture(parseISO(valid_until))) {
      return (
        <div className="bg-secondary-50 border border-secondary-200 rounded-md p-4 mb-6 text-center">
          <CheckCircle className="h-8 w-8 text-secondary-500 mx-auto mb-2" />
          <p className="text-secondary-700 font-medium mb-1">Sua assinatura do plano <span className="font-bold">{plan}</span> está ativa!</p>
          <p className="text-sm text-secondary-700">Próximo vencimento: <span className="font-bold">{format(parseISO(valid_until), 'dd/MM/yyyy')}</span></p>
        </div>
      );
    }
    return null;
  };

  const handlePlanSelection = (plan: PlanName) => {
    console.log('Plano selecionado:', plan);
    setSelectedPlan(plan);
  }

  const renderPlanSelection = () => {
    console.log('Renderizando seleção de planos, pageData:', pageData);
    
    // Se não tiver dados, mostrar mensagem de carregamento
    if (!pageData) {
      console.log('pageData é null ou undefined');
      return <p className="text-neutral-500">Carregando informações dos planos...</p>;
    }
    
    // Verificar se temos planos disponíveis
    if (!pageData.plans || !Array.isArray(pageData.plans) || pageData.plans.length === 0) {
      console.log('Nenhum plano disponível');
      return <p className="text-neutral-500">Nenhum plano disponível no momento.</p>;
    }
    
    console.log('Planos disponíveis:', pageData.plans);
    
    // Mapear os nomes dos planos para as chaves internas
    const planMapping: Record<string, PlanName> = {
      'básico': 'basico',
      'pró': 'pro',
      'premium': 'premium'
    };
    
    return (
      <div className="space-y-4 mb-6">
        {pageData.plans.map(plan => {
          // Normalizar o nome do plano para o formato interno
          const planKey = planMapping[plan.name.toLowerCase()] || plan.name.toLowerCase() as PlanName;
          const price = plan.price_monthly;
          console.log(`Preço do plano ${plan.name}:`, price);
          
          return (
            <div 
              key={planKey}
              onClick={() => handlePlanSelection(planKey)}
              className={`p-4 border rounded-lg cursor-pointer transition-all ${selectedPlan === planKey ? 'border-accent-600 ring-2 ring-accent-500' : 'border-neutral-300'}`}>
              <h3 className="font-bold text-lg text-accent-700">{plan.name}</h3>
              <p className="text-neutral-600 text-sm">{plan.features ? plan.features[0] : 'Descrição breve do plano.'}</p>
              <p className="text-xl font-bold mt-2">{formatCurrency(price)}<span className="text-sm font-normal">/mês</span></p>
            </div>
          );
        })}
      </div>
    );
  };

  const renderPaymentSummary = () => {
    console.log('Renderizando resumo de pagamento, selectedPlan:', selectedPlan, 'pageData:', pageData);
    
    if (!selectedPlan) {
      console.log('Nenhum plano selecionado para mostrar resumo');
      return null;
    }
    
    if (!pageData) {
      console.log('pageData é null ou undefined');
      return null;
    }
    
    // Encontrar o plano selecionado no array de planos
    const selectedPlanObj = pageData.plans.find(plan => {
      const planName = plan.name.toLowerCase();
      return planName === selectedPlan || 
             (selectedPlan === 'basico' && planName === 'básico') || 
             (selectedPlan === 'pro' && planName === 'pró');
    });
    
    // Obter o preço do plano selecionado
    const planPrice = selectedPlanObj ? selectedPlanObj.price_monthly : 0;
    const planDisplayName = selectedPlanObj ? selectedPlanObj.name : selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1);
    
    // Usar 0 como valor padrão para créditos se não estiverem disponíveis
    const userCredits = pageData.user?.credits || 0;
    
    console.log('Resumo - Preço do plano:', planPrice, 'Créditos do usuário:', userCredits);

    return (
        <div className="mb-6 p-4 border border-secondary-200 rounded-md bg-neutral-50 space-y-2">
            <h3 className="font-semibold text-lg mb-2">Resumo do Pagamento</h3>
            <div className="flex justify-between items-center">
                <span className="text-sm text-neutral-600">Plano {planDisplayName}:</span>
                <span className="font-medium text-neutral-800">{formatCurrency(planPrice)}</span>
            </div>
            {userCredits > 0 && (
                <div className="flex justify-between items-center text-secondary-600">
                    <span className="text-sm flex items-center"><Gift className="h-4 w-4 mr-1" /> Créditos por Indicação:</span>
                    <span className="font-medium">- {formatCurrency(userCredits)}</span>
                </div>
            )}
            <hr className="my-2" />
            <div className="flex justify-between items-center text-lg font-bold text-accent-700">
                <span>Total a Pagar:</span>
                <span>{formatCurrency(finalAmount)}</span>
            </div>
        </div>
    );
  }

  if (loading) {
    return <p className="text-center text-neutral-500">Carregando...</p>;
  }

  if (paymentStatus === 'completed') {
    return <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">{renderCurrentPlan()}</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 p-4 sm:p-8">
      <div className="max-w-5xl mx-auto">
        {pageData && paymentStatus !== 'completed' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Coluna de Planos e Pagamento */}
            <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-sm">
              <div className="flex items-center mb-6">
                <CreditCard className="h-6 w-6 text-accent-600 mr-3" />
                <h1 className="text-2xl font-bold text-neutral-800">Faça sua Assinatura</h1>
              </div>

              {renderCurrentPlan()}

              <h2 className="text-xl font-semibold text-gray-800 mb-4">1. Escolha seu Plano</h2>
              {renderPlanSelection()}
              
              <div className="mt-8">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">2. Realize o Pagamento</h3>
                <PagarMePayment amount={finalAmount * 100} />
              </div>
            </div>

            {/* Coluna de Resumo */}
            <div className="bg-white p-6 rounded-lg shadow-sm h-fit sticky top-8">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Resumo do Pedido</h2>
              {renderPaymentSummary()}
            </div>
          </div>
        ) : (
          <p className="text-center text-neutral-500">Não foi possível carregar os dados da assinatura.</p>
        )}
      </div>
    </div>
  );
};

export default SubscriptionPage;
