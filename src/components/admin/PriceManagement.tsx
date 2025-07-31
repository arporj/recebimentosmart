import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { Tag, AlertCircle } from 'lucide-react';
import { formatCurrency, handleCurrencyInputChange, parseCurrency } from '../../lib/utils';

const PriceManagement = () => {
  const [price, setPrice] = useState<number | null>(null);
  const [newPrice, setNewPrice] = useState('');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const fetchPrice = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'subscription_price')
          .single();

        if (error) throw error;

        if (data && typeof data.value === 'string') {
          const priceValue = parseFloat(data.value);
          setPrice(priceValue);
          setNewPrice(priceValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
        }
      } catch (error) {
        console.error('Erro ao buscar preço:', error);
        toast.error('Falha ao carregar o preço atual.');
      } finally {
        setLoading(false);
      }
    };

    fetchPrice();
  }, []);

  const handleUpdatePrice = async () => {
    const newPriceNumber = parseCurrency(newPrice);

    if (newPriceNumber === price) {
      toast.info('O novo preço é igual ao preço atual.');
      return;
    }

    const isConfirmed = window.confirm(
      `Você tem certeza que deseja alterar o preço para ${formatCurrency(newPriceNumber)}? Todos os usuários ativos serão notificados por e-mail.`
    );

    if (!isConfirmed) return;

    setUpdating(true);
    try {
      const { data, error } = await supabase.rpc('update_price_and_notify', { new_price: newPriceNumber });

      if (error) throw error;

      setPrice(newPriceNumber);
      toast.success(data || 'Preço atualizado com sucesso!');
    } catch (error: any) {
      console.error('Erro ao atualizar preço:', error);
      toast.error(error.message || 'Falha ao atualizar o preço.');
    } finally {
      setUpdating(false);
    }
  };

  const onPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formattedValue = handleCurrencyInputChange(e);
    setNewPrice(formattedValue);
  };

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="current-price" className="block text-sm font-medium text-gray-700">
          Preço Atual da Assinatura (BRL)
        </label>
        <div className="mt-1 flex items-center">
          <Tag className="h-5 w-5 text-gray-400 mr-2" />
          <span id="current-price" className="text-lg font-semibold text-gray-900">
            {loading ? 'Carregando...' : formatCurrency(price)}
          </span>
        </div>
      </div>

      <div>
        <label htmlFor="new-price" className="block text-sm font-medium text-gray-700">
          Alterar Preço
        </label>
        <div className="mt-1">
          <input 
            type="text" // Alterado para text para suportar a máscara
            id="new-price"
            value={newPrice}
            onChange={onPriceChange}
            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            placeholder="Ex: 39,90"
            disabled={loading || updating}
          />
        </div>
      </div>

      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <AlertCircle className="h-5 w-5 text-yellow-400" />
          </div>
          <div className="ml-3">
            <p className="text-sm text-yellow-700">
              Alterar o preço notificará todos os usuários ativos por e-mail. A mudança será aplicada na próxima renovação de cada usuário.
            </p>
          </div>
        </div>
      </div>

      <button
        onClick={handleUpdatePrice}
        disabled={loading || updating || parseCurrency(newPrice) === price}
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {updating ? 'Atualizando e Notificando...' : 'Salvar Novo Preço e Notificar Usuários'}
      </button>
    </div>
  );
};

export default PriceManagement;
