import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { 
  Gift, 
  Users, 
  CheckCircle, 
  Copy, 
  ExternalLink, 
  Share2, 
  TrendingUp,
  DollarSign,
  Clock,
  Star,
  Info
} from 'lucide-react';

interface ReferralStats {
  referralLink: string;
  totalRegistered: number;
  totalPaid: number;
  availableCredits: number;
  wasReferred: boolean;
  referrerName: string | null;
}

const ReferralPage = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchReferralStats = async () => {
      if (!user) return;
      try {
        // Chamar a nova função RPC
        const { data, error } = await supabase.rpc('get_referral_stats', { p_user_id: user.id });
        if (error) throw error;

        // A função RPC retorna um array, então pegamos o primeiro elemento
        const referralData = data[0];

        // O link de indicação é gerado no frontend
        const referralLink = `${window.location.origin}/cadastro?ref=${user.id}`;

        // TODO: Os dados de totalRegistered e totalPaid precisariam de outras chamadas RPC
        // para serem implementados completamente. Por enquanto, usaremos valores mockados.
        const mockStats = {
          totalRegistered: 0,
          totalPaid: 0,
        };

        setStats({
          availableCredits: referralData.available_credits,
          wasReferred: referralData.was_referred,
          referrerName: referralData.referrer_name,
          referralLink,
          ...mockStats,
        });

      } catch (error) {
        console.error('Erro ao buscar estatísticas de indicação:', error);
        toast.error('Não foi possível carregar suas estatísticas de indicação.');
      } finally {
        setLoading(false);
      }
    };

    fetchReferralStats();
  }, [user]);

  const copyToClipboard = async () => {
    if (stats?.referralLink) {
      try {
        await navigator.clipboard.writeText(stats.referralLink);
        setCopied(true);
        toast.success('Link de indicação copiado!');
        setTimeout(() => setCopied(false), 2000);
      } catch (error) {
        toast.error('Falha ao copiar o link.');
      }
    }
  };

  const shareLink = async () => {
    if (stats?.referralLink && navigator.share) {
      try {
        await navigator.share({
          title: 'RecebimentoSmart - Sistema de Gestão de Recebimentos',
          text: 'Conheça o RecebimentoSmart! Um sistema completo para gerenciar seus recebimentos.',
          url: stats.referralLink,
        });
      } catch (error) {
        copyToClipboard();
      }
    } else {
      copyToClipboard();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-custom"></div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center justify-center mb-4">
            <Info className="h-8 w-8 text-red-500" />
          </div>
          <h3 className="text-lg font-medium text-red-800 mb-2">Erro ao carregar dados</h3>
          <p className="text-red-600">Não foi possível carregar suas estatísticas de indicação. Tente novamente mais tarde.</p>
        </div>
      </div>
    );
  }

  const discountPercentage = 20;
  const maxCredits = 5;
  // O crédito de boas-vindas é somado aos créditos ganhos
  const giftedCredit = stats.wasReferred ? 1 : 0;
  const totalCredits = stats.availableCredits + giftedCredit;
  const creditsProgress = Math.min((totalCredits / maxCredits) * 100, 100);

  return (
    <div className="max-w-6xl mx-auto space-y-8 p-4">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center mb-4">
          <div className="bg-gradient-to-r from-custom to-custom-hover p-3 rounded-full">
            <Gift className="h-8 w-8 text-white" />
          </div>
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Programa de Indicações</h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          Indique amigos e ganhe descontos! Para cada indicação que resultar em pagamento,
          você recebe <span className="font-semibold text-custom">{discountPercentage}% de desconto</span> na sua próxima fatura.
        </p>
      </div>

      {/* Link de Indicação */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-r from-custom to-custom-hover p-6">
          <h2 className="text-2xl font-bold text-white mb-2">Seu Link de Indicação</h2>
          <p className="text-custom-100">Compartilhe este link e comece a ganhar descontos</p>
        </div>
        <div className="p-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <input
                type="text"
                readOnly
                value={stats.referralLink}
                className="w-full p-4 border-2 border-gray-200 rounded-lg bg-gray-50 text-gray-700 font-mono text-sm focus:outline-none focus:border-custom transition-colors"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={copyToClipboard}
                className={`flex items-center px-6 py-4 rounded-lg font-medium transition-all duration-200 ${
                  copied
                    ? 'bg-green-500 text-white'
                    : 'bg-custom text-white hover:bg-custom-hover hover:shadow-lg'
                }`}
              >
                {copied ? (
                  <><CheckCircle className="h-5 w-5 mr-2" />Copiado!</>
                ) : (
                  <><Copy className="h-5 w-5 mr-2" />Copiar</>
                )}
              </button>
              <button
                onClick={shareLink}
                className="flex items-center px-6 py-4 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                <Share2 className="h-5 w-5 mr-2" />
                Compartilhar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Estatísticas */}
       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
          <p className="text-3xl font-bold text-gray-900 mb-1">{stats.totalRegistered}</p>
          <p className="text-sm text-gray-600">Usuários cadastrados</p>
        </div>
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
          <p className="text-3xl font-bold text-gray-900 mb-1">{stats.totalPaid}</p>
          <p className="text-sm text-gray-600">Pagamentos confirmados</p>
        </div>
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
          <p className="text-3xl font-bold text-gray-900 mb-1">{totalCredits}</p>
          <p className="text-sm text-gray-600">Créditos disponíveis</p>
        </div>
         <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
          <p className="text-3xl font-bold text-gray-900 mb-1">{stats.totalRegistered - stats.totalPaid}</p>
          <p className="text-sm text-gray-600">Aguardando pagamento</p>
        </div>
      </div>


      {/* Progresso dos Créditos */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-gray-900">Progresso dos Créditos</h3>
          <span className="text-sm text-gray-500">{totalCredits} de {maxCredits} créditos</span>
        </div>
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>Créditos acumulados</span>
            <span>{Math.round(creditsProgress)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-gradient-to-r from-custom to-custom-hover h-3 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${creditsProgress}%` }}
            ></div>
          </div>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: maxCredits }, (_, index) => {
            const creditNumber = index + 1;
            const isGifted = stats.wasReferred && index === 0;
            // Verifica se o bloco de crédito deve ser preenchido
            const isEarned = creditNumber <= totalCredits;

            const creditBlock = (
              <div
                key={index}
                className={`h-8 rounded-lg flex items-center justify-center text-sm font-medium transition-colors ${
                  isGifted
                    ? 'bg-yellow-400 text-white' // Dourado para o crédito de boas-vindas
                    : isEarned
                      ? 'bg-custom text-white' // Cor normal para créditos ganhos
                      : 'bg-gray-100 text-gray-400' // Cor para créditos não ganhos
                }`}
              >
                <Star className="h-4 w-4" />
              </div>
            );

            if (isGifted) {
              return (
                <div key={index} title={`Crédito de boas-vindas por ter sido indicado por ${stats.referrerName || 'um amigo'}.`}>
                  {creditBlock}
                </div>
              );
            }
            return creditBlock;
          })}
        </div>
        <p className="text-sm text-gray-600 mt-4">
          Cada crédito representa {discountPercentage}% de desconto na sua próxima fatura.
          Você pode acumular até {maxCredits} créditos.
        </p>
      </div>
    </div>
  );
};

export default ReferralPage;