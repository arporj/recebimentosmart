import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { Tag, AlertCircle, AlertTriangle } from 'lucide-react';
import { formatCurrency, handleCurrencyInputChange, parseCurrency } from '../../lib/utils';

const PriceManagement = () => {
  const [price, setPrice] = useState<number | null>(null);
  const [newPrice, setNewPrice] = useState('');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

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

  const handleUpdatePrice = () => {
    const newPriceNumber = parseCurrency(newPrice);

    if (newPriceNumber === price) {
      toast.info('O novo preço é igual ao preço atual.');
      return;
    }

    setShowConfirmModal(true);
  };

  const executeUpdatePrice = async () => {
    const newPriceNumber = parseCurrency(newPrice);
    setUpdating(true);
    setShowConfirmModal(false);
    try {
      const { data, error } = await supabase.rpc('update_price_and_notify', { new_price: newPriceNumber });

      if (error) throw error;

      setPrice(newPriceNumber);
      toast.success(data || 'Preço atualizado com sucesso!');
    } catch (error) {
      console.error('Erro ao atualizar preço:', error);
      const message = error instanceof Error ? error.message : 'Falha ao atualizar o preço.';
      toast.error(message);
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
      {/* Modal de Confirmação Premium */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-100 max-w-md w-full p-6 space-y-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4">
              <div className="bg-amber-50 border border-amber-100 p-3 rounded-2xl text-amber-500 shrink-0">
                <AlertTriangle size={24} className="animate-bounce" />
              </div>
              <div className="space-y-1.5 text-left">
                <h3 className="text-lg font-black text-slate-800">Confirmar Alteração de Preço</h3>
                <p className="text-xs text-slate-500 leading-normal font-semibold">
                  Você tem certeza que deseja alterar o preço para <span className="font-extrabold text-indigo-600">{formatCurrency(parseCurrency(newPrice))}</span>?
                </p>
                <p className="text-xs text-slate-400 font-medium">
                  Todos os usuários ativos serão notificados automaticamente por e-mail e a mudança será aplicada na próxima renovação de cada usuário.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={updating}
                className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={executeUpdatePrice}
                disabled={updating}
                className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 hover:shadow-indigo-700/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                Confirmar e Notificar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PriceManagement;
