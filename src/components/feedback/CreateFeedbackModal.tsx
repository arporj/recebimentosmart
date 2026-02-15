import React, { useState } from 'react';
import { X, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';

interface CreateFeedbackModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateFeedbackModal({ onClose, onSuccess }: CreateFeedbackModalProps) {
  const { user } = useAuth();
  const [type, setType] = useState<'Crítica' | 'Sugestão'>('Sugestão');
  const [subject, setSubject] = useState('');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!subject.trim()) {
      toast.error('Por favor, informe um assunto');
      return;
    }

    if (!comment.trim()) {
      toast.error('Por favor, escreva seu comentário');
      return;
    }

    setLoading(true);

    try {
      if (!user) throw new Error('Usuário não autenticado');

      // 1. Criar o feedback
      const { data: feedback, error: feedbackError } = await supabase
        .from('feedbacks')
        .insert({
          user_id: user.id,
          type: type,
          subject: subject,
          status: 'open',
          has_unread_admin: true,
          has_unread_user: false
        })
        .select()
        .single();

      if (feedbackError) throw feedbackError;

      // 2. Criar a primeira mensagem
      const { error: messageError } = await supabase
        .from('feedback_messages')
        .insert({
          feedback_id: feedback.id,
          sender_id: user.id,
          message: comment
        });

      if (messageError) throw messageError;

      // 3. Enviar notificação por email (Edge Function)
      // Não bloqueamos o fluxo se falhar o envio de email
      supabase.functions.invoke('send_feedback_email', {
        body: {
          feedback_id: feedback.id,
          origin: window.location.origin
        }
      }).catch(err => console.error('Falha ao enviar notificação de feedback:', err));

      toast.success('Seu feedback foi enviado com sucesso!');
      onSuccess();
      onClose();

    } catch (error: any) {
      console.error('Erro ao enviar feedback:', error);
      toast.error('Erro ao enviar feedback: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-500"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-xl font-bold text-gray-900 mb-4">Novo Feedback</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tipo
            </label>
            <div className="relative">
              <button
                type="button"
                className="w-full flex items-center justify-between px-4 py-2 border border-gray-300 rounded-md bg-white text-left focus:outline-none focus:ring-2 focus:ring-custom"
                onClick={() => setShowDropdown(!showDropdown)}
              >
                <span>{type}</span>
                {showDropdown ? (
                  <ChevronUp className="h-5 w-5 text-gray-400" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-gray-400" />
                )}
              </button>

              {showDropdown && (
                <div className="absolute z-10 mt-1 w-full bg-white shadow-lg rounded-md border border-gray-300">
                  <ul>
                    <li
                      className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                      onClick={() => {
                        setType('Sugestão');
                        setShowDropdown(false);
                      }}
                    >
                      Sugestão
                    </li>
                    <li
                      className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                      onClick={() => {
                        setType('Crítica');
                        setShowDropdown(false);
                      }}
                    >
                      Crítica
                    </li>
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">
              Assunto
            </label>
            <input
              id="subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-custom"
              placeholder="Resumo do assunto"
              required
            />
          </div>

          <div>
            <label htmlFor="comment" className="block text-sm font-medium text-gray-700 mb-1">
              Mensagem
            </label>
            <textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={5}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-custom"
              placeholder="Descreva sua crítica ou sugestão em detalhes"
              required
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-white bg-custom hover:bg-custom-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-custom disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                'Enviando...'
              ) : (
                <>
                  <CheckCircle className="h-5 w-5 mr-2" />
                  Enviar Feedback
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
