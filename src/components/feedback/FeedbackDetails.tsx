import React, { useState, useEffect, useRef } from 'react';
import { Send, ArrowLeft, User, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatToSP } from '../../lib/dates';
import type { Feedback, FeedbackMessage } from '../../types/feedback';
import toast from 'react-hot-toast';

interface FeedbackDetailsProps {
  feedback: Feedback;
  onBack: () => void;
  isAdminView?: boolean;
}

export function FeedbackDetails({ feedback: initialFeedback, onBack, isAdminView = false }: FeedbackDetailsProps) {
  const { user } = useAuth();
  const [feedback, setFeedback] = useState<Feedback>(initialFeedback);
  const [messages, setMessages] = useState<FeedbackMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFeedback(initialFeedback);
  }, [initialFeedback]);

  useEffect(() => {
    fetchMessages();
    markAsRead();

    // Subscribe to new messages and feedback updates
    const subscription = supabase
      .channel(`feedback_details:${feedback.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'feedback_messages',
        filter: `feedback_id=eq.${feedback.id}`
      }, (payload) => {
        const newMsg = payload.new as FeedbackMessage;
        setMessages(prev => [...prev, newMsg]);
        scrollToBottom();

        if (newMsg.sender_id !== user?.id && newMsg.sender_id !== null) {
          markAsRead();
        } else if (newMsg.sender_id === null) {
          markAsRead();
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'feedbacks',
        filter: `id=eq.${feedback.id}`
      }, (payload) => {
        const updatedFeedback = payload.new as Feedback;
        setFeedback(prev => ({ ...prev, ...updatedFeedback }));
        toast.success(`Status atualizado externamente para ${updatedFeedback.status === 'open' ? 'Aberto' :
          updatedFeedback.status === 'in_progress' ? 'Em Análise' :
            updatedFeedback.status === 'resolved' ? 'Resolvido' : 'Fechado'
          }`);
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [feedback.id]);

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('feedback_messages')
        .select('*')
        .eq('feedback_id', feedback.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
      scrollToBottom();
    } catch (error) {
      console.error('Erro ao carregar mensagens:', error);
      toast.error('Erro ao carregar mensagens');
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async () => {
    if (!user) return;

    try {
      // If user is admin, we mark 'has_unread_admin' as false
      // If user is regular, we mark 'has_unread_user' as false
      const updateData = isAdminView
        ? { has_unread_admin: false }
        : { has_unread_user: false };

      await supabase
        .from('feedbacks')
        .update(updateData)
        .eq('id', feedback.id);

    } catch (error) {
      console.error('Erro ao marcar como lido:', error);
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;

    setSending(true);
    try {
      const { error } = await supabase
        .from('feedback_messages')
        .insert({
          feedback_id: feedback.id,
          sender_id: user.id,
          message: newMessage.trim()
        });

      if (error) throw error;
      setNewMessage('');

      // Enviar notificação por email
      supabase.functions.invoke('send_feedback_email', {
        body: {
          feedback_id: feedback.id
        }
      }).catch(err => console.error('Falha ao enviar notificação de feedback:', err));
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      toast.error('Erro ao enviar mensagem');
    } finally {
      setSending(false);
    }
  };

  const handleUpdateStatus = async (newStatus: string) => {
    if (!isAdminView || updatingStatus) return;

    setUpdatingStatus(true);
    try {
      const { error } = await supabase
        .from('feedbacks')
        .update({
          status: newStatus,
          last_activity_at: new Date().toISOString()
        })
        .eq('id', feedback.id);

      if (error) throw error;

      // Update local feedback object if needed or refresh
      toast.success(`Status atualizado para ${newStatus}`);

      // We also add a system message to the chat
      await supabase
        .from('feedback_messages')
        .insert({
          feedback_id: feedback.id,

          message: `O status do feedback foi alterado para: ${newStatus === 'open' ? 'Aberto' :
            newStatus === 'in_progress' ? 'Em Análise' :
              newStatus === 'resolved' ? 'Resolvido' : 'Fechado'
            }`,
          sender_id: null // System message
        });

      // Instead of manual refresh, the realtime subscription will handle it if we refresh the parent
      // But since we are in the details view, we can just let the parent refresh when we go back
      // or we can reload the page data if we want.
      // For now, let's just trigger a reload of messages which is already happening via realtime
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      toast.error('Erro ao atualizar status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleReopen = async () => {
    if (updatingStatus) return;

    setUpdatingStatus(true);
    try {
      const { error } = await supabase
        .from('feedbacks')
        .update({
          status: 'open',
          last_activity_at: new Date().toISOString()
        })
        .eq('id', feedback.id);

      if (error) throw error;

      toast.success('Feedback reaberto com sucesso');

      // Add system message
      await supabase
        .from('feedback_messages')
        .insert({
          feedback_id: feedback.id,
          sender_id: null,
          message: `Feedback reaberto pelo usuário.`
        });

    } catch (error) {
      console.error('Erro ao reabrir feedback:', error);
      toast.error('Erro ao reabrir feedback');
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] min-h-[500px] bg-white rounded-lg shadow overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 p-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center">
          <button
            onClick={onBack}
            className="mr-3 p-1 rounded-full hover:bg-gray-200 text-gray-500"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
              {feedback.subject}
              <span className={`text-xs px-2 py-0.5 rounded-full ${feedback.type === 'Crítica' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                }`}>
                {feedback.type}
              </span>
            </h2>
            <p className="text-xs text-gray-500">
              ID: {feedback.id.slice(0, 8)} • Criado em {formatToSP(feedback.created_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {isAdminView && (
            <select
              value={feedback.status}
              onChange={(e) => handleUpdateStatus(e.target.value)}
              disabled={updatingStatus}
              className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-custom disabled:opacity-50"
            >
              <option value="open">Aberto</option>
              <option value="in_progress">Em Análise</option>
              <option value="resolved">Resolvido</option>
              <option value="closed">Fechado</option>
            </select>
          )}
          <div className={`px-2 py-1 rounded text-xs font-medium uppercase ${feedback.status === 'open' ? 'bg-green-100 text-green-800' :
            feedback.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
              feedback.status === 'resolved' ? 'bg-blue-100 text-blue-800' :
                'bg-gray-100 text-gray-800'
            }`}>
            {feedback.status === 'open' ? 'Aberto' :
              feedback.status === 'in_progress' ? 'Em Análise' :
                feedback.status === 'resolved' ? 'Resolvido' : 'Fechado'}
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {loading ? (
          <div className="flex justify-center p-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-custom"></div>
          </div>
        ) : messages.length === 0 ? (
          <p className="text-center text-gray-500 my-8">Nenhuma mensagem ainda.</p>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_id === user?.id;
            const isSystem = msg.sender_id === null;

            if (isSystem) {
              return (
                <div key={msg.id} className="flex justify-center my-4">
                  <div className="bg-gray-200 text-gray-600 text-xs px-3 py-1 rounded-full font-medium">
                    {msg.message}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] rounded-lg p-3 shadow-sm ${isMe
                    ? 'bg-custom text-white rounded-tr-none'
                    : 'bg-white text-gray-800 rounded-tl-none border border-gray-200'
                    }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {!isMe && (
                      isAdminView ? <User className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3 text-custom" />
                    )}
                    <span className={`text-xs font-medium ${isMe ? 'text-blue-100' : 'text-gray-500'}`}>
                      {isMe ? 'Você' : (isAdminView ? 'Usuário' : 'Suporte')}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
                  <p className={`text-[10px] mt-1 text-right ${isMe ? 'text-blue-100' : 'text-gray-400'}`}>
                    {formatToSP(msg.created_at, 'dd/MM HH:mm')}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>



      {/* Input Area */}
      <div className="p-4 bg-white border-t border-gray-200">
        {(feedback.status === 'closed' || feedback.status === 'resolved') && !isAdminView ? (
          <div className="flex justify-center">
            <button
              onClick={handleReopen}
              disabled={updatingStatus}
              className="px-4 py-2 bg-white border border-custom text-custom rounded-md hover:bg-gray-50 font-medium transition-colors shadow-sm"
            >
              Reabrir Chamado para Responder
            </button>
          </div>
        ) : (
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Digite sua mensagem..."
              className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-custom"
              disabled={sending}
            />
            <button
              type="submit"
              disabled={sending || !newMessage.trim()}
              className="bg-custom text-white p-2 rounded-lg hover:bg-custom-hover disabled:opacity-50 transition-colors"
            >
              <Send className="h-5 w-5" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
