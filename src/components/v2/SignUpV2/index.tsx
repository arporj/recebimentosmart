import { useState, useEffect } from 'react';
import { Eye, EyeOff, Lock, Mail, User, FileText, ArrowRight } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { toast, Toaster } from 'react-hot-toast';
import { Link, useLocation, useNavigate } from 'react-router-dom';

export default function SignUpV2() {
    const location = useLocation();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [referralCode, setReferralCode] = useState<string | null>(null);
    const [referrerName, setReferrerName] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        cpf_cnpj: '',
        password: '',
        confirmPassword: '',
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    useEffect(() => {
        const urlParams = new URLSearchParams(location.search);
        const refCode = urlParams.get('ref');
        if (refCode) {
            setReferralCode(refCode);
            const fetchReferrerName = async () => {
                try {
                    const { data, error } = await supabase
                        .from('profiles')
                        .select('name')
                        .eq('referral_code', refCode)
                        .single();
                    if (error) throw error;
                    if (data) setReferrerName(data.name);
                } catch (error) {
                    console.error('Erro ao buscar nome do indicador:', error);
                }
            };
            fetchReferrerName();
        }
    }, [location]);

    const validate = () => {
        const newErrors: Record<string, string> = {};
        if (!formData.name) newErrors.name = 'Nome é obrigatório.';

        const cpfCnpj = formData.cpf_cnpj.replace(/[^0-9]/g, '');
        if (!cpfCnpj) {
            newErrors.cpf_cnpj = 'CPF/CNPJ é obrigatório.';
        } else if (cpfCnpj.length !== 11 && cpfCnpj.length !== 14) {
            newErrors.cpf_cnpj = 'CPF/CNPJ inválido. Deve conter 11 ou 14 dígitos.';
        }

        if (!formData.email) {
            newErrors.email = 'Email é obrigatório.';
        } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
            newErrors.email = 'Endereço de email inválido.';
        }
        if (formData.password.length < 6) {
            newErrors.password = 'A senha deve ter pelo menos 6 caracteres.';
        }
        if (formData.password !== formData.confirmPassword) {
            newErrors.confirmPassword = 'As senhas não coincidem.';
        }
        return newErrors;
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, value } = e.target;
        setFormData((prev) => ({ ...prev, [id]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const newErrors = validate();
        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }
        setErrors({});
        setLoading(true);

        try {
            const cpfCnpj = formData.cpf_cnpj.replace(/[^0-9]/g, '');
            const { error } = await supabase.auth.signUp({
                email: formData.email,
                password: formData.password,
                options: {
                    data: { name: formData.name, cpf_cnpj: cpfCnpj, referral_code: referralCode || undefined }
                }
            });
            if (error) throw error;

            // Email de notificação (silencioso)
            try {
                const { error: emailError } = await supabase.functions.invoke('send-notification-email', {
                    body: {
                        subject: `Novo Cadastro: ${formData.name}`,
                        htmlContent: `
              <p>Um novo usuário se cadastrou no Recebimento $mart:</p>
              <ul>
                <li><b>Nome:</b> ${formData.name}</li>
                <li><b>Email:</b> ${formData.email}</li>
                ${referralCode ? `<li><b>Código de Indicação:</b> ${referralCode}</li>` : ''}
                ${referrerName ? `<li><b>Indicado por:</b> ${referrerName}</li>` : ''}
              </ul>
              <p>Data do Cadastro: ${new Date().toLocaleString('pt-BR')}</p>
              <p>Atenciosamente,<br>Equipe Recebimento $mart</p>
            `,
                        recipientEmail: 'financeiro@recebimentosmart.com.br',
                    },
                });
                if (emailError) console.error('Erro ao enviar e-mail de notificação:', emailError);
            } catch (emailError) {
                console.error('Erro crítico ao tentar enviar e-mail:', emailError);
            }

            toast.success('Conta criada com sucesso! Verifique seu e-mail para confirmação.');
            navigate('/v2/login');
        } catch (error) {
            console.error('Erro no processo de signUp:', error);
        } finally {
            setLoading(false);
        }
    };

    const inputClass = (field: string) =>
        `flex w-full rounded-lg text-slate-900 border ${errors[field] ? 'border-red-400' : 'border-slate-300'
        } bg-white focus:ring-2 focus:ring-custom focus:border-custom h-14 placeholder:text-slate-400 p-[15px] pl-12 text-base font-normal transition-all`;

    const inputClassWithPr = (field: string) =>
        `flex w-full rounded-lg text-slate-900 border ${errors[field] ? 'border-red-400' : 'border-slate-300'
        } bg-white focus:ring-2 focus:ring-custom focus:border-custom h-14 placeholder:text-slate-400 p-[15px] pl-12 pr-12 text-base font-normal transition-all`;

    return (
        <div className="relative flex min-h-screen w-full flex-col bg-gray-50 overflow-x-hidden">

            {/* ─── Branding Banner ─── */}
            <div className="px-4 py-3">
                <div className="w-full bg-custom bg-gradient-to-br from-custom to-teal-700 flex flex-col justify-center items-center overflow-hidden rounded-xl min-h-[200px] shadow-lg shadow-custom/20 relative">
                    <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
                    <div className="z-10 flex flex-col items-center">
                        <img src="/images/logo.png" alt="Recebimento $mart" className="h-14 mb-2" />
                        <h3 className="text-white text-2xl font-extrabold tracking-tight">Recebimento $mart</h3>
                        <p className="text-white/80 text-sm font-medium">Comece a organizar seus recebimentos hoje</p>
                    </div>
                </div>
            </div>

            {/* ─── Form ─── */}
            <form onSubmit={handleSubmit} className="flex flex-col px-6 pt-8 pb-4 max-w-md mx-auto w-full">
                <h1 className="text-slate-900 tracking-tight text-3xl font-extrabold leading-tight text-left pb-2">
                    Criar conta gratuita
                </h1>
                <p className="text-slate-500 text-base font-normal leading-normal pb-6">
                    7 dias grátis para testar todas as funcionalidades.
                </p>

                {/* ─── Banner de Indicação ─── */}
                {referralCode && (
                    <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">🎉</span>
                            <div>
                                <p className="text-sm font-semibold text-green-800">Você foi indicado por um amigo!</p>
                                <p className="text-sm text-green-700 mt-0.5">
                                    Código: <span className="font-mono font-bold">{referralCode}</span>
                                </p>
                                {referrerName && (
                                    <p className="text-sm text-green-700">
                                        Indicado por: <b>{referrerName}</b>
                                    </p>
                                )}
                                <p className="text-xs text-green-600 mt-1">
                                    Ao se cadastrar, você e seu amigo ganham benefícios especiais!
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex flex-col gap-5">
                    {/* Nome */}
                    <label className="flex flex-col w-full">
                        <p className="text-slate-900 text-sm font-semibold leading-normal pb-2">Nome Completo</p>
                        <div className="relative">
                            <input
                                id="name"
                                className={inputClass('name')}
                                placeholder="Seu nome completo"
                                type="text"
                                required
                                value={formData.name}
                                onChange={handleChange}
                            />
                            <User className="absolute left-4 top-4 text-slate-400" size={20} />
                        </div>
                        {errors.name && <p className="mt-1 text-sm text-red-500">{errors.name}</p>}
                    </label>

                    {/* CPF/CNPJ */}
                    <label className="flex flex-col w-full">
                        <p className="text-slate-900 text-sm font-semibold leading-normal pb-2">CPF ou CNPJ</p>
                        <div className="relative">
                            <input
                                id="cpf_cnpj"
                                className={inputClass('cpf_cnpj')}
                                placeholder="000.000.000-00"
                                type="text"
                                required
                                value={formData.cpf_cnpj}
                                onChange={handleChange}
                            />
                            <FileText className="absolute left-4 top-4 text-slate-400" size={20} />
                        </div>
                        {errors.cpf_cnpj && <p className="mt-1 text-sm text-red-500">{errors.cpf_cnpj}</p>}
                    </label>

                    {/* Email */}
                    <label className="flex flex-col w-full">
                        <p className="text-slate-900 text-sm font-semibold leading-normal pb-2">E-mail</p>
                        <div className="relative">
                            <input
                                id="email"
                                className={inputClass('email')}
                                placeholder="seu@email.com"
                                type="email"
                                required
                                value={formData.email}
                                onChange={handleChange}
                            />
                            <Mail className="absolute left-4 top-4 text-slate-400" size={20} />
                        </div>
                        {errors.email && <p className="mt-1 text-sm text-red-500">{errors.email}</p>}
                    </label>

                    {/* Senha */}
                    <label className="flex flex-col w-full">
                        <p className="text-slate-900 text-sm font-semibold leading-normal pb-2">Senha</p>
                        <div className="relative">
                            <input
                                id="password"
                                className={inputClassWithPr('password')}
                                placeholder="Crie uma senha (mín. 6 caracteres)"
                                type={showPassword ? 'text' : 'password'}
                                required
                                value={formData.password}
                                onChange={handleChange}
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

                    {/* Confirmar Senha */}
                    <label className="flex flex-col w-full">
                        <p className="text-slate-900 text-sm font-semibold leading-normal pb-2">Confirmar Senha</p>
                        <div className="relative">
                            <input
                                id="confirmPassword"
                                className={inputClassWithPr('confirmPassword')}
                                placeholder="Confirme sua senha"
                                type={showConfirmPassword ? 'text' : 'password'}
                                required
                                value={formData.confirmPassword}
                                onChange={handleChange}
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
                        {loading ? 'Criando conta...' : 'Criar conta gratuita (7 dias)'}
                        {!loading && <ArrowRight size={18} />}
                    </button>
                </div>

                {/* Footer */}
                <div className="mt-auto py-8 text-center">
                    <p className="text-slate-600 text-sm font-medium">
                        Já tem conta?{' '}
                        <Link className="text-custom font-bold hover:underline" to="/v2/login">
                            Faça login
                        </Link>
                    </p>
                </div>
            </form>

            <Toaster position="top-right" />
        </div>
    );
}
