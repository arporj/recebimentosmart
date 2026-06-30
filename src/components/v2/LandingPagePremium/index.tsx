import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { formatCurrency } from '../../../lib/utils';
import { INITIAL_PLANS_CONFIG, PLAN_ORDER, getPlanFeatures, getPlanDescription, PlanSlug } from '../../../lib/plans';

export const LandingPagePremium: React.FC = () => {
    // Inicializa a UI usando as configurações padrão do arquivo unificado
    const [pricingTiers, setPricingTiers] = useState<any[]>(INITIAL_PLANS_CONFIG.map(p => ({
        ...p,
        price: p.priceDefault,
        features: p.featuresDefault,
        disabled: false
    })));
    const [heroSlide, setHeroSlide] = useState(0);

    // Auto-play do carrossel de screenshots
    useEffect(() => {
        const timer = setInterval(() => setHeroSlide(prev => (prev + 1) % 3), 5000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const fetchPlansData = async () => {
            const { data, error } = await supabase.rpc('get_all_plans_with_prices');
            if (error) {
                console.error("Erro ao resgatar os planos na landing page:", error);
            } else if (data) {
                const updatedTiers = PLAN_ORDER.map(slug => {
                    const planData = data.find((p: any) => p.slug === slug);
                    const baseTier = INITIAL_PLANS_CONFIG.find(t => t.slug === slug)!;

                    if (!planData) {
                        return {
                            ...baseTier,
                            price: baseTier.priceDefault,
                            features: baseTier.featuresDefault,
                            disabled: false
                        };
                    }

                    const formattedPrice = formatCurrency(planData.price_monthly)
                        .replace('R$\xa0', '')
                        .replace('R$ ', '');

                    const features = getPlanFeatures(slug, planData);
                    const description = getPlanDescription(slug, planData);

                    return {
                        ...baseTier,
                        price: formattedPrice,
                        description: description,
                        features: features,
                        disabled: false
                    };
                });

                setPricingTiers(updatedTiers);
            }
        };
        fetchPlansData();
    }, []);

    const features = [
        {
            icon: 'payments',
            title: 'Gestão Financeira',
            description: 'Centralize contas correntes reais com favicons automáticos dos bancos, monitore cartões de crédito, controle receitas e despesas e acompanhe o fluxo de caixa em uma visão unificada.',
        },
        {
            icon: 'groups',
            title: 'Controle de Clientes',
            description: 'Mantenha um cadastro completo e organizado de seus clientes, com histórico de pagamentos, anexos e notas personalizadas.',
        },
        {
            icon: 'bar_chart',
            title: 'Relatórios Inteligentes',
            description: 'Tenha acesso a relatórios visuais intuitivos que ajudam a entender a saúde financeira e o fluxo de caixa do seu negócio.',
        },
        {
            icon: 'verified_user',
            title: 'Segurança de Dados',
            description: 'Seus dados e de seus clientes estão protegidos com criptografia de ponta e as melhores práticas de segurança do mercado.',
        },
    ];

    return (
        <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-[#f6f8f8] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-['Inter',sans-serif] transition-colors duration-300"
            style={{
                backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(41, 168, 168, 0.05) 1px, transparent 0)',
                backgroundSize: '40px 40px',
            }}
        >
            <div className="layout-container flex h-full grow flex-col">

                {/* ─── Header ─── */}
                <header className="sticky top-0 z-50 w-full border-b border-[#29a8a8]/10 dark:border-slate-800 bg-[#f6f8f8]/80 dark:bg-slate-950/80 backdrop-blur-md px-4 md:px-20 py-4">
                    <div className="mx-auto flex max-w-7xl items-center justify-between">
                        <div className="flex items-center gap-2 md:gap-3">
                            <img src="/images/logo.svg" alt="Recebimento $mart" className="h-8 w-8 md:h-10 md:w-10 rounded-lg shadow-lg shadow-[#29a8a8]/20" />
                            <h2 className="block text-lg sm:text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">Recebimento <span className="text-[#29a8a8]">$mart</span></h2>
                        </div>
                        <nav className="hidden md:flex items-center gap-10">
                            <a className="text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-[#29a8a8] transition-colors" href="#features">Funcionalidades</a>
                            <a className="text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-[#29a8a8] transition-colors" href="#pricing">Planos</a>
                            <Link className="text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-[#29a8a8] transition-colors" to="/faq">Perguntas Frequentes (FAQ)</Link>
                        </nav>
                        <div className="flex items-center gap-2 sm:gap-4">
                            <Link className="rounded-lg bg-slate-200/50 dark:bg-slate-800/80 px-4 py-2 text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-[#29a8a8] transition-colors" to="/v2/login">
                                Login
                            </Link>
                            <Link className="hidden sm:flex cursor-pointer items-center justify-center rounded-lg bg-[#29a8a8] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#29a8a8]/30 hover:scale-105 active:scale-95 transition-all" to="/v2/cadastro">
                                <span>Usar Grátis</span>
                            </Link>
                        </div>
                    </div>
                </header>

                {/* ─── Main ─── */}
                <main className="flex-1">

                    {/* ─── Hero ─── */}
                    <section className="relative px-6 py-16 md:px-20 md:py-28 overflow-hidden">
                        <div className="mx-auto max-w-7xl">
                            <div className="flex flex-col gap-12 lg:flex-row lg:items-center">
                                <div className="flex flex-1 flex-col gap-8 text-left z-10">
                                    <div className="inline-flex items-center gap-2 self-start rounded-full bg-[#29a8a8]/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#29a8a8]">
                                        <span className="material-symbols-outlined text-sm">auto_awesome</span>
                                        Inteligência Financeira
                                    </div>
                                    <h1 className="text-slate-900 dark:text-white text-5xl font-black leading-[1.1] tracking-tight md:text-6xl lg:text-7xl">
                                        Controle seus recebimentos com <span className="text-[#29a8a8]">inteligência</span> e simplicidade
                                    </h1>
                                    <p className="max-w-[540px] text-lg font-medium leading-relaxed text-slate-600 dark:text-slate-400 md:text-xl">
                                        Otimize sua gestão financeira com um sistema completo e fácil de usar, desenhado para organizar suas finanças pessoais ou impulsionar o seu negócio.
                                    </p>
                                    <div className="flex flex-wrap gap-4">
                                        <Link className="flex h-14 min-w-[200px] cursor-pointer items-center justify-center rounded-xl bg-[#29a8a8] px-8 text-lg font-bold text-white shadow-xl shadow-[#29a8a8]/30 hover:bg-[#29a8a8]/90 transition-all" to="/v2/cadastro">
                                            Começar agora
                                        </Link>
                                    </div>

                                </div>
                                <div className="relative flex-1 lg:max-w-xl">
                                    <div className="absolute -inset-4 bg-[#29a8a8]/10 blur-3xl rounded-full" />
                                    {(() => {
                                        const screenshots = [
                                            { src: '/images/screenshot-clientes.png', alt: 'Listagem de Clientes', label: 'Clientes' },
                                            { src: '/images/screenshot-pagamentos.png', alt: 'Pagamentos do Mês', label: 'Pagamentos' },
                                            { src: '/images/screenshot-relatorios.png', alt: 'Relatórios e Gráficos', label: 'Relatórios' },
                                        ];
                                        return (
                                            <div className="relative">
                                                <div className="relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 shadow-2xl overflow-hidden">
                                                    {screenshots.map((s, i) => (
                                                        <img
                                                            key={i}
                                                            alt={s.alt}
                                                            className={`w-full rounded-xl transition-all duration-700 ease-in-out ${i === heroSlide ? 'opacity-100 relative' : 'opacity-0 absolute inset-0 p-2'}`}
                                                            src={s.src}
                                                        />
                                                    ))}
                                                </div>
                                                {/* Dots + Label */}
                                                <div className="flex items-center justify-center gap-3 mt-4">
                                                    {screenshots.map((s, i) => (
                                                        <button
                                                            key={i}
                                                            onClick={() => setHeroSlide(i)}
                                                            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${i === heroSlide ? 'bg-[#29a8a8] text-white shadow-md' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                                                        >
                                                            {s.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* ─── Features ─── */}
                    <section className="bg-white dark:bg-slate-900 px-6 py-24 md:px-20" id="features">
                        <div className="mx-auto max-w-7xl">
                            <div className="mb-16 text-center">
                                <h2 className="text-[#29a8a8] text-sm font-bold uppercase tracking-[0.2em] mb-3">Funcionalidades</h2>
                                <h3 className="text-3xl font-black text-slate-900 dark:text-white md:text-4xl">Tudo o que você precisa para gerir suas finanças</h3>
                            </div>
                            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                                {features.map((f, i) => (
                                    <div key={i} className="group flex flex-col gap-6 rounded-2xl border border-slate-100 dark:border-slate-800 bg-[#f6f8f8] dark:bg-slate-950 p-8 transition-all hover:-translate-y-2 hover:border-[#29a8a8]/20 hover:shadow-xl hover:shadow-[#29a8a8]/5">
                                        <div className="flex size-14 items-center justify-center rounded-xl bg-white dark:bg-slate-900 text-[#29a8a8] shadow-sm group-hover:bg-[#29a8a8] group-hover:text-white transition-colors">
                                            <span className="material-symbols-outlined text-3xl">{f.icon}</span>
                                        </div>
                                        <div className="flex flex-col gap-3">
                                            <h4 className="text-xl font-bold text-slate-900 dark:text-white">{f.title}</h4>
                                            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{f.description}</p>
                                        </div>
                                        <a className="mt-auto flex items-center gap-2 text-sm font-bold text-[#29a8a8] group-hover:gap-3 transition-all" href="#">
                                            Saiba mais <span className="material-symbols-outlined text-sm">arrow_forward</span>
                                        </a>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>

                    {/* ─── Pricing ─── */}
                    <section className="px-6 py-24 md:px-20" id="pricing">
                        <div className="mx-auto max-w-7xl">
                            <div className="mb-16 text-center">
                                <h2 className="text-[#29a8a8] text-sm font-bold uppercase tracking-[0.2em] mb-3">Preços</h2>
                                <h3 className="text-3xl font-black text-slate-900 dark:text-white md:text-4xl">O plano ideal para cada fase do seu negócio</h3>
                            </div>
                            <div className="grid grid-cols-1 gap-8 lg:grid-cols-4 items-start">
                                {pricingTiers.map((tier) => (
                                    <div
                                        key={tier.name}
                                        className={`relative flex flex-col gap-8 rounded-3xl p-8 transition-all ${tier.popular
                                            ? 'border-2 border-[#29a8a8] bg-white dark:bg-slate-900 shadow-2xl shadow-[#29a8a8]/10 scale-105 z-10'
                                            : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-[#29a8a8]/30'
                                            } ${tier.disabled ? 'opacity-60' : ''}`}
                                    >
                                        {tier.popular && (
                                            <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-[#29a8a8] px-4 py-1 text-xs font-bold text-white uppercase tracking-widest">
                                                Mais Popular
                                            </div>
                                        )}
                                        {tier.disabled && (
                                            <div className="absolute inset-0 bg-slate-100/70 dark:bg-slate-900/70 flex items-center justify-center rounded-3xl z-20">
                                                <span className="text-2xl font-bold text-slate-500 border-2 border-slate-300 px-6 py-2 rounded -rotate-12">Em breve</span>
                                            </div>
                                        )}
                                        <div>
                                            <h5 className="text-lg font-bold text-slate-900 dark:text-white">{tier.name}</h5>
                                            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{tier.description}</p>
                                            <div className="mt-6 flex items-baseline gap-1">
                                                <span className="text-4xl font-black text-slate-900 dark:text-white">R$ {tier.price}</span>
                                                <span className="text-slate-500 dark:text-slate-400 font-bold">/mês</span>
                                            </div>
                                        </div>
                                        {tier.disabled ? (
                                            <button
                                                className="w-full text-center rounded-xl text-sm font-bold py-3 border-2 border-slate-200 dark:border-slate-800 text-slate-400 cursor-not-allowed"
                                                disabled
                                            >
                                                Indisponível
                                            </button>
                                        ) : (
                                            <Link
                                                to={tier.ctaLink}
                                                className={`w-full text-center rounded-xl text-sm font-bold transition-all ${tier.popular
                                                    ? 'bg-[#29a8a8] py-4 text-white shadow-lg shadow-[#29a8a8]/30 hover:bg-[#29a8a8]/90'
                                                    : 'border-2 border-slate-100 dark:border-slate-800 py-3 text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800'
                                                    }`}
                                            >
                                                {tier.cta}
                                            </Link>
                                        )}
                                        <ul className="flex flex-col gap-4">
                                            {tier.features.map((f) => (
                                                <li key={f.text} className={`flex items-center gap-3 text-sm font-medium ${f.available ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500 line-through'}`}>
                                                    <span className={`material-symbols-outlined ${f.available ? 'text-[#29a8a8]' : ''}`}>
                                                        {f.available ? 'check_circle' : 'cancel'}
                                                    </span>
                                                    {f.text}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>

                    {/* ─── CTA ─── */}
                    <section className="px-6 py-20 md:px-20">
                        <div className="mx-auto max-w-5xl overflow-hidden rounded-[2rem] bg-slate-900 p-12 md:p-20 text-center relative">
                            <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-64 h-64 bg-[#29a8a8]/20 blur-[100px] rounded-full" />
                            <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/2 w-64 h-64 bg-[#29a8a8]/20 blur-[100px] rounded-full" />
                            <div className="relative z-10 flex flex-col gap-8 items-center">
                                <h2 className="text-3xl font-black text-white md:text-5xl">Pronto para transformar sua gestão financeira?</h2>
                                <p className="max-w-[600px] text-lg text-slate-400">Junte-se a milhares de empresas que já usam o Recebimento $mart para simplificar o seu dia a dia.</p>
                                <Link to="/v2/cadastro" className="h-14 min-w-[240px] flex items-center justify-center rounded-xl bg-[#29a8a8] px-10 text-lg font-bold text-white shadow-xl shadow-[#29a8a8]/20 hover:scale-105 active:scale-95 transition-all">
                                    Começar agora gratuitamente
                                </Link>
                            </div>
                        </div>
                    </section>
                </main>

                {/* ─── Footer ─── */}
                <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-6 py-12 md:px-20">
                    <div className="mx-auto max-w-7xl">
                        <div className="grid grid-cols-1 gap-12 md:grid-cols-4">
                            <div className="flex flex-col gap-6">
                                <div className="flex items-center gap-3">
                                    <img src="/images/logo.svg" alt="Recebimento $mart" className="h-10 w-10 rounded-lg" />
                                    <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">Recebimento <span className="text-[#29a8a8]">$mart</span></h2>
                                </div>
                                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">A solução inteligente para o controle financeiro da sua pequena empresa.</p>
                            </div>
                            <div>
                                <h6 className="mb-6 text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">Produto</h6>
                                <ul className="flex flex-col gap-4 text-sm text-slate-600 dark:text-slate-400">
                                    <li><a className="hover:text-[#29a8a8] transition-colors" href="#features">Funcionalidades</a></li>
                                    <li><a className="hover:text-[#29a8a8] transition-colors" href="#pricing">Planos</a></li>
                                </ul>
                            </div>
                            <div>
                                <h6 className="mb-6 text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">Suporte</h6>
                                <ul className="flex flex-col gap-4 text-sm text-slate-600 dark:text-slate-400">
                                    <li><Link className="hover:text-[#29a8a8] transition-colors" to="/faq">FAQ / Ajuda</Link></li>
                                    <li><Link className="hover:text-[#29a8a8] transition-colors" to="/contato">Contato</Link></li>
                                    <li><a className="hover:text-[#29a8a8] transition-colors" href="mailto:contato@recebimentosmart.com.br">E-mail</a></li>
                                    <li><a className="hover:text-[#29a8a8] transition-colors" href="https://wa.me/5521967621494" target="_blank" rel="noopener noreferrer">WhatsApp</a></li>
                                </ul>
                            </div>
                            <div>
                                <h6 className="mb-6 text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">Legal</h6>
                                <ul className="flex flex-col gap-4 text-sm text-slate-600 dark:text-slate-400">
                                    <li><Link className="hover:text-[#29a8a8] transition-colors" to="/privacidade">Privacidade</Link></li>
                                    <li><Link className="hover:text-[#29a8a8] transition-colors" to="/termos">Termos de Uso</Link></li>
                                    <li><Link className="hover:text-[#29a8a8] transition-colors" to="/cookies">Cookies</Link></li>
                                </ul>
                            </div>
                        </div>
                        <div className="mt-16 border-t border-slate-100 pt-8 text-center text-sm text-slate-400">
                            <p>© {new Date().getFullYear()} Recebimento $mart. Todos os direitos reservados.</p>
                        </div>
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default LandingPagePremium;
