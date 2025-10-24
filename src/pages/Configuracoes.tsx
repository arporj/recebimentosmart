import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { CurrencyInput } from '../components/ui/CurrencyInput';
import { supabase } from '../lib/supabase';
import TestPaymentButton from '../components/TestPaymentButton';
import { CustomFieldsManager } from '../components/CustomFieldsManager';
import { useAuth } from '../contexts/AuthContext'; // Import useAuth
import { FileText } from 'lucide-react'; // Import FileText icon

interface PlanPrices {
  basico: number;
  pro: number;
  premium: number;
}

// Função para normalizar nomes de planos (remove acentos e torna minúsculo)
const normalizePlanName = (name: string) => 
  name.toLowerCase().normalize("NFD").replace(/[^\w\s]/gi, '');

const Configuracoes = () => {
  const { user, fetchReferralInfo } = useAuth(); // Use useAuth to get user info
  const [prices, setPrices] = useState<PlanPrices>({ basico: 0, pro: 0, premium: 0 });
  const [initialPrices, setInitialPrices] = useState<PlanPrices>({ basico: 0, pro: 0, premium: 0 });
  const [loading, setLoading] = useState(true);
  const [cpfCnpj, setCpfCnpj] = useState<string>('');
  const [initialCpfCnpj, setInitialCpfCnpj] = useState<string>('');
  const [cpfCnpjError, setCpfCnpjError] = useState<string | null>(null);

  // Fetch prices and user CPF/CNPJ on mount
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch prices
        const { data: pricesData, error: pricesError } = await supabase.rpc('get_all_plans_with_prices');
        if (pricesError) throw pricesError;

        if (pricesData) {
          const fetchedPrices: Partial<PlanPrices> = {};
          pricesData.forEach(plan => {
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

        // Fetch user CPF/CNPJ
        if (user) {
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('cpf_cnpj')
            .eq('id', user.id)
            .single();

          if (profileError) throw profileError;

          if (profileData && profileData.cpf_cnpj) {
            setCpfCnpj(profileData.cpf_cnpj);
            setInitialCpfCnpj(profileData.cpf_cnpj);
          }
        }

      } catch (error: any) {
        toast.error(error.message || 'Não foi possível carregar os dados.');
        console.error('Erro ao buscar dados:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

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

  const handleCpfCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCpfCnpj(value);
    // Clear error on change
    if (cpfCnpjError) setCpfCnpjError(null);
  };

  const handleUpdateCpfCnpj = async () => {
    if (!user) {
      toast.error('Usuário não autenticado.');
      return;
    }

    const cleanedCpfCnpj = cpfCnpj.replace(/[^0-9]/g, '');

    if (!cleanedCpfCnpj) {
      setCpfCnpjError('CPF/CNPJ é obrigatório.');
      return;
    }
    if (cleanedCpfCnpj.length !== 11 && cleanedCpfCnpj.length !== 14) {
      setCpfCnpjError('CPF/CNPJ inválido. Deve conter 11 ou 14 dígitos.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ cpf_cnpj: cleanedCpfCnpj })
        .eq('id', user.id);

      if (error) throw error;

      setInitialCpfCnpj(cleanedCpfCnpj);
      toast.success('CPF/CNPJ atualizado com sucesso!');
      // Optionally, refresh auth context to update hasFullAccess if needed
      fetchReferralInfo(); // This will re-fetch profile data in AuthContext
    } catch (error: any) {
      toast.error(error.message || 'Falha ao atualizar CPF/CNPJ.');
      console.error('Erro ao atualizar CPF/CNPJ:', error);
    } finally {
      setLoading(false);
    }
  };

  const hasPriceChanges = JSON.stringify(prices) !== JSON.stringify(initialPrices);
  const hasCpfCnpjChanges = cpfCnpj !== initialCpfCnpj && !cpfCnpjError;

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Configurações do Sistema</h1>
      <div className="space-y-4">
        {/* Card de Dados do Usuário */}
        <div className="bg-white shadow sm:rounded-lg border border-secondary-100">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-neutral-900">Seus Dados</h3>
            <div className="mt-2 max-w-xl text-sm text-neutral-500">
              <p>Mantenha seu CPF ou CNPJ atualizado para utilizar todas as funcionalidades.</p>
            </div>
            <div className="mt-5 space-y-6">
              <div>
                <label htmlFor="cpf_cnpj" className="block text-sm font-medium text-neutral-700">CPF ou CNPJ</label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <FileText className="h-5 w-5 text-gray-400" />
                  </div>
                  <input 
                    id="cpf_cnpj" 
                    type="text" 
                    value={cpfCnpj}
                    onChange={handleCpfCnpjChange}
                    placeholder="Seu CPF ou CNPJ"
                    className={`pl-10 block w-full rounded-md ${cpfCnpjError ? 'border-red-500' : 'border-gray-300'} shadow-sm focus:border-custom focus:ring-custom sm:text-sm`}
                    disabled={loading}
                  />
                </div>
                {cpfCnpjError && <p className="mt-2 text-sm text-red-600">{cpfCnpjError}</p>}
              </div>
              <button 
                onClick={handleUpdateCpfCnpj} 
                disabled={loading || !hasCpfCnpjChanges}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-accent-600 hover:bg-accent-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-600 disabled:opacity-50"
              >
                {loading ? 'Salvando...' : 'Salvar CPF/CNPJ'}
              </button>
            </div>
          </div>
        </div>

        {/* Card de Preços dos Planos */}
        <div className="bg-white shadow sm:rounded-lg border border-secondary-100">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-neutral-900">Preços dos Planos</h3>
            <div className="mt-2 max-w-xl text-sm text-neutral-500">
              <p>Defina o valor mensal para cada um dos planos de assinatura.</p>
            </div>
            <div className="mt-5 space-y-6">
              {loading ? (
                <p>Carregando preços...</p>
              ) : (
                <>
                  <div className="space-y-2">
                    <label htmlFor="price-basico" className="block text-sm font-medium text-neutral-700">Plano Básico (R$)</label>
                    <CurrencyInput
                      id="price-basico"
                      value={prices.basico}
                      onValueChange={(value) => handlePriceChange('basico', value)}
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="price-pro" className="block text-sm font-medium text-neutral-700">Plano Pró (R$)</label>
                    <CurrencyInput
                      id="price-pro"
                      value={prices.pro}
                      onValueChange={(value) => handlePriceChange('pro', value)}
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="price-premium" className="block text-sm font-medium text-neutral-700">Plano Premium (R$)</label>
                    <CurrencyInput
                      id="price-premium"
                      value={prices.premium}
                      onValueChange={(value) => handlePriceChange('premium', value)}
                      disabled={loading}
                    />
                  </div>
                  <button 
                    onClick={handleUpdatePrices} 
                    disabled={loading || !hasPriceChanges}
                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-accent-600 hover:bg-accent-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-600 disabled:opacity-50"
                  >
                    {loading ? 'Salvando...' : 'Salvar Preços'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Card de Teste de Pagamento */}
        <div className="bg-white shadow sm:rounded-lg border border-secondary-100">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-neutral-900">Teste de Pagamento</h3>
            <div className="mt-2 max-w-xl text-sm text-neutral-500">
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