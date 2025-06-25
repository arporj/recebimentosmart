import React, { useState } from 'react';
import { Mail, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

const FeedbackForm = () => {
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
      // Dados do usuário atual
      const userEmail = user?.email || 'Não informado';
      const userName = user?.user_metadata?.name || userEmail;
      
      // Preparar dados para envio
      const feedbackData = {
        from: userEmail,
        name: userName,
        type: type,
        subject: subject,
        comment: comment
      };
      
      // Enviar para a Netlify Function
      const response = await fetch('/.netlify/functions/send-feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(feedbackData),
      });
      
      const result = await response.json();
      
      if (response.ok && result.success) {
        toast.success('Seu feedback foi enviado com sucesso!');
        
        // Limpar o formulário
        setSubject('');
        setComment('');
      } else {
        throw new Error(result.message || 'Erro desconhecido');
      }
      
    } catch (error) {
      console.error('Erro ao enviar feedback:', error);
      toast.error('Não foi possível enviar seu feedback. Tente novamente mais tarde.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-md">
      <div className="flex items-center mb-6">
        <Mail className="h-6 w-6 text-indigo-600 mr-2" />
        <h1 className="text-2xl font-bold text-gray-800">Críticas e Sugestões</h1>
      </div>
      
      <p className="text-gray-600 mb-6">
        Sua opinião é muito importante para nós! Utilize este formulário para enviar críticas ou sugestões sobre o RecebimentoSmart.
      </p>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tipo
          </label>
          <div className="relative">
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-2 border border-gray-300 rounded-md bg-white text-left focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Digite o assunto"
            required
          />
        </div>
        
        <div>
          <label htmlFor="comment" className="block text-sm font-medium text-gray-700 mb-1">
            Comentário
          </label>
          <textarea
            id="comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={5}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Descreva sua crítica ou sugestão em detalhes"
            required
          />
        </div>
        
        <div>
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
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
      
      {user && (
        <div className="mt-6 p-4 bg-gray-50 rounded-md">
          <p className="text-sm text-gray-600">
            <strong>Enviando como:</strong> {user.email}
          </p>
        </div>
      )}
    </div>
  );
};

export default FeedbackForm;
