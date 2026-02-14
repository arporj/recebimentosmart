import React, { useState, useEffect } from 'react';
import { MessageSquare, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatToSP } from '../lib/dates';
import type { Feedback } from '../types/feedback';
import { FeedbackDetails } from '../components/feedback/FeedbackDetails';

export default function AdminFeedbackPage() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread' | 'open' | 'in_progress' | 'closed'>('unread');

  useEffect(() => {
    fetchFeedbacks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  // Subscribe to changes
  useEffect(() => {
    const subscription = supabase
      .channel('admin_feedback_list')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'feedbacks'
      }, () => {
        fetchFeedbacks();
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'feedback_messages'
      }, () => {
        fetchFeedbacks();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchFeedbacks = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_admin_feedbacks');

      if (error) throw error;

      let filteredData = data || [];

      if (filter === 'unread') {
        filteredData = filteredData.filter((f: any) => f.has_unread_admin);
      } else if (filter === 'open') {
        filteredData = filteredData.filter((f: any) => f.status === 'open');
      } else if (filter === 'in_progress') {
        filteredData = filteredData.filter((f: any) => f.status === 'in_progress');
      } else if (filter === 'closed') {
        filteredData = filteredData.filter((f: any) => f.status === 'closed');
      }

      // Map user_data to user to match expected structure
      const mappedData = filteredData.map((f: any) => ({
        ...f,
        user: f.user_data // Map RPC user_data to user property expected by UI
      }));

      setFeedbacks(mappedData);
    } catch (error) {
      console.error('Erro ao buscar feedbacks:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-green-100 text-green-800';
      case 'in_progress': return 'bg-yellow-100 text-yellow-800';
      case 'resolved': return 'bg-blue-100 text-blue-800';
      case 'closed': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'open': return 'Aberto';
      case 'in_progress': return 'Em Análise';
      case 'resolved': return 'Resolvido';
      case 'closed': return 'Fechado';
      default: return status;
    }
  };

  if (selectedFeedback) {
    return (
      <div className="p-6">
        <FeedbackDetails
          feedback={selectedFeedback}
          onBack={() => {
            setSelectedFeedback(null);
            fetchFeedbacks();
          }}
          isAdminView={true}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestão de Feedbacks</h1>
          <p className="text-gray-500 text-sm mt-1">Gerencie críticas e sugestões dos usuários.</p>
        </div>

        <div className="flex bg-white rounded-lg shadow-sm p-1 border border-gray-200">
          <button
            onClick={() => setFilter('unread')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${filter === 'unread' ? 'bg-custom text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
              }`}
          >
            Não Lidos
          </button>
          <button
            onClick={() => setFilter('open')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${filter === 'open' ? 'bg-custom text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
              }`}
          >
            Abertos
          </button>
          <button
            onClick={() => setFilter('in_progress')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${filter === 'in_progress' ? 'bg-custom text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
              }`}
          >
            Em Análise
          </button>
          <button
            onClick={() => setFilter('closed')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${filter === 'closed' ? 'bg-custom text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
              }`}
          >
            Fechados
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${filter === 'all' ? 'bg-custom text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
              }`}
          >
            Todos
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-custom"></div>
        </div>
      ) : feedbacks.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm border border-gray-200">
          <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Nenhum feedback encontrado</h3>
          <p className="text-gray-500 mt-2">Nenhum item corresponde aos filtros selecionados.</p>
        </div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-md border border-gray-200">
          <ul className="divide-y divide-gray-200">
            {feedbacks.map((feedback) => (
              <li key={feedback.id}>
                <button
                  onClick={() => setSelectedFeedback(feedback)}
                  className="block w-full hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="px-4 py-4 sm:px-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {feedback.has_unread_admin && (
                          <span className="w-2.5 h-2.5 bg-custom rounded-full" title="Nova mensagem"></span>
                        )}
                        <p className={`text-sm font-medium truncate ${feedback.has_unread_admin ? 'text-gray-900 font-bold' : 'text-gray-700'}`}>
                          {feedback.subject}
                        </p>
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${feedback.type === 'Crítica' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                          {feedback.type}
                        </span>
                      </div>
                      <div className="ml-2 flex-shrink-0 flex">
                        <p className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(feedback.status)}`}>
                          {getStatusLabel(feedback.status)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 sm:flex sm:justify-between">
                      <div className="sm:flex flex-col">
                        <p className="flex items-center text-sm text-gray-500">
                          <span className="font-medium mr-1">Usuário:</span>
                          {/* @ts-ignore - Supabase join returns user object */}
                          {feedback.user?.user_metadata?.name || feedback.user?.email || 'Desconhecido'}
                        </p>
                        <p className="flex items-center text-xs text-gray-400 mt-0.5">
                          {/* @ts-ignore */}
                          {feedback.user?.email}
                        </p>
                      </div>
                      <div className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0">
                        <Clock className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                        <p>
                          Atualizado em {formatToSP(feedback.last_activity_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
