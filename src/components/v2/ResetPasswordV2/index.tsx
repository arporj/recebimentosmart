import { useState, useEffect } from 'react';
import { Eye, EyeOff, Lock, ArrowRight, ShieldCheck } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { toast, Toaster } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

export default function ResetPasswordV2() {
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        const hash = window.location.hash;
        const params = new URLSearchParams(hash.substring(1));
        const token = params.get('access_token');

        if (token) {
            setAccessToken(token);
            supabase.auth.setSession({ access_token: token, refresh_token: '' });
        } else {
            toast.error('Link de recuperação inválido ou expirado');
            setTimeout(() => navigate('/v2/login'), 2000);
        }
        setInitialLoading(false);
    }, [navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const newErrors: Record<string, string> = {};

        if (password.length < 6) {
            newErrors.password = 'A senha deve ter pelo menos 6 caracteres.';
        }
        if (password !== confirmPassword) {
            newErrors.confirmPassword = 'As senhas não coincidem.';
        }
        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }
        setErrors({});
        setLoading(true);

        try {
            if (!accessToken) throw new Error('Token de recuperação não encontrado');

            const { error: updateError } = await supabase.auth.updateUser({ password });
            if (updateError) throw updateError;

            toast.success('Senha redefinida com sucesso!');
            await supabase.auth.signOut();
            setTimeout(() => navigate('/v2/login'), 2000);
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

    // ─── Loading state ───
    if (initialLoading) {
        return (
            <div className="relative flex min-h-screen w-full flex-col bg-gray-50 overflow-x-hidden items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-custom" />
                <p className="mt-4 text-slate-500 text-sm">Verificando link de recuperação...</p>
                <Toaster position="top-right" />
            </div>
        );
    }

    if (!accessToken) return null;

    // ─── Formulário ───
    return (
        <div className="relative flex min-h-screen w-full flex-col bg-gray-50 overflow-x-hidden">
            {/* Branding Banner */}
            <div className="px-4 py-3">
                <div className="w-full bg-custom bg-gradient-to-br from-custom to-teal-700 flex flex-col justify-center items-center overflow-hidden rounded-xl min-h-[200px] shadow-lg shadow-custom/20 relative">
                    <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
                    <div className="z-10 flex flex-col items-center">
                        <ShieldCheck className="text-white mb-2" size={48} />
                        <h3 className="text-white text-2xl font-extrabold tracking-tight">Redefinir Senha</h3>
                        <p className="text-white/80 text-sm font-medium">Crie uma nova senha segura</p>
                    </div>
                </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex flex-col px-6 pt-8 pb-4 max-w-md mx-auto w-full">
                <h1 className="text-slate-900 tracking-tight text-3xl font-extrabold leading-tight text-left pb-2">
                    Defina sua nova senha
                </h1>
                <p className="text-slate-500 text-base font-normal leading-normal pb-6">
                    Escolha uma senha segura com pelo menos 6 caracteres.
                </p>

                <div className="flex flex-col gap-5">
                    {/* Nova Senha */}
                    <label className="flex flex-col w-full">
                        <p className="text-slate-900 text-sm font-semibold leading-normal pb-2">Nova Senha</p>
                        <div className="relative">
                            <input
                                className={`flex w-full rounded-lg text-slate-900 border ${errors.password ? 'border-red-400' : 'border-slate-300'
                                    } bg-white focus:ring-2 focus:ring-custom focus:border-custom h-14 placeholder:text-slate-400 p-[15px] pl-12 pr-12 text-base font-normal transition-all`}
                                placeholder="Crie uma nova senha"
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
                        {errors.password && <p className="mt-1 text-sm text-red-500">{errors.password}</p>}
                    </label>

                    {/* Confirmar Nova Senha */}
                    <label className="flex flex-col w-full">
                        <p className="text-slate-900 text-sm font-semibold leading-normal pb-2">Confirmar Nova Senha</p>
                        <div className="relative">
                            <input
                                className={`flex w-full rounded-lg text-slate-900 border ${errors.confirmPassword ? 'border-red-400' : 'border-slate-300'
                                    } bg-white focus:ring-2 focus:ring-custom focus:border-custom h-14 placeholder:text-slate-400 p-[15px] pl-12 pr-12 text-base font-normal transition-all`}
                                placeholder="Confirme sua nova senha"
                                type={showConfirmPassword ? 'text' : 'password'}
                                required
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                            />
                            <Lock className="absolute left-4 top-4 text-slate-400" size={20} />
                            <button
                                type="button"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                            </button>
                        </div>
                        {errors.confirmPassword && <p className="mt-1 text-sm text-red-500">{errors.confirmPassword}</p>}
                    </label>
                </div>

                {/* Botão */}
                <div className="pt-8 flex flex-col gap-4">
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-custom hover:bg-custom-hover text-white font-bold py-4 rounded-xl shadow-lg shadow-custom/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {loading ? 'Processando...' : 'Redefinir senha'}
                        {!loading && <ArrowRight size={18} />}
                    </button>
                </div>

                {/* Footer */}
                <div className="mt-auto py-8 text-center">
                    <p className="text-slate-400 text-xs">
                        Após redefinir, você será redirecionado para o login.
                    </p>
                </div>
            </form>

            <Toaster position="top-right" />
        </div>
    );
}
