// src/pages/Configuracoes.tsx
import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { CurrencyInput } from '../components/ui/CurrencyInput';
import { supabase } from '../lib/supabase';
import TestPaymentButton from '../components/TestPaymentButton';
import { formatCurrency, handleCurrencyInputChange, parseCurrency } from '../lib/utils';

const Configuracoes = () => {
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [newPrice, setNewPrice] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchConfig = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('app_settings') // Corrigido para app_settings
        .select('value')
        .eq('key', 'subscription_price') // Corrigido para subscription_price
        .single();

      if (error) {
        console.error('Erro ao buscar configuração de preço:', error);
        toast.error('Não foi possível carregar o preço atual.');
      } else if (data && typeof data.value === 'string') {
        const priceValue = parseFloat(data.value);
        setCurrentPrice(priceValue);
        setNewPrice(priceValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })); // Formata para exibição no input
      }
      setLoading(false);
    };

    fetchConfig();
  }, []);

  const handleUpdatePrice = async () => {
    const newPriceNumber = parseCurrency(newPrice); // Converte a string formatada para número

    if (newPriceNumber === currentPrice) {
      toast.info('O novo preço é igual ao preço atual.');
      return;
    }

    setLoading(true);
    const { error } = await supabase
      .from('app_settings') // Corrigido para app_settings
      .update({ value: newPriceNumber.toString() }) // Salva como string no DB
      .eq('key', 'subscription_price'); // Corrigido para subscription_price

    if (error) {
      toast.error('Falha ao atualizar o preço.');
    } else {
      setCurrentPrice(newPriceNumber);
      toast.success('O preço da assinatura foi atualizado.');
    }
    setLoading(false);
  };

  const onNewPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formattedValue = handleCurrencyInputChange(e);
    setNewPrice(formattedValue);
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
                    <strong className="text-lg text-gray-800">{formatCurrency(currentPrice)}</strong>
                  </p>
                  <div className="space-y-2">
                    <label htmlFor="new-price" className="block text-sm font-medium text-gray-700">Novo valor da assinatura</label>
                    <CurrencyInput
                      id="new-price"
                      value={newPrice}
                      onValueChange={onNewPriceChange}
                      disabled={loading}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-custom focus:ring-custom sm:text-sm"
                    />
                  </div>
                  <button 
                    onClick={handleUpdatePrice} 
                    disabled={loading || newPrice === currentPrice?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
