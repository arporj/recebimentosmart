// src/pages/Configuracoes.tsx
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/CurrencyInput'; // Importe o novo componente
import { supabase } from '@/lib/supabase'; // Seu cliente Supabase
import { useToast } from '@/hooks/use-toast';

// Função para formatar para exibição
const formatDisplayCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(value / 100); // Divide por 100 porque o valor vem em centavos
};


import TestPaymentButton from '@/components/TestPaymentButton'; // Importe o botão de teste

// Função para formatar para exibição
const formatDisplayCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(value / 100); // Divide por 100 porque o valor vem em centavos
};


const Configuracoes = () => {
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [newPrice, setNewPrice] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const fetchConfig = async () => {
      setLoading(true);
      // Supondo que você tenha uma tabela 'app_config' para isso
      const { data, error } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'subscription_price_cents')
        .single();

      if (error) {
        console.error('Erro ao buscar configuração de preço:', error);
        toast({ title: 'Erro', description: 'Não foi possível carregar o preço atual.' });
      } else if (data) {
        const priceInCents = parseInt(data.value, 10);
        setCurrentPrice(priceInCents);
        setNewPrice(priceInCents); // Inicia o campo com o valor atual
      }
      setLoading(false);
    };

    fetchConfig();
  }, [toast]);

  const handleUpdatePrice = async () => {
    setLoading(true);
    const { error } = await supabase
      .from('app_config')
      .update({ value: newPrice })
      .eq('key', 'subscription_price_cents');

    if (error) {
      toast({ title: 'Erro', description: 'Falha ao atualizar o preço.' });
    } else {
      setCurrentPrice(newPrice);
      toast({ title: 'Sucesso!', description: 'O preço da assinatura foi atualizado.' });
    }
    setLoading(false);
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Configurações do Sistema</h1>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Preço da Assinatura</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <p>Carregando...</p>
            ) : (
              <>
                <p>
                  O valor atual da assinatura é de:{' '}
                  <strong className="text-lg">{formatDisplayCurrency(currentPrice)}</strong>
                </p>
                <div className="space-y-2">
                  <label htmlFor="new-price">Novo valor da assinatura (em centavos)</label>
                  <CurrencyInput
                    id="new-price"
                    value={newPrice}
                    onValueChange={(value) => setNewPrice(value)}
                    disabled={loading}
                  />
                </div>
                <Button onClick={handleUpdatePrice} disabled={loading || newPrice === currentPrice}>
                  {loading ? 'Salvando...' : 'Salvar Novo Preço'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Teste de Pagamento</CardTitle>
          </CardHeader>
          <CardContent>
            <TestPaymentButton />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};


export default Configuracoes;
