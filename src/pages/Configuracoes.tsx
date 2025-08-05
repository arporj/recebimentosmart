// src/pages/Configuracoes.tsx
import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { CurrencyInput } from '../components/ui/CurrencyInput';
import { supabase } from '../lib/supabase';
import TestPaymentButton from '../components/TestPaymentButton';

// Função para formatar para exibição
const formatDisplayCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(value / 100);
};

const Configuracoes = () => {
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [newPrice, setNewPrice] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchConfig = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'subscription_price_cents')
        .single();

      if (error) {
        console.error('Erro ao buscar configuração de preço:', error);
        toast.error('Não foi possível carregar o preço atual.');
      } else if (data) {
        const priceInCents = parseInt(data.value, 10);
        setCurrentPrice(priceInCents);
        setNewPrice(priceInCents);
      }
      setLoading(false);
    };

    fetchConfig();
  }, []);

  const handleUpdatePrice = async () => {
    setLoading(true);
    const { error } = await supabase
      .from('app_config')
      .update({ value: newPrice })
      .eq('key', 'subscription_price_cents');

    if (error) {
      toast.error('Falha ao atualizar o preço.');
    } else {
      setCurrentPrice(newPrice);
      toast.success('O preço da assinatura foi atualizado.');
    }
    setLoading(false);
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Configurações do Sistema</h1>
      <div className="space-y-4">
        {/* Card de Preço da Assinatura */}
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">Preço da Assinatura</h3>
            <div className="mt-2 max-w-xl text-sm text-gray-500">
              <p>Defina o valor mensal da assinatura para novos clientes.</p>
            </div>
            <div className="mt-5 space-y-4">
              {loading ? (
                <p>Carregando...</p>
              ) : (
                <>
                  <p>
                    O valor atual da assinatura é de:{' '}
                    <strong className="text-lg text-gray-800">{formatDisplayCurrency(currentPrice)}</strong>
                  </p>
                  <div className="space-y-2">
                    <label htmlFor="new-price" className="block text-sm font-medium text-gray-700">Novo valor da assinatura (em centavos)</label>
                    <CurrencyInput
                      id="new-price"
                      value={newPrice}
                      onValueChange={(value) => setNewPrice(value)}
                      disabled={loading}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-custom focus:ring-custom sm:text-sm"
                    />
                  </div>
                  <button 
                    onClick={handleUpdatePrice} 
                    disabled={loading || newPrice === currentPrice}
                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-custom hover:bg-custom-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-custom disabled:opacity-50"
                  >
                    {loading ? 'Salvando...' : 'Salvar Novo Preço'}
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