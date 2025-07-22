import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
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
        const response = await axios.get(`/api/mp/referral-stats/${user.id}`);
        if (response.data.success) {
          setStats(response.data);
        } else {
          throw new Error('Falha ao buscar estatísticas de indicação');
        }
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
        // Se o compartilhamento falhar, copia o link
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
  const creditsProgress = Math.min((stats.availableCredits / maxCredits) * 100, 100);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
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
                  <>
                    <CheckCircle className="h-5 w-5 mr-2" />
                    Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="h-5 w-5 mr-2" />
                    Copiar
                  </>
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
          
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start">
              <Info className="h-5 w-5 text-blue-500 mt-0.5 mr-3 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">Como funciona:</p>
                <ul className="space-y-1 text-blue-700">
                  <li>• Compartilhe seu link com amigos e conhecidos</li>
                  <li>• Quando alguém se cadastrar usando seu link, você ganha 1 ponto</li>
                  <li>• Quando essa pessoa realizar o primeiro pagamento, você ganha {discountPercentage}% de desconto</li>
                  <li>• Você pode acumular até {maxCredits} descontos para usar nas próximas faturas</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Registrados */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-blue-100 p-3 rounded-lg">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <TrendingUp className="h-5 w-5 text-gray-400" />
          </div>
          <div>
            <p className="text-3xl font-bold text-gray-900 mb-1">{stats.totalRegistered}</p>
            <p className="text-sm text-gray-600">Usuários cadastrados</p>
            <p className="text-xs text-blue-600 mt-2">Total de pessoas que usaram seu link</p>
          </div>
        </div>

        {/* Total Pagos */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-green-100 p-3 rounded-lg">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <DollarSign className="h-5 w-5 text-gray-400" />
          </div>
          <div>
            <p className="text-3xl font-bold text-gray-900 mb-1">{stats.totalPaid}</p>
            <p className="text-sm text-gray-600">Pagamentos confirmados</p>
            <p className="text-xs text-green-600 mt-2">Indicações que geraram desconto</p>
          </div>
        </div>

        {/* Créditos Disponíveis */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-purple-100 p-3 rounded-lg">
              <Gift className="h-6 w-6 text-purple-600" />
            </div>
            <Star className="h-5 w-5 text-gray-400" />
          </div>
          <div>
            <p className="text-3xl font-bold text-gray-900 mb-1">{stats.availableCredits}</p>
            <p className="text-sm text-gray-600">Créditos disponíveis</p>
            <p className="text-xs text-purple-600 mt-2">Descontos para usar nas próximas faturas</p>
          </div>
        </div>

        {/* Próximos Descontos */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-orange-100 p-3 rounded-lg">
              <Clock className="h-6 w-6 text-orange-600" />
            </div>
            <TrendingUp className="h-5 w-5 text-gray-400" />
          </div>
          <div>
            <p className="text-3xl font-bold text-gray-900 mb-1">{stats.totalRegistered - stats.totalPaid}</p>
            <p className="text-sm text-gray-600">Aguardando pagamento</p>
            <p className="text-xs text-orange-600 mt-2">Usuários que ainda não pagaram</p>
          </div>
        </div>
      </div>

      {/* Progresso dos Créditos */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-gray-900">Progresso dos Créditos</h3>
          <span className="text-sm text-gray-500">{stats.availableCredits} de {maxCredits} créditos</span>
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
          {Array.from({ length: maxCredits }, (_, index) => (
            <div 
              key={index}
              className={`h-8 rounded-lg flex items-center justify-center text-sm font-medium transition-colors ${
                index < stats.availableCredits 
                  ? 'bg-custom text-white' 
                  : 'bg-gray-100 text-gray-400'
              }`}
            >
              {index + 1}
            </div>
          ))}
        </div>
        
        <p className="text-sm text-gray-600 mt-4">
          Cada crédito representa {discountPercentage}% de desconto na sua próxima fatura. 
          Você pode acumular até {maxCredits} créditos.
        </p>
      </div>

      {/* Call to Action */}
      <div className="bg-gradient-to-r from-custom to-custom-hover rounded-xl shadow-lg p-8 text-center text-white">
        <h3 className="text-2xl font-bold mb-4">Pronto para começar a economizar?</h3>
        <p className="text-lg mb-6 opacity-90">
          Compartilhe seu link de indicação e comece a acumular descontos hoje mesmo!
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a 
            href="/payment" 
            className="inline-flex items-center px-6 py-3 bg-white text-custom rounded-lg font-medium hover:bg-gray-100 transition-colors"
          >
            <ExternalLink className="h-5 w-5 mr-2" />
            Ver minha fatura atual
          </a>
          <button 
            onClick={shareLink}
            className="inline-flex items-center px-6 py-3 bg-custom-hover text-white rounded-lg font-medium hover:bg-opacity-90 transition-colors"
          >
            <Share2 className="h-5 w-5 mr-2" />
            Compartilhar link agora
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReferralPage;

