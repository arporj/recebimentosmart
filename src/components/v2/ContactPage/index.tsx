import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, MapPin, MessageCircle } from 'lucide-react';

const ContactPage = () => {
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
                <div className="mb-10 text-center">
                    <div className="inline-flex items-center gap-2 rounded-full bg-[#29a8a8]/10 px-4 py-1.5 mb-4">
                        <MessageCircle className="w-4 h-4 text-[#29a8a8]" />
                        <span className="text-sm font-semibold text-[#29a8a8]">Fale Conosco</span>
                    </div>
                    <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">Entre em Contato</h1>
                    <p className="mt-3 text-slate-500 max-w-xl mx-auto">Estamos aqui para ajudar! Escolha o canal que preferir para falar com a nossa equipe.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* E-mail Card */}
                    <a
                        href="mailto:contato@recebimentosmart.com.br"
                        className="group bg-white rounded-2xl border border-slate-100 p-8 shadow-sm hover:shadow-md hover:border-[#29a8a8]/20 transition-all"
                    >
                        <div className="w-14 h-14 rounded-xl bg-[#29a8a8]/10 flex items-center justify-center mb-6 group-hover:bg-[#29a8a8]/20 transition-colors">
                            <Mail className="w-7 h-7 text-[#29a8a8]" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-900 mb-2">E-mail</h2>
                        <p className="text-slate-500 text-sm mb-4">Envie sua dúvida ou sugestão e respondemos em até 24 horas úteis.</p>
                        <span className="text-[#29a8a8] font-semibold text-sm group-hover:underline">contato@recebimentosmart.com.br</span>
                    </a>

                    {/* WhatsApp Card */}
                    <a
                        href="https://wa.me/5521967621494?text=Olá! Tenho uma dúvida sobre o Recebimento $mart."
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group bg-white rounded-2xl border border-slate-100 p-8 shadow-sm hover:shadow-md hover:border-green-200 transition-all"
                    >
                        <div className="w-14 h-14 rounded-xl bg-green-50 flex items-center justify-center mb-6 group-hover:bg-green-100 transition-colors">
                            <Phone className="w-7 h-7 text-green-600" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-900 mb-2">WhatsApp</h2>
                        <p className="text-slate-500 text-sm mb-4">Atendimento rápido pelo WhatsApp. Clique para iniciar uma conversa.</p>
                        <span className="text-green-600 font-semibold text-sm group-hover:underline">(21) 96762-1494</span>
                    </a>

                    {/* Horário Card */}
                    <div className="bg-white rounded-2xl border border-slate-100 p-8 shadow-sm md:col-span-2">
                        <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
                            <div className="w-14 h-14 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
                                <MapPin className="w-7 h-7 text-amber-600" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-slate-900 mb-2">Horário de Atendimento</h2>
                                <p className="text-slate-500 text-sm leading-relaxed">
                                    Segunda a Sexta: <strong className="text-slate-700">09h às 18h</strong> (horário de Brasília).<br />
                                    Mensagens fora do horário serão respondidas no próximo dia útil.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <footer className="border-t border-slate-200 bg-white px-6 py-8 text-center text-sm text-slate-400">
                <p>© {new Date().getFullYear()} Recebimento $mart. Todos os direitos reservados.</p>
            </footer>
        </div>
    );
};

export default ContactPage;
