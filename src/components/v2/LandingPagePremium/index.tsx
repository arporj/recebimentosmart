import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { formatCurrency } from '../../../lib/utils';

const normalizePlanName = (name: string) =>
    name.toLowerCase().normalize("NFD").replace(/[^\w\s]/gi, '');

const initialTiers = [
    {
        name: 'Básico',
        price: '--,--',
        description: 'Ideal para quem está começando.',
        features: [
            { text: 'Até 20 clientes', available: true },
            { text: 'Gestão de cobranças', available: true },
            { text: 'Dashboard simples', available: true },
            { text: 'Campos personalizados', available: false },
        ],
        popular: false,
        disabled: false,
        cta: 'Começar Agora',
        ctaLink: '/v2/cadastro',
    },
    {
        name: 'Pro',
        price: '--,--',
        description: 'Para quem quer crescer sem limites.',
        features: [
            { text: 'Clientes ilimitados', available: true },
            { text: 'Relatórios detalhados', available: true },
            { text: 'Campos personalizados', available: true },
            { text: 'Análises de performance', available: true },
            { text: 'Notificação semanal por email', available: true },
        ],
        popular: true,
        disabled: false,
        cta: 'Começar Agora',
        ctaLink: '/v2/cadastro',
    },
    {
        name: 'Premium',
        price: '--,--',
        description: 'O máximo em automação e suporte.',
        features: [
            { text: 'Tudo do plano Pró', available: true },
            { text: 'Notificação por WhatsApp', available: true },
            { text: 'Suporte prioritário', available: true },
            { text: 'Múltiplos usuários', available: true },
        ],
        popular: false,
        disabled: true,
        cta: 'Em Breve',
        ctaLink: '#',
    },
];

export const LandingPagePremium: React.FC = () => {
    const [pricingTiers, setPricingTiers] = useState(initialTiers);

    useEffect(() => {
        const fetchPrices = async () => {
            const { data, error } = await supabase.rpc('get_all_plans_with_prices');
            if (error) {
                console.error("Error fetching prices:", error);
            } else if (data) {
                setPricingTiers(prev => prev.map(tier => {
                    const planData = data.find((p: { name: string }) => normalizePlanName(p.name) === normalizePlanName(tier.name));
                    const newPrice = planData ? formatCurrency(planData.price_monthly).replace('R$\xa0', '').replace('R$ ', '') : tier.price;
                    return { ...tier, price: newPrice };
                }));
            }
        };
        fetchPrices();
    }, []);

    const features = [
        {
            icon: 'payments',
            title: 'Gestão de Cobranças',
            description: 'Automatize o envio de cobranças e lembretes para seus clientes, reduzindo drasticamente a inadimplência com zero esforço manual.',
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
        <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-[#f6f8f8] text-slate-900 font-['Inter',sans-serif] transition-colors duration-300"
            style={{
                backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(41, 168, 168, 0.05) 1px, transparent 0)',
                backgroundSize: '40px 40px',
            }}
        >
            <div className="layout-container flex h-full grow flex-col">

                {/* ─── Header ─── */}
                <header className="sticky top-0 z-50 w-full border-b border-[#29a8a8]/10 bg-[#f6f8f8]/80 backdrop-blur-md px-4 md:px-20 py-4">
                    <div className="mx-auto flex max-w-7xl items-center justify-between">
                        <div className="flex items-center gap-2 md:gap-3">
                            <img src="/images/logo.svg" alt="Recebimento $mart" className="h-8 w-8 md:h-10 md:w-10 rounded-lg shadow-lg shadow-[#29a8a8]/20" />
                            <h2 className="block text-lg sm:text-xl font-extrabold tracking-tight text-slate-900">Recebimento <span className="text-[#29a8a8]">$mart</span></h2>
                        </div>
                        <nav className="hidden md:flex items-center gap-10">
                            <a className="text-sm font-semibold text-slate-600 hover:text-[#29a8a8] transition-colors" href="#features">Funcionalidades</a>
                            <a className="text-sm font-semibold text-slate-600 hover:text-[#29a8a8] transition-colors" href="#pricing">Planos</a>
                            <a className="text-sm font-semibold text-slate-600 hover:text-[#29a8a8] transition-colors" href="#">Sobre</a>
                        </nav>
                        <div className="flex items-center gap-2 sm:gap-4">
                            <Link className="rounded-lg bg-slate-200/50 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200 hover:text-[#29a8a8] transition-colors" to="/v2/login">
                                Login
                            </Link>
                            <Link className="hidden sm:flex cursor-pointer items-center justify-center rounded-lg bg-[#29a8a8] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#29a8a8]/30 hover:scale-105 active:scale-95 transition-all" to="/v2/cadastro">
                                <span>Teste Grátis</span>
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
                                    <h1 className="text-slate-900 text-5xl font-black leading-[1.1] tracking-tight md:text-6xl lg:text-7xl">
                                        Controle seus recebimentos com <span className="text-[#29a8a8]">inteligência</span> e simplicidade
                                    </h1>
                                    <p className="max-w-[540px] text-lg font-medium leading-relaxed text-slate-600 md:text-xl">
                                        Otimize sua gestão financeira com um sistema completo e fácil de usar, desenhado especificamente para pequenas empresas decolarem.
                                    </p>
                                    <div className="flex flex-wrap gap-4">
                                        <Link className="flex h-14 min-w-[200px] cursor-pointer items-center justify-center rounded-xl bg-[#29a8a8] px-8 text-lg font-bold text-white shadow-xl shadow-[#29a8a8]/30 hover:bg-[#29a8a8]/90 transition-all" to="/v2/cadastro">
                                            Começar agora
                                        </Link>
                                        <a className="flex h-14 min-w-[200px] cursor-pointer items-center justify-center rounded-xl border-2 border-slate-200 bg-white px-8 text-lg font-bold text-slate-700 hover:bg-slate-50 transition-all" href="#features">
                                            Ver demonstração
                                        </a>
                                    </div>
                                    <div className="flex items-center gap-4 text-sm font-semibold text-slate-500">
                                        <div className="flex -space-x-2">
                                            <div className="size-8 rounded-full border-2 border-white bg-slate-200 bg-cover bg-center" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuDMdgFSSbGXd10EAmWwCU2RQ506McdOpbnBjN0UvqwPacsoeBa8vYAplTwEegsYQaf8YWCeygYBssjf25EQjZJL5dIMQAEj0UDiENvlYKK-r5-BNnP7vKZFhuA50TKKsx6QRoMDJJQf37rXDP3OiKh2NJph3pgkiFyJaeq9z89ZbcQn-3e7OKEQl8HKY6cFAg9jSlTEzT0levygdgB-dgvUtG3E_0AnURkYls3EAUF9VOpmC0t5xRMlZCPZh2Bzos-pwNXZilJslgy1')" }} />
                                            <div className="size-8 rounded-full border-2 border-white bg-slate-300 bg-cover bg-center" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuC7boLxKEXXwykCK4yk555SzPbdo063UoOzkL2wQqliVWS4EwoZEd9oQ6S-_Ui_l0DW8doxJaB_XLd_gB9UauDSTgijT7McKeAz0n-nbRDv6dALuglkNkUNvDWp96JYDnLu8Pu4lOBgmosav9dl4BwbFZ9ILqS02_lo9YwxCixisiChThuG79pIetnGkPHYHBV0WN4NlOzvwyGWlN8N5owTHcEMMiV0ZiiqzQzzpXHuPllbPMkah0Rp_UBTyO_jKhm0MgNu_eM2mfMM')" }} />
                                            <div className="size-8 rounded-full border-2 border-white bg-slate-400 bg-cover bg-center" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuANoBfUwr7ilso8OumwLXEW_fVnrZQrO_zjoYp61QWVQvTuK0Lr6TBfRsSFUq0HdcJSQC8B9U6MGVpdBwxTDMH_6YYXj1W3c7lilv5QUZdraNzD4AALzGzodrUuM90HSgFbsFgn6uspRUzrjRPEBU0pfQxgrerNfLO99ddsJpKCl8ZF6SnRUmIg6jN4H6vPSy-gb5bMOjYlmbeS-S09g5wEcy8SY6KZE9JaC2E74xZvrF5_YfrgtNW12zUQ1dd3WBJvYiIx0ntCyVDJ')" }} />
                                        </div>
                                        <span>+5.000 empresas confiam no Recebimento $mart</span>
                                    </div>
                                </div>
                                <div className="relative flex-1 lg:max-w-xl">
                                    <div className="absolute -inset-4 bg-[#29a8a8]/10 blur-3xl rounded-full" />
                                    <div className="relative rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
                                        <img alt="Dashboard Mockup" className="w-full rounded-xl" src="https://lh3.googleusercontent.com/aida-public/AB6AXuA2qqsn3anEDn4CylhjeShDGQwDWkBLu3Jx2z6gq6PSG4d2eP-Zzlb3MecJPP9g29O6709u4X1JnvgNpczm57H9vHbA6Lh3BNMW_AFY7C50DuVDv3vm8uMa-Hqj5w9F-iyzjcBRn3ntu_z3eWBloIu440IFbGE4y8czdtOynRKWJ5v1hM_j8tjtnaFF8n_a_fFRXiRVXHED08WultgsD-y2zivGiCKZHWw_Im398LjJvkUbE7qu9cTjdQDmPspxZLxLcgDT93_JwAIl" />
                                    </div>
                                    <div className="absolute -bottom-6 -left-6 rounded-xl border border-slate-200 bg-white p-4 shadow-xl hidden md:block">
                                        <div className="flex items-center gap-3">
                                            <div className="flex size-10 items-center justify-center rounded-full bg-green-100 text-green-600">
                                                <span className="material-symbols-outlined">check_circle</span>
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-slate-400">Pagamento Recebido</p>
                                                <p className="text-sm font-bold text-slate-900">R$ 1.250,00 via Pix</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* ─── Features ─── */}
                    <section className="bg-white px-6 py-24 md:px-20" id="features">
                        <div className="mx-auto max-w-7xl">
                            <div className="mb-16 text-center">
                                <h2 className="text-[#29a8a8] text-sm font-bold uppercase tracking-[0.2em] mb-3">Funcionalidades</h2>
                                <h3 className="text-3xl font-black text-slate-900 md:text-4xl">Tudo o que você precisa para gerir suas finanças</h3>
                            </div>
                            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                                {features.map((f, i) => (
                                    <div key={i} className="group flex flex-col gap-6 rounded-2xl border border-slate-100 bg-[#f6f8f8] p-8 transition-all hover:-translate-y-2 hover:border-[#29a8a8]/20 hover:shadow-xl hover:shadow-[#29a8a8]/5">
                                        <div className="flex size-14 items-center justify-center rounded-xl bg-white text-[#29a8a8] shadow-sm group-hover:bg-[#29a8a8] group-hover:text-white transition-colors">
                                            <span className="material-symbols-outlined text-3xl">{f.icon}</span>
                                        </div>
                                        <div className="flex flex-col gap-3">
                                            <h4 className="text-xl font-bold text-slate-900">{f.title}</h4>
                                            <p className="text-slate-600 leading-relaxed">{f.description}</p>
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
                                <h3 className="text-3xl font-black text-slate-900 md:text-4xl">O plano ideal para cada fase do seu negócio</h3>
                            </div>
                            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 items-center">
                                {pricingTiers.map((tier) => (
                                    <div
                                        key={tier.name}
                                        className={`relative flex flex-col gap-8 rounded-3xl p-8 transition-all ${tier.popular
                                            ? 'border-2 border-[#29a8a8] bg-white shadow-2xl shadow-[#29a8a8]/10 scale-105 z-10'
                                            : 'border border-slate-200 bg-white hover:border-[#29a8a8]/30'
                                            } ${tier.disabled ? 'opacity-60' : ''}`}
                                    >
                                        {tier.popular && (
                                            <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-[#29a8a8] px-4 py-1 text-xs font-bold text-white uppercase tracking-widest">
                                                Mais Popular
                                            </div>
                                        )}
                                        {tier.disabled && (
                                            <div className="absolute inset-0 bg-slate-100/70 flex items-center justify-center rounded-3xl z-20">
                                                <span className="text-2xl font-bold text-slate-500 border-2 border-slate-300 px-6 py-2 rounded -rotate-12">Em breve</span>
                                            </div>
                                        )}
                                        <div>
                                            <h5 className="text-lg font-bold text-slate-900">{tier.name}</h5>
                                            <p className="mt-2 text-sm text-slate-500">{tier.description}</p>
                                            <div className="mt-6 flex items-baseline gap-1">
                                                <span className="text-4xl font-black text-slate-900">R$ {tier.price}</span>
                                                <span className="text-slate-500 font-bold">/mês</span>
                                            </div>
                                        </div>
                                        {tier.disabled ? (
                                            <button
                                                className="w-full text-center rounded-xl text-sm font-bold py-3 border-2 border-slate-200 text-slate-400 cursor-not-allowed"
                                                disabled
                                            >
                                                Indisponível
                                            </button>
                                        ) : (
                                            <Link
                                                to={tier.ctaLink}
                                                className={`w-full text-center rounded-xl text-sm font-bold transition-all ${tier.popular
                                                    ? 'bg-[#29a8a8] py-4 text-white shadow-lg shadow-[#29a8a8]/30 hover:bg-[#29a8a8]/90'
                                                    : 'border-2 border-slate-100 py-3 text-slate-900 hover:bg-slate-50'
                                                    }`}
                                            >
                                                {tier.cta}
                                            </Link>
                                        )}
                                        <ul className="flex flex-col gap-4">
                                            {tier.features.map((f) => (
                                                <li key={f.text} className={`flex items-center gap-3 text-sm font-medium ${f.available ? 'text-slate-600' : 'text-slate-400 line-through'}`}>
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
                <footer className="border-t border-slate-200 bg-white px-6 py-12 md:px-20">
                    <div className="mx-auto max-w-7xl">
                        <div className="grid grid-cols-1 gap-12 md:grid-cols-4">
                            <div className="flex flex-col gap-6">
                                <div className="flex items-center gap-3">
                                    <img src="/images/logo.svg" alt="Recebimento $mart" className="h-10 w-10 rounded-lg" />
                                    <h2 className="text-xl font-extrabold tracking-tight text-slate-900">Recebimento <span className="text-[#29a8a8]">$mart</span></h2>
                                </div>
                                <p className="text-sm text-slate-500 leading-relaxed">A solução inteligente para o controle financeiro da sua pequena empresa.</p>
                            </div>
                            <div>
                                <h6 className="mb-6 text-sm font-bold uppercase tracking-wider text-slate-900">Produto</h6>
                                <ul className="flex flex-col gap-4 text-sm text-slate-600">
                                    <li><a className="hover:text-[#29a8a8] transition-colors" href="#features">Funcionalidades</a></li>
                                    <li><a className="hover:text-[#29a8a8] transition-colors" href="#">API</a></li>
                                    <li><a className="hover:text-[#29a8a8] transition-colors" href="#">Segurança</a></li>
                                </ul>
                            </div>
                            <div>
                                <h6 className="mb-6 text-sm font-bold uppercase tracking-wider text-slate-900">Suporte</h6>
                                <ul className="flex flex-col gap-4 text-sm text-slate-600">
                                    <li><a className="hover:text-[#29a8a8] transition-colors" href="#">Central de Ajuda</a></li>
                                    <li><a className="hover:text-[#29a8a8] transition-colors" href="#">Status do Sistema</a></li>
                                    <li><a className="hover:text-[#29a8a8] transition-colors" href="#">Contato</a></li>
                                </ul>
                            </div>
                            <div>
                                <h6 className="mb-6 text-sm font-bold uppercase tracking-wider text-slate-900">Legal</h6>
                                <ul className="flex flex-col gap-4 text-sm text-slate-600">
                                    <li><a className="hover:text-[#29a8a8] transition-colors" href="#">Privacidade</a></li>
                                    <li><a className="hover:text-[#29a8a8] transition-colors" href="#">Termos de Uso</a></li>
                                    <li><a className="hover:text-[#29a8a8] transition-colors" href="#">Cookies</a></li>
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
