import React, { useState, useEffect } from 'react';
import { Plus, MessageSquare, AlertCircle, CheckCircle, Search, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatToSP } from '../../lib/dates';
import type { Feedback } from '../../types/feedback';
import { CreateFeedbackModal } from './CreateFeedbackModal';
import { FeedbackDetails } from './FeedbackDetails';

export function FeedbackList() {
  const { user } = useAuth();
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (user) {
      fetchFeedbacks();

      // Subscribe to changes
      const subscription = supabase
        .channel('user_feedback_list')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'feedbacks',
          filter: `user_id=eq.${user.id}`
        }, () => {
          fetchFeedbacks();
        })
        .subscribe();

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [user]);

  const fetchFeedbacks = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('feedbacks')
        .select('*')
        .eq('user_id', user!.id)
        .order('last_activity_at', { ascending: false });

      if (error) throw error;
      setFeedbacks(data || []);
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
      <FeedbackDetails
        feedback={selectedFeedback}
        onBack={() => {
          setSelectedFeedback(null);
          fetchFeedbacks(); // Refresh list on return
        }}
      />
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Minhas Críticas e Sugestões</h1>
          <p className="text-gray-500 text-sm mt-1">Acompanhe o status dos seus feedbacks enviados.</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center px-4 py-2 bg-custom text-white rounded-md hover:bg-custom-hover transition-colors shadow-sm"
        >
          <Plus className="h-5 w-5 mr-2" />
          Novo Feedback
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-custom"></div>
        </div>
      ) : feedbacks.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm border border-gray-200">
          <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Nenhum feedback enviado</h3>
          <p className="text-gray-500 mt-2 mb-6">Você ainda não enviou nenhuma crítica ou sugestão.</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-custom bg-blue-50 hover:bg-blue-100"
          >
            Criar primeiro feedback
          </button>
        </div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
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
                        <p className={`text-sm font-medium truncate ${feedback.has_unread_user ? 'text-gray-900 font-bold' : 'text-gray-700'}`}>
                          {feedback.subject}
                        </p>
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${feedback.type === 'Crítica' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                          {feedback.type}
                        </span>
                        {feedback.has_unread_user && (
                          <span className="flex items-center text-xs font-bold text-custom animate-pulse">
                            <span className="w-2 h-2 bg-custom rounded-full mr-1"></span>
                            Nova resposta
                          </span>
                        )}
                      </div>
                      <div className="ml-2 flex-shrink-0 flex">
                        <p className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(feedback.status)}`}>
                          {getStatusLabel(feedback.status)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 sm:flex sm:justify-between">
                      <div className="sm:flex">
                        <p className="flex items-center text-sm text-gray-500">
                          <MessageSquare className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                          ID: {feedback.id.slice(0, 8)}
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

      {showCreateModal && (
        <CreateFeedbackModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={fetchFeedbacks}
        />
      )}
    </div>
  );
}
