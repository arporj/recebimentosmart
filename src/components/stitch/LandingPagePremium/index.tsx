import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
    TrendingUp,
    DollarSign,
    Users,
    BarChart3,
    ShieldCheck,
    Rocket,
    CheckCircle,
    Sparkles,
    Moon,
    Sun,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatCurrency } from '../../../lib/utils';

const normalizePlanName = (name: string) =>
    name.toLowerCase().normalize("NFD").replace(/[^\w\s]/gi, '');

const initialTiers = [
    {
        name: 'Básico',
        price: '--,--',
        features: [
            'Até 20 clientes',
            'Gestão de cobranças',
            'Dashboard simples',
        ],
        popular: false,
        disabled: false,
    },
    {
        name: 'Pro',
        price: '--,--',
        features: [
            'Clientes ilimitados',
            'Relatórios detalhados',
            'Campos personalizados',
            'Análises de performance',
            'Notificação semanal por email',
        ],
        popular: true,
        disabled: false,
    },
    {
        name: 'Premium',
        price: '--,--',
        features: [
            'Tudo do plano Pró',
            'Notificação por WhatsApp',
            'Suporte prioritário',
            'Múltiplos usuários',
        ],
        popular: false,
        disabled: true,
    },
];

export const LandingPagePremium: React.FC = () => {
    const [darkMode, setDarkMode] = useState(false);
    const [pricingTiers, setPricingTiers] = useState(initialTiers);

    useEffect(() => {
        const fetchPrices = async () => {
            const { data, error } = await supabase.rpc('get_all_plans_with_prices');
            if (error) {
                console.error("Error fetching prices:", error);
            } else if (data) {
                setPricingTiers(prev => prev.map(tier => {
                    const planData = data.find((p: { name: string }) => normalizePlanName(p.name) === normalizePlanName(tier.name));
                    const newPrice = planData ? formatCurrency(planData.price_monthly).replace('R$\xa0', '') : tier.price;
                    return { ...tier, price: newPrice };
                }));
            }
        };
        fetchPrices();
    }, []);

    const features = [
        {
            icon: <DollarSign size={28} />,
            title: 'Gestão de Cobranças',
            description: 'Automatize o envio de cobranças e lembretes para seus clientes, reduzindo drasticamente a inadimplência com zero esforço manual.',
            highlighted: false,
        },
        {
            icon: <Users size={28} />,
            title: 'Controle de Clientes',
            description: 'Mantenha um cadastro completo e organizado de seus clientes, com histórico de pagamentos, anexos e notas personalizadas.',
            highlighted: true,
        },
        {
            icon: <BarChart3 size={28} />,
            title: 'Relatórios Inteligentes',
            description: 'Tenha acesso a relatórios visuais intuitivos que ajudam a entender a saúde financeira e o fluxo de caixa do seu negócio.',
            highlighted: false,
        },
        {
            icon: <ShieldCheck size={28} />,
            title: 'Segurança de Dados',
            description: 'Seus dados e de seus clientes estão protegidos com criptografia de ponta e as melhores práticas de segurança do mercado.',
            highlighted: true,
        },
    ];

    const wrapperClass = darkMode
        ? 'bg-slate-900 text-slate-100'
        : 'bg-gray-50 text-slate-900';

    return (
        <div className={`${wrapperClass} font-sans antialiased transition-colors duration-500 min-h-screen`}>

            {/* ─── Header ─── */}
            <header className={`fixed top-0 left-0 right-0 z-50 glass ${darkMode ? 'bg-slate-900/80 border-b border-slate-800' : 'border-b border-slate-200/50'}`}>
                <nav className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <img src="/images/header.png" alt="Recebimento $mart" className="h-8" />
                    </div>
                    <div className="flex items-center gap-3">
                        <Link className={`text-sm font-medium px-3 py-2 ${darkMode ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900'} transition-colors`} to="/v2/login">
                            Login
                        </Link>
                        <Link
                            className="text-sm font-semibold bg-custom text-white px-4 py-2 rounded-full hover:bg-custom-hover transition-colors shadow-lg"
                            to="/v2/cadastro"
                        >
                            Registrar
                        </Link>
                    </div>
                </nav>
            </header>

            {/* ─── Main ─── */}
            <main className="pt-16">

                {/* ─── Hero ─── */}
                <section className="relative pt-16 pb-20 px-4 overflow-hidden">
                    {/* Background gradient */}
                    <div className={`absolute inset-0 ${darkMode ? 'bg-gradient-to-b from-slate-900 to-slate-800' : 'bg-gradient-to-b from-secondary-50 to-white'}`} />

                    <div className="max-w-4xl mx-auto text-center relative z-10">
                        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-6 ${darkMode ? 'bg-custom/20 text-custom' : 'bg-secondary-100 text-custom'}`}>
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-custom opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-custom"></span>
                            </span>
                            <Sparkles size={12} className="mr-0.5" />
                            Novo: Dashboard 2.0 disponível
                        </div>
                        <h1 className="text-4xl md:text-6xl font-extrabold leading-tight mb-6">
                            Gestão de Recebimentos, <span className="text-custom">Simples e Inteligente.</span>
                        </h1>
                        <p className={`text-lg mb-8 max-w-2xl mx-auto ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            Pare de perder tempo com planilhas. Automatize suas cobranças, gerencie seus clientes e visualize suas
                            finanças de forma clara e eficiente.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <Link
                                to="/v2/cadastro"
                                className="bg-custom text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-custom-hover transition-all shadow-xl transform hover:-translate-y-1"
                            >
                                Comece Agora com 7 Dias Grátis
                            </Link>
                        </div>
                    </div>

                    {/* Dashboard mockup card */}
                    <div className="mt-16 max-w-5xl mx-auto px-4 relative z-10">
                        <div className={`relative rounded-2xl overflow-hidden shadow-2xl border-4 ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-slate-100'}`}>
                            <img
                                alt="Dashboard Mockup"
                                className={`w-full h-auto object-cover ${darkMode ? 'opacity-70' : 'opacity-90'}`}
                                src="https://lh3.googleusercontent.com/aida-public/AB6AXuAq-mTyDu3ZbH6UNbrA08UYfARxwueFHtdusb3DxNF6w2p2LdYp_SJsCBw6MuhgKf4pu2HIZZfHKL1rG1BjfDyO3F2ql6sTfoHh3fOAeINGuVz7TBhuW-NrDOGjo8EoP-tVKqI1pL_8VVtPmkWFgCTlcIJPxp61XVGCiX4hZ_aV9cjvPBsxKgYyR69jhx4QVra8v43lgJtsnAU47lh_OQqYWz1nmTsOy9LktGRQNeAI_8QDKXl5DwVItCox0QOzsx-JQ4_tOxzt9xmU"
                            />
                            {/* Float card - só desktop */}
                            <div className={`absolute top-6 right-6 glass p-4 rounded-xl shadow-xl hidden md:block ${darkMode ? 'bg-slate-800/90 border-slate-700' : ''}`}>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                                        <TrendingUp size={20} />
                                    </div>
                                    <div>
                                        <p className={`text-xs font-bold uppercase ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Receita Mensal</p>
                                        <p className="text-xl font-bold">+R$ 12.450,00</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ─── Trust Signals ─── */}
                <section className={`py-12 ${darkMode ? 'bg-slate-800/30' : 'bg-slate-100/50'}`}>
                    <div className="max-w-7xl mx-auto px-4 text-center">
                        <p className={`text-sm font-semibold mb-8 uppercase tracking-[0.15em] ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            Confiado por centenas de empreendedores
                        </p>
                        <div className={`flex flex-wrap justify-center items-center gap-8 md:gap-16 ${darkMode ? 'opacity-30' : 'opacity-50'} grayscale`}>
                            <img alt="Logo" className={`h-6 ${darkMode ? 'invert' : ''}`} src="https://lh3.googleusercontent.com/aida-public/AB6AXuDosvTKFN5onLX2i_zOYsYQL6pG04fK7eeblMuEh6iFYzeD5BlVsFK7IVjLArBWLwk_0TJTVFJMGdgzR0HLsntWVmFNzHtHxkjg841CeV94aJzvMk8NPcXYOF6ObONp_mxSMWaxxRTuuKq5yst6XG12buI2SGnqGpW43CI5E9c_Xhc1WLZFOAZ7BCTSOnE73WJt7APWEpP54_XWiY28LYOo4TE5ahVSf9fLPassOFuAqD1cUx9NU7wZyAANdVXgvzIrVpVVInVvKAGL" />
                            <img alt="Logo" className={`h-6 ${darkMode ? 'invert' : ''}`} src="https://lh3.googleusercontent.com/aida-public/AB6AXuC_WE_yFCBJqq7pSXRB86vpMKmM0x7e4MO9j0sMERxGHdgjPr1cpbreM7WLtJz46-b9iOsK4B9Z8anWK7c-Uf-dazDMzklaB2U6u-8YNSXXM_bqMGuvgdHpybJHMJwTODhwef317Lr93bc7KLnnZM2MFT15m0yufYzV3EQPnqjxLUtrDPk3vcqi6OXH0IJW8zovsJoXrYCCzSx9fMI0kv2FnzHsNGr4YBxXvUtcGvAcs_hr9pJk6l_gQjWtiIZJFR_NJixe0nP4WzlW" />
                            <img alt="Logo" className={`h-8 ${darkMode ? 'invert' : ''}`} src="https://lh3.googleusercontent.com/aida-public/AB6AXuCm-uslUsq-npHwo16uo43K9n4AnQFjs9e4Axr6q5LSdHZbWwV16MLUKobfeZ7teSA3W_wzsG8-OiKIaMnnFeJad0TKhNVi8f_hf-yMWbo9HeUh9gz2aFuo-asP5N77SZ_aDDJws6Ri5yUcXYc5CKTw12xF_BS4GfSFnF_q8UenwTvNNodtwz_Ekgbtqyq0uq7j4_tjaXhYeSZHsPwHU3MILA6CGgmAtaXIJUxVM1n627Bx3UcP3Mc-72x8JLdOc99onnL5DSBKNqu6" />
                            <img alt="Logo" className={`h-6 ${darkMode ? 'invert' : ''}`} src="https://lh3.googleusercontent.com/aida-public/AB6AXuDVS4uhrwGAuR3dOBH72s3R5t7KABYTN92E13e-ZWRv12U7SKcY-WyvxPvyi9OZnXOG6_b6OD9niaYXHQi8GugPlAbgrlBovoiaffVdykOkic9r8Tqe6FkySbK69oHCGrbSkxwDX_2T3vbI_ZBITpdZ23LyLHIU7rXnkfKBi2S1Y8v00n1AEh5aDlRGHrYvr2XDpIDcOc3FeeR2Yrlrtqqh5uutcOT6s2d8DRkosJklwS9h_1dd-PUUTir40d4Sn4BHvAgMljBLPfhk" />
                        </div>
                    </div>
                </section>

                {/* ─── Features Grid ─── */}
                <section className="py-24 px-4 max-w-7xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-4xl font-extrabold mb-4">Tudo que você precisa para crescer</h2>
                        <p className={`max-w-xl mx-auto ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            Ferramentas poderosas e modernas para impulsionar seu negócio e eliminar o trabalho manual.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {features.map((f, i) => (
                            <div
                                key={i}
                                className={
                                    f.highlighted
                                        ? 'bg-custom p-8 rounded-2xl shadow-xl text-white transform md:-translate-y-2'
                                        : `glass p-8 rounded-2xl hover:shadow-lg transition-shadow group ${darkMode ? 'bg-slate-800/60 border-slate-700' : ''}`
                                }
                            >
                                <div
                                    className={`w-14 h-14 rounded-xl flex items-center justify-center mb-6 ${f.highlighted
                                        ? 'bg-white/20 text-white'
                                        : 'bg-secondary-100 text-custom group-hover:scale-110 transition-transform'
                                        }`}
                                >
                                    {f.icon}
                                </div>
                                <h3 className="text-xl font-bold mb-3">{f.title}</h3>
                                <p className={f.highlighted ? 'text-white/90 leading-relaxed' : `leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                                    {f.description}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ─── Steps ─── */}
                <section className={`py-24 px-4 ${darkMode ? 'bg-slate-800/50' : 'bg-secondary-50'}`}>
                    <div className="max-w-7xl mx-auto">
                        <div className="text-center mb-16">
                            <h2 className="text-3xl md:text-4xl font-extrabold mb-4">Comece em 3 Passos Simples</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                            {[
                                { n: '1', title: 'Crie sua Conta', desc: 'O cadastro é rápido e você já ganha 7 dias de teste para explorar todas as funcionalidades sem compromisso.' },
                                { n: '2', title: 'Cadastre seus Clientes', desc: 'Importe ou cadastre seus clientes manualmente e configure os valores e datas de pagamento em segundos.' },
                                { n: '3', title: 'Relaxe e Acompanhe', desc: 'Deixe nosso sistema trabalhar por você. Receba notificações e acompanhe seu faturamento crescer dia após dia.' },
                            ].map(step => (
                                <div key={step.n} className="text-center">
                                    <div className="w-16 h-16 bg-custom text-white text-2xl font-bold rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                                        {step.n}
                                    </div>
                                    <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                                    <p className={darkMode ? 'text-slate-400' : 'text-slate-600'}>{step.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ─── Pricing ─── */}
                <section id="pricing" className="py-24 px-4 max-w-7xl mx-auto">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl md:text-4xl font-extrabold mb-4">Planos e Preços</h2>
                        <p className={darkMode ? 'text-slate-400' : 'text-slate-600'}>
                            Escolha o plano que melhor se adapta ao seu negócio. Cancele quando quiser.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
                        {pricingTiers.map(tier => (
                            <div
                                key={tier.name}
                                className={`
                  p-8 rounded-2xl flex flex-col relative transition-all duration-300
                  ${tier.popular
                                        ? 'border-2 border-custom shadow-2xl transform scale-105 z-10 ' + (darkMode ? 'bg-slate-800' : 'bg-white')
                                        : `glass ${darkMode ? 'bg-slate-800/60 border border-slate-700' : 'border border-slate-200'}`
                                    }
                  ${tier.disabled ? 'opacity-50' : ''}
                `}
                            >
                                {tier.popular && (
                                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-custom text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-md">
                                        Mais Popular
                                    </div>
                                )}
                                {tier.disabled && (
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 rotate-[-12deg]">
                                        <span className={`text-2xl font-bold ${darkMode ? 'text-slate-500' : 'text-slate-400'} border-2 ${darkMode ? 'border-slate-600' : 'border-slate-300'} px-6 py-2 rounded`}>Em breve</span>
                                    </div>
                                )}
                                <div className="flex-grow">
                                    <h3 className="text-xl font-bold mb-2">{tier.name}</h3>
                                    <div className="flex items-baseline gap-1 mb-8">
                                        <span className={`${tier.popular ? 'text-4xl' : 'text-3xl'} font-extrabold`}>R$ {tier.price}</span>
                                        <span className={darkMode ? 'text-slate-400 text-sm' : 'text-slate-500 text-sm'}>/mês</span>
                                    </div>
                                    <ul className="space-y-4 mb-8">
                                        {tier.features.map(f => (
                                            <li key={f} className="flex items-center gap-3 text-sm">
                                                <CheckCircle className={`flex-shrink-0 ${tier.disabled ? (darkMode ? 'text-slate-600' : 'text-slate-400') : 'text-custom'}`} size={16} />
                                                <span>{f}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                {tier.disabled ? (
                                    <button
                                        className={`w-full py-3 rounded-xl font-bold cursor-not-allowed ${darkMode ? 'bg-slate-700 text-slate-500' : 'bg-slate-200 text-slate-400'}`}
                                        disabled
                                    >
                                        Indisponível
                                    </button>
                                ) : (
                                    <Link
                                        to="/v2/cadastro"
                                        className={`w-full py-3 rounded-xl font-bold text-center block transition-all ${tier.popular
                                            ? 'bg-custom text-white hover:bg-custom-hover shadow-lg'
                                            : 'border-2 border-custom text-custom hover:bg-custom hover:text-white'
                                            }`}
                                    >
                                        Começar Agora
                                    </Link>
                                )}
                            </div>
                        ))}
                    </div>
                </section>

                {/* ─── CTA ─── */}
                <section className="py-20 px-4">
                    <div className="max-w-5xl mx-auto bg-custom rounded-3xl p-12 text-center text-white relative overflow-hidden shadow-2xl">
                        <div className="absolute -top-24 -left-24 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
                        <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-black/10 rounded-full blur-3xl"></div>
                        <h2 className="text-3xl md:text-5xl font-extrabold mb-6 relative z-10">
                            Pronto para decolar seu negócio?
                        </h2>
                        <p className="text-white/90 text-lg mb-10 max-w-2xl mx-auto relative z-10">
                            Junte-se a centenas de empreendedores que já estão otimizando seu tempo e dinheiro com a melhor plataforma de gestão.
                        </p>
                        <Link
                            to="/v2/cadastro"
                            className="inline-flex items-center gap-3 bg-white text-custom px-10 py-5 rounded-xl font-bold text-xl hover:bg-secondary-100 transition-all shadow-xl relative z-10"
                        >
                            Criar minha conta grátis
                            <Rocket size={22} />
                        </Link>
                    </div>
                </section>
            </main>

            {/* ─── Footer ─── */}
            <footer className={`py-12 px-4 border-t ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
                <div className="max-w-7xl mx-auto flex flex-col items-center gap-6">
                    <div className="flex items-center gap-2">
                        <img src="/images/header.png" alt="Recebimento $mart" className="h-6" />
                    </div>
                    <div className={`flex gap-6 text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        <a className="hover:text-custom transition-colors" href="#">Privacidade</a>
                        <a className="hover:text-custom transition-colors" href="#">Termos</a>
                        <a className="hover:text-custom transition-colors" href="#">Ajuda</a>
                        <a className="hover:text-custom transition-colors" href="#">Blog</a>
                    </div>
                    <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        © {new Date().getFullYear()} Recebimento Smart. Todos os direitos reservados.
                    </p>
                </div>
            </footer>

            {/* ─── Dark Mode Toggle ─── */}
            <button
                className={`fixed bottom-6 right-6 w-12 h-12 rounded-full shadow-2xl flex items-center justify-center z-[100] transition-all hover:scale-110 ${darkMode ? 'bg-slate-800 border border-slate-700 text-yellow-400' : 'bg-white border border-slate-200 text-slate-700'}`}
                onClick={() => setDarkMode(!darkMode)}
                title={darkMode ? 'Modo claro' : 'Modo escuro'}
            >
                {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
        </div>
    );
};

export default LandingPagePremium;
