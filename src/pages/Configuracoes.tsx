import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { CurrencyInput } from '../components/ui/CurrencyInput';
import { supabase } from '../lib/supabase';
import TestPaymentButton from '../components/TestPaymentButton';

interface PlanPrices {
  basico: number;
  pro: number;
  premium: number;
}

// Função para normalizar nomes de planos (remove acentos e torna minúsculo)
const normalizePlanName = (name: string) => 
  name.toLowerCase().normalize("NFD").replace(/[^\w\s]/gi, '');

const Configuracoes = () => {
  const [prices, setPrices] = useState<PlanPrices>({ basico: 0, pro: 0, premium: 0 });
  const [initialPrices, setInitialPrices] = useState<PlanPrices>({ basico: 0, pro: 0, premium: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPrices = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_all_plans_with_prices');

        if (error) throw error;

        if (data) {
          const fetchedPrices: Partial<PlanPrices> = {};
          data.forEach(plan => {
            const normalizedName = normalizePlanName(plan.name);
            const price = Math.round(parseFloat(plan.price_monthly || '0') * 100);
            if (normalizedName === 'basico') fetchedPrices.basico = price;
            if (normalizedName === 'pro') fetchedPrices.pro = price;
            if (normalizedName === 'premium') fetchedPrices.premium = price;
          });

          const numericPrices: PlanPrices = {
            basico: fetchedPrices.basico || 0,
            pro: fetchedPrices.pro || 0,
            premium: fetchedPrices.premium || 0,
          };
          
          setPrices(numericPrices);
          setInitialPrices(numericPrices);
        }
      } catch (error: any) {
        toast.error(error.message || 'Não foi possível carregar os preços dos planos.');
        console.error('Erro ao buscar preços:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPrices();
  }, []);

  const handlePriceChange = (plan: keyof PlanPrices, value: number | undefined) => {
    setPrices(prev => ({ ...prev, [plan]: value || 0 }));
  };

  const handleUpdatePrices = async () => {
    setLoading(true);
    
    const { error } = await supabase.rpc('update_plan_prices', { prices_data: prices });

    if (error) {
      toast.error(`Falha ao atualizar os preços: ${error.message}`);
      console.error('Erro ao salvar preços:', error);
    } else {
      toast.success('Preços dos planos atualizados com sucesso!');
      setInitialPrices(prices);
    }
    setLoading(false);
  };

  const hasChanges = JSON.stringify(prices) !== JSON.stringify(initialPrices);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Configurações do Sistema</h1>
      <div className="space-y-4">
        {/* Card de Preços dos Planos */}
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">Preços dos Planos</h3>
            <div className="mt-2 max-w-xl text-sm text-gray-500">
              <p>Defina o valor mensal para cada um dos planos de assinatura.</p>
            </div>
            <div className="mt-5 space-y-6">
              {loading ? (
                <p>Carregando preços...</p>
              ) : (
                <>
                  <div className="space-y-2">
                    <label htmlFor="price-basico" className="block text-sm font-medium text-gray-700">Plano Básico (R$)</label>
                    <CurrencyInput
                      id="price-basico"
                      value={String(prices.basico)}
                      onValueChange={(value) => handlePriceChange('basico', value)}
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="price-pro" className="block text-sm font-medium text-gray-700">Plano Pró (R$)</label>
                    <CurrencyInput
                      id="price-pro"
                      value={String(prices.pro)}
                      onValueChange={(value) => handlePriceChange('pro', value)}
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="price-premium" className="block text-sm font-medium text-gray-700">Plano Premium (R$)</label>
                    <CurrencyInput
                      id="price-premium"
                      value={String(prices.premium)}
                      onValueChange={(value) => handlePriceChange('premium', value)}
                      disabled={loading}
                    />
                  </div>
                  <button 
                    onClick={handleUpdatePrices} 
                    disabled={loading || !hasChanges}
                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-custom hover:bg-custom-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-custom disabled:opacity-50"
                  >
                    {loading ? 'Salvando...' : 'Salvar Preços'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Card de Teste de Pagamento */}
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">Teste de Pagamento</h3>
            <div className="mt-2 max-w-xl text-sm text-gray-500">
              <p>Use esta seção para simular um pagamento com as credenciais de teste do Mercado Pago.</p>
            </div>
            <div className="mt-5">
              <TestPaymentButton />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Configuracoes;