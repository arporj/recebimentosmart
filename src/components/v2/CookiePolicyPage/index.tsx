import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Cookie, Settings, BarChart3, Shield, ToggleRight } from 'lucide-react';

const CookiePolicyPage = () => {
    useEffect(() => { window.scrollTo(0, 0); }, []);

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <header className="sticky top-0 z-50 w-full border-b border-[#29a8a8]/10 bg-[#f6f8f8]/80 backdrop-blur-md px-4 md:px-20 py-4">
                <div className="mx-auto flex max-w-7xl items-center justify-between">
                    <Link to="/" className="flex items-center gap-2 md:gap-3">
                        <img src="/images/logo.svg" alt="Recebimento $mart" className="h-8 w-8 md:h-10 md:w-10 rounded-lg" />
                        <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900">Recebimento <span className="text-[#29a8a8]">$mart</span></h2>
                    </Link>
                    <Link to="/" className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-[#29a8a8] transition-colors">
                        <ArrowLeft className="w-4 h-4" /> Voltar
                    </Link>
                </div>
            </header>

            <main className="mx-auto max-w-4xl px-6 py-12 md:py-16">
                <div className="mb-10">
                    <div className="inline-flex items-center gap-2 rounded-full bg-[#29a8a8]/10 px-4 py-1.5 mb-4">
                        <Cookie className="w-4 h-4 text-[#29a8a8]" />
                        <span className="text-sm font-semibold text-[#29a8a8]">Documento Legal</span>
                    </div>
                    <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">Política de Cookies</h1>
                    <p className="mt-3 text-slate-500">Última atualização: {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                </div>

                <div className="prose prose-slate max-w-none space-y-8">
                    <section className="bg-white rounded-2xl border border-slate-100 p-6 md:p-8 shadow-sm">
                        <div className="flex items-start gap-3 mb-4">
                            <Cookie className="w-5 h-5 text-[#29a8a8] mt-0.5 flex-shrink-0" />
                            <h2 className="text-xl font-bold text-slate-900">1. O que são Cookies?</h2>
                        </div>
                        <p className="text-slate-600 leading-relaxed">
                            Cookies são pequenos arquivos de texto armazenados no seu navegador quando você visita um site. Eles permitem que o site se lembre de suas ações e preferências (como login, idioma e outras configurações) por um determinado período de tempo.
                        </p>
                    </section>

                    <section className="bg-white rounded-2xl border border-slate-100 p-6 md:p-8 shadow-sm">
                        <div className="flex items-start gap-3 mb-4">
                            <Settings className="w-5 h-5 text-[#29a8a8] mt-0.5 flex-shrink-0" />
                            <h2 className="text-xl font-bold text-slate-900">2. Cookies que Utilizamos</h2>
                        </div>
                        <div className="space-y-4">
                            <div className="bg-slate-50 rounded-xl p-4">
                                <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide mb-2">Cookies Essenciais</h3>
                                <p className="text-slate-600 text-sm leading-relaxed">
                                    Necessários para o funcionamento do site. Incluem cookies de sessão e autenticação do Supabase Auth, que mantêm você logado no sistema.
                                </p>
                            </div>
                            <div className="bg-slate-50 rounded-xl p-4">
                                <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide mb-2">Cookies de Análise</h3>
                                <p className="text-slate-600 text-sm leading-relaxed">
                                    Utilizamos o Google Tag Manager e Google Analytics para entender como os usuários interagem com a plataforma. Esses cookies nos ajudam a melhorar a experiência de uso.
                                </p>
                            </div>
                            <div className="bg-slate-50 rounded-xl p-4">
                                <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide mb-2">Cookies de Preferências</h3>
                                <p className="text-slate-600 text-sm leading-relaxed">
                                    Armazenam suas preferências de uso, como configurações de visualização e filtros utilizados na plataforma.
                                </p>
                            </div>
                        </div>
                    </section>

                    <section className="bg-white rounded-2xl border border-slate-100 p-6 md:p-8 shadow-sm">
                        <div className="flex items-start gap-3 mb-4">
                            <BarChart3 className="w-5 h-5 text-[#29a8a8] mt-0.5 flex-shrink-0" />
                            <h2 className="text-xl font-bold text-slate-900">3. Finalidade dos Cookies</h2>
                        </div>
                        <ul className="space-y-2 text-slate-600 list-disc list-inside">
                            <li>Manter sua sessão ativa enquanto navega pelo sistema.</li>
                            <li>Lembrar suas preferências e configurações.</li>
                            <li>Coletar dados anônimos de uso para melhorias na plataforma.</li>
                            <li>Garantir a segurança e integridade do serviço.</li>
                        </ul>
                    </section>

                    <section className="bg-white rounded-2xl border border-slate-100 p-6 md:p-8 shadow-sm">
                        <div className="flex items-start gap-3 mb-4">
                            <Shield className="w-5 h-5 text-[#29a8a8] mt-0.5 flex-shrink-0" />
                            <h2 className="text-xl font-bold text-slate-900">4. Cookies de Terceiros</h2>
                        </div>
                        <p className="text-slate-600 leading-relaxed">
                            Nosso site pode utilizar cookies de terceiros, incluindo:
                        </p>
                        <ul className="mt-3 space-y-2 text-slate-600 list-disc list-inside">
                            <li><strong>Google Analytics / Google Tag Manager:</strong> para análise de tráfego e comportamento de uso.</li>
                            <li><strong>Supabase:</strong> para gerenciamento de autenticação e sessão.</li>
                            <li><strong>Mercado Pago:</strong> para processamento seguro de pagamentos via PIX.</li>
                        </ul>
                    </section>

                    <section className="bg-white rounded-2xl border border-slate-100 p-6 md:p-8 shadow-sm">
                        <div className="flex items-start gap-3 mb-4">
                            <ToggleRight className="w-5 h-5 text-[#29a8a8] mt-0.5 flex-shrink-0" />
                            <h2 className="text-xl font-bold text-slate-900">5. Como Gerenciar Cookies</h2>
                        </div>
                        <p className="text-slate-600 leading-relaxed">
                            Você pode controlar e/ou excluir cookies conforme desejar através das configurações do seu navegador. Note que desabilitar cookies essenciais pode impedir o funcionamento correto do Recebimento $mart, como manter-se logado na plataforma.
                        </p>
                    </section>

                    <section className="bg-white rounded-2xl border border-slate-100 p-6 md:p-8 shadow-sm">
                        <h2 className="text-xl font-bold text-slate-900 mb-4">6. Contato</h2>
                        <p className="text-slate-600 leading-relaxed">
                            Para dúvidas sobre esta Política de Cookies, entre em contato pelo e-mail{' '}
                            <a href="mailto:contato@recebimentosmart.com.br" className="text-[#29a8a8] font-semibold hover:underline">contato@recebimentosmart.com.br</a>.
                        </p>
                    </section>
                </div>
            </main>

            <footer className="border-t border-slate-200 bg-white px-6 py-8 text-center text-sm text-slate-400">
                <p>© {new Date().getFullYear()} Recebimento $mart. Todos os direitos reservados.</p>
            </footer>
        </div>
    );
};

export default CookiePolicyPage;
