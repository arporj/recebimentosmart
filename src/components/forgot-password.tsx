import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const navigate = useNavigate();
  const { resetPassword } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !email.includes('@')) {
      toast.error('Por favor, forneça um email válido');
      return;
    }

    setLoading(true);

    try {
      await resetPassword(email);
      setSubmitted(true);
    } catch (error) {
      // O AuthContext já exibe um toast de erro
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center bg-gray-50">
        <div className="bg-white p-8 rounded shadow-md w-full max-w-md text-center">
          <h2 className="text-2xl font-bold mb-6">Email Enviado</h2>
          <p className="mb-6">
            Enviamos um email de recuperação para <strong>{email}</strong>. 
            Por favor, verifique sua caixa de entrada e siga as instruções.
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Se não receber o email em alguns minutos, verifique também sua pasta de spam.
          </p>
          <div className="space-y-4">
            <button
              onClick={() => setSubmitted(false)}
              className="w-full py-2 px-4 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
            >
              Usar outro email
            </button>
            <button
              onClick={() => navigate('/login')}
              className="w-full py-2 px-4 bg-custom text-white rounded hover:bg-custom-hover"
            >
              Voltar para o Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-gray-50">
      <div className="bg-white p-8 rounded shadow-md w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6 text-center">Recuperação de Senha</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Seu email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-custom focus:ring-custom sm:text-sm"
              placeholder="Digite seu email cadastrado"
            />
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-custom text-white rounded hover:bg-custom-hover disabled:opacity-50"
          >
            {loading ? 'Enviando...' : 'Enviar link de recuperação'}
          </button>
        </form>
        
        <div className="mt-4 text-center">
          <Link to="/login" className="text-sm text-custom hover:text-custom-hover">
            Voltar para o login
          </Link>
        </div>
      </div>
    </div>
  );
}