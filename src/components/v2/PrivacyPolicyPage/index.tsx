import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, Eye, Database, Lock, UserCheck, Bell, Trash2 } from 'lucide-react';

const PrivacyPolicyPage = () => {
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
                        <Shield className="w-4 h-4 text-[#29a8a8]" />
                        <span className="text-sm font-semibold text-[#29a8a8]">Documento Legal</span>
                    </div>
                    <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">Política de Privacidade</h1>
                    <p className="mt-3 text-slate-500">Última atualização: {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                </div>

                <div className="prose prose-slate max-w-none space-y-8">
                    <section className="bg-white rounded-2xl border border-slate-100 p-6 md:p-8 shadow-sm">
                        <div className="flex items-start gap-3 mb-4">
                            <Eye className="w-5 h-5 text-[#29a8a8] mt-0.5 flex-shrink-0" />
                            <h2 className="text-xl font-bold text-slate-900">1. Informações que Coletamos</h2>
                        </div>
                        <p className="text-slate-600 leading-relaxed">Ao utilizar o Recebimento $mart, coletamos as seguintes informações:</p>
                        <ul className="mt-3 space-y-2 text-slate-600 list-disc list-inside">
                            <li><strong>Dados de cadastro:</strong> nome, e-mail e senha (criptografada).</li>
                            <li><strong>Dados de clientes:</strong> informações de clientes que você cadastra para gerenciar seus recebimentos.</li>
                            <li><strong>Dados de uso:</strong> informações sobre como você interage com a plataforma para melhorias.</li>
                            <li><strong>Dados de pagamento:</strong> informações necessárias para processamento via PIX/Mercado Pago.</li>
                        </ul>
                    </section>

                    <section className="bg-white rounded-2xl border border-slate-100 p-6 md:p-8 shadow-sm">
                        <div className="flex items-start gap-3 mb-4">
                            <Database className="w-5 h-5 text-[#29a8a8] mt-0.5 flex-shrink-0" />
                            <h2 className="text-xl font-bold text-slate-900">2. Como Utilizamos seus Dados</h2>
                        </div>
                        <p className="text-slate-600 leading-relaxed">Utilizamos seus dados pessoais para:</p>
                        <ul className="mt-3 space-y-2 text-slate-600 list-disc list-inside">
                            <li>Fornecer, manter e melhorar nossos serviços.</li>
                            <li>Processar transações financeiras e cobranças automatizadas.</li>
                            <li>Enviar comunicações importantes sobre sua conta e atualizações do serviço.</li>
                            <li>Garantir a segurança e prevenir fraudes.</li>
                        </ul>
                    </section>

                    <section className="bg-white rounded-2xl border border-slate-100 p-6 md:p-8 shadow-sm">
                        <div className="flex items-start gap-3 mb-4">
                            <Lock className="w-5 h-5 text-[#29a8a8] mt-0.5 flex-shrink-0" />
                            <h2 className="text-xl font-bold text-slate-900">3. Proteção dos Dados</h2>
                        </div>
                        <p className="text-slate-600 leading-relaxed">
                            Implementamos medidas de segurança técnicas e organizacionais para proteger seus dados pessoais contra acesso não autorizado, alteração, divulgação ou destruição. Utilizamos criptografia SSL/TLS para transmissão de dados e armazenamos senhas com hash seguro.
                        </p>
                        <p className="text-slate-600 leading-relaxed mt-3">
                            Nossos dados são hospedados no Supabase, que segue padrões internacionais de segurança da informação, incluindo conformidade com SOC 2.
                        </p>
                    </section>

                    <section className="bg-white rounded-2xl border border-slate-100 p-6 md:p-8 shadow-sm">
                        <div className="flex items-start gap-3 mb-4">
                            <UserCheck className="w-5 h-5 text-[#29a8a8] mt-0.5 flex-shrink-0" />
                            <h2 className="text-xl font-bold text-slate-900">4. Seus Direitos (LGPD)</h2>
                        </div>
                        <p className="text-slate-600 leading-relaxed">De acordo com a Lei Geral de Proteção de Dados (LGPD), você tem o direito de:</p>
                        <ul className="mt-3 space-y-2 text-slate-600 list-disc list-inside">
                            <li>Acessar seus dados pessoais a qualquer momento.</li>
                            <li>Solicitar a correção de dados incorretos ou desatualizados.</li>
                            <li>Solicitar a exclusão de seus dados pessoais.</li>
                            <li>Revogar o consentimento para o tratamento de dados.</li>
                            <li>Solicitar portabilidade dos dados para outro serviço.</li>
                        </ul>
                    </section>

                    <section className="bg-white rounded-2xl border border-slate-100 p-6 md:p-8 shadow-sm">
                        <div className="flex items-start gap-3 mb-4">
                            <Bell className="w-5 h-5 text-[#29a8a8] mt-0.5 flex-shrink-0" />
                            <h2 className="text-xl font-bold text-slate-900">5. Compartilhamento de Dados</h2>
                        </div>
                        <p className="text-slate-600 leading-relaxed">
                            Não vendemos, comercializamos ou transferimos seus dados pessoais para terceiros, exceto quando necessário para:
                        </p>
                        <ul className="mt-3 space-y-2 text-slate-600 list-disc list-inside">
                            <li>Processamento de pagamentos (Mercado Pago).</li>
                            <li>Cumprimento de obrigações legais.</li>
                            <li>Proteção dos nossos direitos e segurança.</li>
                        </ul>
                    </section>

                    <section className="bg-white rounded-2xl border border-slate-100 p-6 md:p-8 shadow-sm">
                        <div className="flex items-start gap-3 mb-4">
                            <Trash2 className="w-5 h-5 text-[#29a8a8] mt-0.5 flex-shrink-0" />
                            <h2 className="text-xl font-bold text-slate-900">6. Retenção e Exclusão</h2>
                        </div>
                        <p className="text-slate-600 leading-relaxed">
                            Retemos seus dados pessoais apenas pelo tempo necessário para cumprir as finalidades descritas nesta política. Ao encerrar sua conta, seus dados serão excluídos em até 30 dias, salvo obrigação legal de retenção.
                        </p>
                    </section>

                    <section className="bg-white rounded-2xl border border-slate-100 p-6 md:p-8 shadow-sm">
                        <h2 className="text-xl font-bold text-slate-900 mb-4">7. Contato</h2>
                        <p className="text-slate-600 leading-relaxed">
                            Para exercer seus direitos ou esclarecer dúvidas sobre esta política, entre em contato pelo e-mail{' '}
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

export default PrivacyPolicyPage;
