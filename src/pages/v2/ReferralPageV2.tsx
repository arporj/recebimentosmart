import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import toast, { Toaster } from 'react-hot-toast';
import {
    Users,
    CheckCircle,
    Copy,
    TrendingUp,
    Clock,
    Star,
    Info,
    Wallet,
    Link as LinkIcon,
    MessageCircle,
    Mail
} from 'lucide-react';

interface ReferralStats {
    referralLink: string;
    totalRegistered: number;
    totalPaid: number;
    availableCredits: number;
    wasReferred: boolean;
    referrerName: string | null;
}

export default function ReferralPageV2() {
    const { user } = useAuth();
    const [stats, setStats] = useState<ReferralStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        const fetchReferralStats = async () => {
            if (!user) return;
            try {
                const { data, error } = await supabase.rpc('get_full_referral_stats', { p_user_id: user.id });

                if (error) throw error;

                const statsData = data[0];

                setStats({
                    referralLink: `${window.location.origin}/v2/cadastro?ref=${statsData.referral_code}`,
                    totalRegistered: statsData.total_registered,
                    totalPaid: statsData.total_paid,
                    availableCredits: statsData.available_credits,
                    wasReferred: statsData.was_referred,
                    referrerName: statsData.referrer_name,
                });

            } catch (error) {
                console.error('Erro ao buscar estatísticas de indicação:', error);
                toast.error('Não foi possível carregar suas estatísticas de indicação.');
            } finally {
                setLoading(false);
            }
        };

        fetchReferralStats();
    }, [user]);

    const copyToClipboard = async () => {
        if (stats?.referralLink) {
            try {
                await navigator.clipboard.writeText(stats.referralLink);
                setCopied(true);
                toast.success('Link de indicação copiado!');
                setTimeout(() => setCopied(false), 2000);
            } catch {
                toast.error('Falha ao copiar o link.');
            }
        }
    };

    const shareLink = async (platform?: 'whatsapp' | 'email') => {
        if (!stats?.referralLink) return;

        const text = 'Conheça o Recebimento $mart! O melhor sistema para gerenciar seus recebimentos.';
        const url = stats.referralLink;

        if (platform === 'whatsapp') {
            window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text + ' ' + url)}`, '_blank');
            return;
        }

        if (platform === 'email') {
            window.location.href = `mailto:?subject=Convite Recebimento Smart&body=${encodeURIComponent(text + '\n\n' + url)}`;
            return;
        }

        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Recebimento $mart - Sistema de Gestão',
                    text,
                    url,
                });
            } catch {
                copyToClipboard();
            }
        } else {
            copyToClipboard();
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-custom"></div>
            </div>
        );
    }

    if (!stats) {
        return (
            <div className="text-center p-8 mt-10">
                <div className="bg-red-50 border border-red-200 rounded-2xl p-8 max-w-lg mx-auto">
                    <div className="flex items-center justify-center mb-4">
                        <Info className="h-10 w-10 text-red-500" />
                    </div>
                    <h3 className="text-xl font-bold text-red-800 mb-2">Erro ao carregar dados</h3>
                    <p className="text-red-600">Não foi possível carregar as estatísticas. Tente novamente mais tarde.</p>
                </div>
            </div>
        );
    }

    const discountPercentage = 20;
    const maxCredits = 5;
    const giftedCredit = stats.wasReferred ? 1 : 0;
    const totalCredits = stats.availableCredits + giftedCredit;
    const creditsProgress = Math.min((totalCredits / maxCredits) * 100, 100);

    const pendingPayment = Math.max(0, stats.totalRegistered - stats.totalPaid);

    return (
        <div className="w-full max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Hero Section */}
            <div className="relative overflow-hidden rounded-2xl bg-slate-900 px-8 py-12 text-white md:px-16 md:py-16 shadow-xl">
                <div className="absolute inset-0 opacity-40">
                    <div className="absolute inset-0 bg-gradient-to-br from-custom via-transparent to-slate-900"></div>
                    <div className="h-full w-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-custom/30 via-transparent to-transparent"></div>
                </div>
                <div className="relative z-10 max-w-2xl">
                    <span className="mb-4 inline-block rounded-full bg-custom/20 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-custom ring-1 ring-custom/30">
                        Programa de Indicações
                    </span>
                    <h2 className="mb-4 text-4xl font-black md:text-5xl leading-tight text-white">Indique e Ganhe</h2>
                    <p className="text-lg font-medium text-slate-300 md:text-xl">
                        Indique amigos e ganhe descontos! Para cada indicação que assinar o plano pago, receba <span className="text-custom font-bold">{discountPercentage}% de desconto</span> na próxima fatura.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
                {/* Left Column: Share Card & Progress */}
                <div className="xl:col-span-2 space-y-8">

                    {/* Share Card */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
                        <h3 className="mb-6 text-xl font-bold text-slate-900 flex items-center gap-2">
                            <LinkIcon className="w-6 h-6 text-custom" />
                            Seu Link de Indicação
                        </h3>
                        <div className="flex flex-col gap-6">
                            <div className="flex flex-col sm:flex-row gap-3">
                                <div className="relative flex-1">
                                    <input
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-slate-600 focus:ring-custom outline-none font-medium text-sm sm:text-base font-mono"
                                        readOnly
                                        type="text"
                                        value={stats.referralLink}
                                    />
                                </div>
                                <button
                                    onClick={copyToClipboard}
                                    className={`flex items-center justify-center gap-2 rounded-xl px-8 py-4 font-bold transition-all ${copied
                                        ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                                        : 'bg-custom hover:bg-custom-hover text-white shadow-lg shadow-custom/20 hover:shadow-custom/30'
                                        }`}
                                >
                                    {copied ? <CheckCircle className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                                    {copied ? 'Copiado!' : 'Copiar Link'}
                                </button>
                            </div>

                            <div className="border-t border-slate-100 pt-6">
                                <p className="mb-4 text-sm font-semibold text-slate-500 uppercase tracking-wider">Compartilhar via</p>
                                <div className="flex flex-wrap gap-4">
                                    <button
                                        onClick={() => shareLink('whatsapp')}
                                        className="flex items-center gap-3 rounded-xl border border-slate-200 px-6 py-3 font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                                    >
                                        <MessageCircle className="w-5 h-5 text-[#25D366]" /> WhatsApp
                                    </button>
                                    <button
                                        onClick={() => shareLink('email')}
                                        className="flex items-center gap-3 rounded-xl border border-slate-200 px-6 py-3 font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                                    >
                                        <Mail className="w-5 h-5 text-custom" /> Email
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Reward Progress */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h3 className="text-xl font-bold text-slate-900">Progresso de Recompensas</h3>
                                <p className="text-sm text-slate-500">
                                    {totalCredits >= maxCredits
                                        ? 'Parabéns! Você alcançou o desconto máximo!'
                                        : `Ainda faltam ${maxCredits - totalCredits} indicações para o bônus VIP`}
                                </p>
                            </div>
                            <div className="flex gap-1">
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <Star
                                        key={i}
                                        className={`w-6 h-6 ${i < totalCredits ? 'text-amber-400 fill-amber-400' : 'text-slate-200 fill-slate-200'}`}
                                    />
                                ))}
                            </div>
                        </div>
                        <div className="space-y-6">
                            <div className="flex justify-between text-sm font-bold mb-2">
                                <span className="text-slate-600">Créditos Ativos</span>
                                <span className="text-custom">{Math.round(creditsProgress)}%</span>
                            </div>
                            <div className="relative h-4 w-full overflow-hidden rounded-full bg-slate-100">
                                <div
                                    className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-custom to-teal-300 transition-all duration-1000 ease-out"
                                    style={{ width: `${creditsProgress}%` }}
                                ></div>
                            </div>
                            <div className="flex justify-between text-xs font-bold text-slate-400 px-1">
                                <span>0</span>
                                <span className={totalCredits >= 1 ? 'text-custom' : ''}>1</span>
                                <span className={totalCredits >= 2 ? 'text-custom' : ''}>2</span>
                                <span className={totalCredits >= 3 ? 'text-custom' : ''}>3</span>
                                <span className={totalCredits >= 4 ? 'text-custom' : ''}>4</span>
                                <span className={totalCredits >= 5 ? 'text-amber-500' : ''}>5 VIP</span>
                            </div>
                        </div>

                        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex items-start gap-4 rounded-xl bg-custom/5 p-4 border border-custom/10">
                                <Star className="w-6 h-6 text-custom flex-shrink-0 mt-1" />
                                <div>
                                    <p className="text-sm font-bold text-slate-900">Bônus Por Usuário</p>
                                    <p className="text-xs text-slate-500 mt-1">Ganha {discountPercentage}% de desconto para cada cliente indicado e pagante.</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4 rounded-xl bg-amber-50 p-4 border border-amber-100">
                                <CheckCircle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-1" />
                                <div>
                                    <p className="text-sm font-bold text-slate-900">Teto Máximo</p>
                                    <p className="text-xs text-slate-500 mt-1">Você pode acumular até 100% de isenção na fatura (5 créditos).</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: Stats Grid */}
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-1 h-fit">

                    {/* Stat Card 1 */}
                    <div className="flex items-center gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-md">
                        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                            <Users className="w-7 h-7" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-slate-500">Usuários Cadastrados</p>
                            <p className="text-2xl font-black text-slate-900 mt-1">{stats.totalRegistered}</p>
                        </div>
                    </div>

                    {/* Stat Card 2 */}
                    <div className="flex items-center gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-md">
                        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                            <Wallet className="w-7 h-7" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-slate-500">Pagamentos Confirmados</p>
                            <p className="text-2xl font-black text-slate-900 mt-1">{stats.totalPaid}</p>
                        </div>
                    </div>

                    {/* Stat Card 3 */}
                    <div className="flex items-center gap-6 rounded-2xl border border-custom/20 bg-custom/5 p-6 shadow-sm ring-1 ring-custom/20">
                        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-custom text-white">
                            <TrendingUp className="w-7 h-7" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-custom">Créditos Disponíveis</p>
                            <p className="text-2xl font-black text-slate-900 mt-1">{totalCredits}</p>
                            <p className="text-xs font-semibold text-custom mt-1">Próxima fatura</p>
                        </div>
                    </div>

                    {/* Stat Card 4 */}
                    <div className="flex items-center gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-md">
                        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-500">
                            <Clock className="w-7 h-7" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-slate-500">Aguardando Pagto.</p>
                            <p className="text-2xl font-black text-slate-900 mt-1">{pendingPayment}</p>
                            <p className="text-xs font-semibold text-slate-400 mt-1 italic">Processando sistema...</p>
                        </div>
                    </div>

                </div>
            </div>
            <Toaster position="bottom-center" />
        </div>
    );
}
