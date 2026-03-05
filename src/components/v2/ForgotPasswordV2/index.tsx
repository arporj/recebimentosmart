import { useState } from 'react';
import { Mail, ArrowRight, ArrowLeft, CheckCircle } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { toast, Toaster } from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';

export default function ForgotPasswordV2() {
    const { resetPassword } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);

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
        } catch {
            // AuthContext já exibe toast de erro
        } finally {
            setLoading(false);
        }
    };

    // ─── Tela de sucesso ───
    if (submitted) {
        return (
            <div className="relative flex min-h-screen w-full flex-col bg-gray-50 overflow-x-hidden">
                {/* Branding Banner */}
                <div className="px-4 py-3">
                    <div className="w-full bg-custom bg-gradient-to-br from-custom to-teal-700 flex flex-col justify-center items-center overflow-hidden rounded-xl min-h-[200px] shadow-lg shadow-custom/20 relative">
                        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
                        <div className="z-10 flex flex-col items-center">
                            <img src="/images/logo.png" alt="Recebimento $mart" className="h-14 mb-2" />
                            <h3 className="text-white text-2xl font-extrabold tracking-tight">Recebimento $mart</h3>
                            <p className="text-white/80 text-sm font-medium">Recuperação de senha</p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col px-6 pt-8 pb-4 max-w-md mx-auto w-full items-center text-center">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
                        <CheckCircle className="text-green-600" size={32} />
                    </div>
                    <h1 className="text-slate-900 tracking-tight text-3xl font-extrabold leading-tight pb-2">
                        Email enviado!
                    </h1>
                    <p className="text-slate-500 text-base font-normal leading-normal pb-2">
                        Enviamos um link de recuperação para <strong className="text-slate-700">{email}</strong>.
                    </p>
                    <p className="text-slate-400 text-sm pb-8">
                        Se não receber em alguns minutos, verifique sua pasta de spam.
                    </p>

                    <div className="flex flex-col gap-3 w-full">
                        <button
                            onClick={() => setSubmitted(false)}
                            className="w-full border-2 border-slate-200 text-slate-700 font-bold py-4 rounded-xl hover:bg-slate-50 transition-all"
                        >
                            Usar outro email
                        </button>
                        <button
                            onClick={() => navigate('/v2/login')}
                            className="w-full bg-custom hover:bg-custom-hover text-white font-bold py-4 rounded-xl shadow-lg shadow-custom/30 transition-all flex items-center justify-center gap-2"
                        >
                            Voltar para o Login <ArrowRight size={18} />
                        </button>
                    </div>
                </div>

                <Toaster position="top-right" />
            </div>
        );
    }

    // ─── Formulário principal ───
    return (
        <div className="relative flex min-h-screen w-full flex-col bg-gray-50 overflow-x-hidden">
            {/* Branding Banner */}
            <div className="px-4 py-3">
                <div className="w-full bg-custom bg-gradient-to-br from-custom to-teal-700 flex flex-col justify-center items-center overflow-hidden rounded-xl min-h-[200px] shadow-lg shadow-custom/20 relative">
                    <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
                    <div className="z-10 flex flex-col items-center">
                        <img src="/images/logo.png" alt="Recebimento $mart" className="h-14 mb-2" />
                        <h3 className="text-white text-2xl font-extrabold tracking-tight">Recebimento $mart</h3>
                        <p className="text-white/80 text-sm font-medium">Recuperação de senha</p>
                    </div>
                </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex flex-col px-6 pt-8 pb-4 max-w-md mx-auto w-full">
                <h1 className="text-slate-900 tracking-tight text-3xl font-extrabold leading-tight text-left pb-2">
                    Esqueceu sua senha?
                </h1>
                <p className="text-slate-500 text-base font-normal leading-normal pb-6">
                    Não se preocupe! Digite seu email e enviaremos um link para recuperar sua conta.
                </p>

                <div className="flex flex-col gap-5">
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
                </div>

                {/* Botão */}
                <div className="pt-8 flex flex-col gap-4">
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-custom hover:bg-custom-hover text-white font-bold py-4 rounded-xl shadow-lg shadow-custom/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {loading ? 'Enviando...' : 'Enviar link de recuperação'}
                        {!loading && <ArrowRight size={18} />}
                    </button>
                </div>

                {/* Footer */}
                <div className="mt-auto py-8 text-center">
                    <Link
                        className="text-custom font-bold hover:underline inline-flex items-center gap-1"
                        to="/v2/login"
                    >
                        <ArrowLeft size={16} /> Voltar para o login
                    </Link>
                </div>
            </form>

            <Toaster position="top-right" />
        </div>
    );
}
