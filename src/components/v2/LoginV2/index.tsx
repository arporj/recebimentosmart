import { useState } from 'react';
import { Eye, EyeOff, Lock, Mail, ArrowRight } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { toast, Toaster } from 'react-hot-toast';
import { Link } from 'react-router-dom';

export default function LoginV2() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await signIn(email, password, '/v2/clientes');
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error('Erro ao fazer login');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col bg-gray-50 overflow-x-hidden">

      {/* ─── Branding Banner ─── */}
      <div className="px-4 py-3">
        <div className="w-full bg-custom bg-gradient-to-br from-custom to-teal-700 flex flex-col justify-center items-center overflow-hidden rounded-xl min-h-[240px] shadow-lg shadow-custom/20 relative">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
          <div className="z-10 flex flex-col items-center">
            <img src="/images/logo.png" alt="Recebimento $mart" className="h-16 mb-2" />
            <h3 className="text-white text-2xl font-extrabold tracking-tight">Recebimento $mart</h3>
            <p className="text-white/80 text-sm font-medium">Simplifique seus recebimentos</p>
          </div>
        </div>
      </div>

      {/* ─── Form ─── */}
      <form onSubmit={handleSubmit} className="flex flex-col px-6 pt-8 pb-4 max-w-md mx-auto w-full">
        <h1 className="text-slate-900 tracking-tight text-3xl font-extrabold leading-tight text-left pb-2">
          Bem-vindo de volta
        </h1>
        <p className="text-slate-500 text-base font-normal leading-normal pb-6">
          Entre na sua conta para gerenciar seu fluxo financeiro.
        </p>

        <div className="flex flex-col gap-5">
          {/* Email */}
          <label className="flex flex-col w-full">
            <p className="text-slate-900 text-sm font-semibold leading-normal pb-2">E-mail</p>
            <div className="relative">
              <input
                className="flex w-full rounded-lg text-slate-900 border border-slate-300 bg-white focus:ring-2 focus:ring-custom focus:border-custom h-14 placeholder:text-slate-400 p-[15px] pl-12 text-base font-normal transition-all"
                placeholder="seu@email.com"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Mail className="absolute left-4 top-4 text-slate-400" size={20} />
            </div>
          </label>

          {/* Senha */}
          <label className="flex flex-col w-full">
            <div className="flex justify-between items-center pb-2">
              <p className="text-slate-900 text-sm font-semibold leading-normal">Senha</p>
              <Link className="text-custom text-sm font-semibold hover:underline" to="/v2/forgot-password">
                Esqueceu a senha?
              </Link>
            </div>
            <div className="relative">
              <input
                className="flex w-full rounded-lg text-slate-900 border border-slate-300 bg-white focus:ring-2 focus:ring-custom focus:border-custom h-14 placeholder:text-slate-400 p-[15px] pl-12 pr-12 text-base font-normal transition-all"
                placeholder="••••••••"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Lock className="absolute left-4 top-4 text-slate-400" size={20} />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </label>

          {/* Lembrar-me */}
          <div className="flex items-center gap-2">
            <input
              className="w-5 h-5 rounded border-slate-300 text-custom focus:ring-custom cursor-pointer"
              id="remember"
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <label className="text-slate-700 text-sm font-medium cursor-pointer" htmlFor="remember">
              Lembrar-me
            </label>
          </div>
        </div>

        {/* Botões */}
        <div className="pt-8 flex flex-col gap-4">
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-custom hover:bg-custom-hover text-white font-bold py-4 rounded-xl shadow-lg shadow-custom/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? 'Entrando...' : 'Entrar'}
            {!loading && <ArrowRight size={18} />}
          </button>
        </div>

        {/* Footer */}
        <div className="mt-auto py-8 text-center">
          <p className="text-slate-600 text-sm font-medium">
            Não tem conta?{' '}
            <Link className="text-custom font-bold hover:underline" to="/v2/cadastro">
              Registre-se
            </Link>
          </p>
        </div>
      </form>

      <Toaster position="top-right" />
    </div>
  );
}
