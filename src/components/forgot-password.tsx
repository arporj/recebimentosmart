import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useNavigate, Link } from 'react-router-dom';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const navigate = useNavigate();

  const sendPasswordResetEmail = async (email: string, resetLink: string) => {
    const apiKey = 'V0zjEm'; // Substitua pela sua chave da API

    const data = {
      sender: { email: 'no-reply@recebimentosmart.com.br', name: 'RecebimentoSmart' },
      to: [{ email }],
      subject: 'Recuperação de Senha - RecebimentoSmart',
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Recuperação de Senha</h2>
          <p>Clique no botão abaixo para redefinir sua senha:</p>
          <a href="${resetLink}" style="background-color: #4f46e5; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Redefinir Senha</a>
          <p>Este link expira em 24 horas.</p>
        </div>
      `
    };

    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error('Erro ao enviar email');
      }

      toast.success('Email de recuperação enviado com sucesso');
    } catch (error) {
      console.error('Erro ao enviar email:', error);
      toast.error('Erro ao enviar email de recuperação');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !email.includes('@')) {
      toast.error('Por favor, forneça um email válido');
      return;
    }

    setLoading(true);

    try {
      const resetLink = `${window.location.origin}/reset-password`;
      await sendPasswordResetEmail(email, resetLink);
      setSubmitted(true);
    } catch (error) {
      console.error('Erro ao enviar email de recuperação:', error);
      toast.error('Erro ao enviar email de recuperação');
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