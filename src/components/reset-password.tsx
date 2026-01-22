import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { Eye, EyeOff } from 'lucide-react';

export function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.substring(1)); // remove the #
    const accessToken = params.get('access_token');

    if (accessToken) {
      setAccessToken(accessToken);
      supabase.auth.setSession({ access_token: accessToken, refresh_token: '' });
    } else {
      toast.error('Link de recuperação inválido ou expirado');
      setTimeout(() => navigate('/login'), 2000);
    }
    setInitialLoading(false);
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast.error('As senhas não coincidem');
      return;
    }
    
    if (password.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres');
      return;
    }
    
    setLoading(true);

    try {
      if (accessToken) {
        const { error: updateError } = await supabase.auth.updateUser({
          password: password
        });
        
        if (updateError) {
          throw updateError;
        }
        
        toast.success('Senha redefinida com sucesso!');
        await supabase.auth.signOut();
        setTimeout(() => navigate('/login'), 2000);
      } else {
        throw new Error('Token de recuperação não encontrado');
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('should be different')) {
        toast.error('A nova senha deve ser diferente da atual.');
      } else {
        toast.error('Erro ao redefinir senha.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center bg-gray-50">
        <div className="bg-white p-8 rounded shadow-md w-full max-w-md text-center">
          <h2 className="text-2xl font-bold mb-6">Verificando link de recuperação...</h2>
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-custom mx-auto"></div>
        </div>
      </div>
    );
  }

  if (!accessToken) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-gray-50">
      <div className="bg-white p-8 rounded shadow-md w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6 text-center">Defina uma nova senha</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Nova senha
            </label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="block w-full pr-10 rounded-md border-gray-300 shadow-sm focus:border-custom focus:ring-custom sm:text-sm"
                placeholder="Digite sua nova senha"
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-gray-400 hover:text-gray-500 focus:outline-none"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-500">Mínimo de 6 caracteres.</p>
          </div>
          
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
              Confirme a nova senha
            </label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="block w-full pr-10 rounded-md border-gray-300 shadow-sm focus:border-custom focus:ring-custom sm:text-sm"
                placeholder="Confirme sua nova senha"
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="text-gray-400 hover:text-gray-500 focus:outline-none"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-custom text-white rounded hover:bg-custom-hover disabled:opacity-50"
          >
            {loading ? 'Processando...' : 'Redefinir senha'}
          </button>
        </form>
      </div>
    </div>
  );
}