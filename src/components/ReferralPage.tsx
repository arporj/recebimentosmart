import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Gift, Users, CheckCircle, Copy, ExternalLink } from 'lucide-react';

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

  const copyToClipboard = () => {
    if (stats?.referralLink) {
      navigator.clipboard.writeText(stats.referralLink)
        .then(() => toast.success('Link de indicação copiado!'))
        .catch(() => toast.error('Falha ao copiar o link.'));
    }
  };

  if (loading) {
    return <div className="text-center p-8">Carregando...</div>;
  }

  if (!stats) {
    return <div className="text-center p-8 text-red-500">Não foi possível carregar os dados.</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-md">
      <div className="flex items-center mb-6">
        <Gift className="h-8 w-8 text-indigo-600 mr-3" />
        <h1 className="text-3xl font-bold text-gray-800">Indique e Ganhe</h1>
      </div>

      <div className="mb-8 p-6 border border-indigo-100 rounded-lg bg-indigo-50">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Seu Link de Indicação</h2>
        <div className="flex items-center gap-4">
          <input 
            type="text" 
            readOnly 
            value={stats.referralLink} 
            className="flex-grow p-3 border border-gray-300 rounded-md bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button 
            onClick={copyToClipboard} 
            className="flex items-center px-4 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
          >
            <Copy className="h-5 w-5 mr-2" />
            Copiar
          </button>
        </div>
        <p className="text-sm text-gray-600 mt-3">Compartilhe este link com seus amigos. Para cada amigo que se cadastrar e pagar a primeira mensalidade, você ganha 20% de desconto na sua próxima fatura!</p>
      </div>

      <div>
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Suas Estatísticas</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-6 bg-gray-50 rounded-lg border border-gray-200 flex items-center">
            <Users className="h-8 w-8 text-blue-500 mr-4" />
            <div>
              <p className="text-3xl font-bold text-gray-900">{stats.totalRegistered}</p>
              <p className="text-sm text-gray-600">Usuários cadastrados</p>
            </div>
          </div>
          <div className="p-6 bg-gray-50 rounded-lg border border-gray-200 flex items-center">
            <CheckCircle className="h-8 w-8 text-green-500 mr-4" />
            <div>
              <p className="text-3xl font-bold text-gray-900">{stats.totalPaid}</p>
              <p className="text-sm text-gray-600">Pagamentos confirmados</p>
            </div>
          </div>
          <div className="p-6 bg-gray-50 rounded-lg border border-gray-200 flex items-center">
            <Gift className="h-8 w-8 text-purple-500 mr-4" />
            <div>
              <p className="text-3xl font-bold text-gray-900">{stats.availableCredits}</p>
              <p className="text-sm text-gray-600">Créditos para desconto</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 border-t pt-6 text-center">
        <a href="/pagamento" className="inline-flex items-center text-indigo-600 hover:text-indigo-800">
          Ver minha fatura e usar meus créditos
          <ExternalLink className="h-4 w-4 ml-2" />
        </a>
      </div>
    </div>
  );
};

export default ReferralPage;
