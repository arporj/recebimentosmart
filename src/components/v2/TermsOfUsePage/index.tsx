import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileText, UserCheck, Ban, AlertTriangle, Scale, CreditCard, RefreshCw } from 'lucide-react';

const TermsOfUsePage = () => {
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
                        <FileText className="w-4 h-4 text-[#29a8a8]" />
                        <span className="text-sm font-semibold text-[#29a8a8]">Documento Legal</span>
                    </div>
                    <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">Termos de Uso</h1>
                    <p className="mt-3 text-slate-500">Última atualização: {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                </div>

                <div className="prose prose-slate max-w-none space-y-8">
                    <section className="bg-white rounded-2xl border border-slate-100 p-6 md:p-8 shadow-sm">
                        <div className="flex items-start gap-3 mb-4">
                            <UserCheck className="w-5 h-5 text-[#29a8a8] mt-0.5 flex-shrink-0" />
                            <h2 className="text-xl font-bold text-slate-900">1. Aceitação dos Termos</h2>
                        </div>
                        <p className="text-slate-600 leading-relaxed">
                            Ao acessar ou utilizar o Recebimento $mart, você concorda em cumprir estes Termos de Uso. Caso não concorde, não utilize a plataforma. O uso continuado do serviço após alterações constitui aceitação dos novos termos.
                        </p>
                    </section>

                    <section className="bg-white rounded-2xl border border-slate-100 p-6 md:p-8 shadow-sm">
                        <div className="flex items-start gap-3 mb-4">
                            <FileText className="w-5 h-5 text-[#29a8a8] mt-0.5 flex-shrink-0" />
                            <h2 className="text-xl font-bold text-slate-900">2. Descrição do Serviço</h2>
                        </div>
                        <p className="text-slate-600 leading-relaxed">
                            O Recebimento $mart é uma plataforma de gestão financeira voltada para pequenos empreendedores. O sistema oferece:
                        </p>
                        <ul className="mt-3 space-y-2 text-slate-600 list-disc list-inside">
                            <li>Cadastro e gestão de clientes.</li>
                            <li>Controle de cobranças e recebimentos.</li>
                            <li>Geração de relatórios financeiros.</li>
                            <li>Integração com meios de pagamento (PIX via Mercado Pago).</li>
                            <li>Campos personalizados para adequar o sistema ao seu negócio.</li>
                        </ul>
                    </section>

                    <section className="bg-white rounded-2xl border border-slate-100 p-6 md:p-8 shadow-sm">
                        <div className="flex items-start gap-3 mb-4">
                            <CreditCard className="w-5 h-5 text-[#29a8a8] mt-0.5 flex-shrink-0" />
                            <h2 className="text-xl font-bold text-slate-900">3. Conta e Assinatura</h2>
                        </div>
                        <p className="text-slate-600 leading-relaxed">
                            Para utilizar o serviço, é necessário criar uma conta com informações válidas. Você é responsável pela segurança de sua senha e por todas as atividades realizadas com sua conta.
                        </p>
                        <p className="text-slate-600 leading-relaxed mt-3">
                            O Recebimento $mart oferece um período de teste gratuito de 7 dias. Após esse período, é necessário escolher um plano de assinatura para continuar utilizando o serviço. Planos e preços estão disponíveis na página de planos.
                        </p>
                    </section>

                    <section className="bg-white rounded-2xl border border-slate-100 p-6 md:p-8 shadow-sm">
                        <div className="flex items-start gap-3 mb-4">
                            <Ban className="w-5 h-5 text-[#29a8a8] mt-0.5 flex-shrink-0" />
                            <h2 className="text-xl font-bold text-slate-900">4. Uso Aceitável</h2>
                        </div>
                        <p className="text-slate-600 leading-relaxed">Ao utilizar o Recebimento $mart, você concorda em não:</p>
                        <ul className="mt-3 space-y-2 text-slate-600 list-disc list-inside">
                            <li>Utilizar o serviço para fins ilegais ou não autorizados.</li>
                            <li>Tentar acessar dados de outros usuários sem autorização.</li>
                            <li>Interferir ou interromper o funcionamento da plataforma.</li>
                            <li>Reproduzir, duplicar ou revender qualquer parte do serviço.</li>
                            <li>Utilizar automações não autorizadas para acessar o sistema.</li>
                        </ul>
                    </section>

                    <section className="bg-white rounded-2xl border border-slate-100 p-6 md:p-8 shadow-sm">
                        <div className="flex items-start gap-3 mb-4">
                            <AlertTriangle className="w-5 h-5 text-[#29a8a8] mt-0.5 flex-shrink-0" />
                            <h2 className="text-xl font-bold text-slate-900">5. Limitação de Responsabilidade</h2>
                        </div>
                        <p className="text-slate-600 leading-relaxed">
                            O Recebimento $mart é fornecido "como está". Não garantimos que o serviço será ininterrupto ou livre de erros. Não nos responsabilizamos por perdas financeiras decorrentes de falhas no sistema, interrupções de serviço ou uso inadequado da plataforma.
                        </p>
                    </section>

                    <section className="bg-white rounded-2xl border border-slate-100 p-6 md:p-8 shadow-sm">
                        <div className="flex items-start gap-3 mb-4">
                            <RefreshCw className="w-5 h-5 text-[#29a8a8] mt-0.5 flex-shrink-0" />
                            <h2 className="text-xl font-bold text-slate-900">6. Cancelamento</h2>
                        </div>
                        <p className="text-slate-600 leading-relaxed">
                            Você pode cancelar sua conta a qualquer momento. Ao cancelar, seus dados serão retidos por 30 dias para possível recuperação e, após esse período, serão permanentemente excluídos conforme nossa Política de Privacidade.
                        </p>
                    </section>

                    <section className="bg-white rounded-2xl border border-slate-100 p-6 md:p-8 shadow-sm">
                        <div className="flex items-start gap-3 mb-4">
                            <Scale className="w-5 h-5 text-[#29a8a8] mt-0.5 flex-shrink-0" />
                            <h2 className="text-xl font-bold text-slate-900">7. Legislação Aplicável</h2>
                        </div>
                        <p className="text-slate-600 leading-relaxed">
                            Estes Termos de Uso são regidos pelas leis da República Federativa do Brasil. Qualquer litígio será submetido ao foro da comarca do Rio de Janeiro/RJ.
                        </p>
                    </section>

                    <section className="bg-white rounded-2xl border border-slate-100 p-6 md:p-8 shadow-sm">
                        <h2 className="text-xl font-bold text-slate-900 mb-4">8. Contato</h2>
                        <p className="text-slate-600 leading-relaxed">
                            Para dúvidas sobre estes Termos de Uso, entre em contato pelo e-mail{' '}
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

export default TermsOfUsePage;
