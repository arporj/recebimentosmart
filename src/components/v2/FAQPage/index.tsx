import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, HelpCircle, ChevronDown, ChevronUp, FileText, Settings, UserCheck, Shield, HelpCircle as SupportIcon, MessageSquare } from 'lucide-react';

interface FAQItem {
    question: string;
    answer: string;
    category: 'geral' | 'funcionalidades' | 'planos' | 'seguranca';
}

const FAQ_ITEMS: FAQItem[] = [
    {
        category: 'geral',
        question: 'O que é o Recebimento $mart?',
        answer: 'O Recebimento $mart é uma plataforma web premium de gestão financeira e de clientes focada em simplificar o dia a dia de pequenos empreendedores, autônomos e pequenas empresas. Ele permite controlar fluxo de caixa, pagamentos de clientes, contas bancárias e relatórios gerenciais em uma interface moderna, rápida e intuitiva.'
    },
    {
        category: 'geral',
        question: 'Preciso instalar algum programa para usar?',
        answer: 'Não. O Recebimento $mart é 100% online (SaaS). Você pode acessá-lo de qualquer computador, tablet ou smartphone conectado à internet através do seu navegador web favorito, sem necessidade de baixar ou instalar nada.'
    },
    {
        category: 'funcionalidades',
        question: 'Como funciona o controle de clientes?',
        answer: 'O sistema permite que você cadastre seus clientes com nome, e-mail, telefone e observações. É possível definir campos personalizados de acordo com a necessidade do seu modelo de negócio e acompanhar todo o histórico de pagamentos e cobranças mensais ou recorrentes daquele cliente.'
    },
    {
        category: 'funcionalidades',
        question: 'Como funciona o cadastro de Contas Bancárias?',
        answer: 'No Recebimento $mart, você pode cadastrar suas contas bancárias reais (como Itaú, Nubank, Banco do Brasil, Bradesco, etc.). O sistema identifica automaticamente o banco pelo nome e atribui o logotipo oficial correspondente, facilitando a identificação visual rápida na listagem e na conciliação dos seus lançamentos financeiros.'
    },
    {
        category: 'funcionalidades',
        question: 'Como funciona o gerenciamento de cartões de crédito?',
        answer: 'Você pode cadastrar seus cartões de crédito na plataforma, definindo o limite total, o dia de fechamento da fatura e o dia de vencimento. Ao lançar uma despesa no cartão de crédito, o sistema calcula automaticamente em qual fatura ela se enquadra de acordo com a data de fechamento e debita do seu limite restante. Além disso, se o seu plano permitir, você será notificado por e-mail assim que a fatura do cartão fechar.'
    },
    {
        category: 'funcionalidades',
        question: 'Como funcionam os alertas por e-mail de contas e cartões?',
        answer: 'Dependendo do seu plano, você pode habilitar alertas por e-mail em suas Preferências. Para planos de envio diário, é possível ativar alertas de contas que vencem no dia e notificações na data exata de fechamento da fatura do seu cartão. Para planos semanais, você recebe um resumo consolidado das contas da semana juntamente com a fatura do cartão a vencer, tudo de forma automática no dia escolhido.'
    },
    {
        category: 'funcionalidades',
        question: 'O que são as Categorias e Tags?',
        answer: 'Categorias servem para organizar seus lançamentos no fluxo de caixa (ex: Alimentação, Aluguel, Serviços Prestados). As Tags servem para uma classificação secundária e cruzada (ex: Tag "Projeto X" ou "Cliente Especial"), permitindo que você filtre relatórios de formas extremamente detalhadas para entender para onde seu dinheiro está indo.'
    },
    {
        category: 'funcionalidades',
        question: 'Como funciona o pagamento de lançamentos recorrentes?',
        answer: 'Ao confirmar o pagamento de um lançamento recorrente ou parcelado, o sistema confirma apenas a parcela selecionada ("Somente este") para evitar a alteração acidental de parcelas futuras. O lançamento pago é então registrado na data exata em que você confirmou o pagamento (data do pagamento), enquanto as parcelas e lançamentos futuros são mantidos intactos em suas respectivas datas de vencimento originais. Caso você desconfirme um lançamento pago, ele voltará para o status pendente e retornará automaticamente para a sua data de vencimento original.'
    },
    {
        category: 'funcionalidades',
        question: 'Como funciona a ordenação dos lançamentos na tela principal?',
        answer: 'Para facilitar o controle financeiro, no dia de "Hoje", os lançamentos são agrupados e ordenados automaticamente de forma inteligente: primeiro são exibidos os lançamentos pagos, seguidos pelos vencidos (em atraso) e, por último, os pendentes. Além disso, os lançamentos que foram pagos no mesmo dia são exibidos em ordem cronológica de pagamento (do primeiro ao último pago).'
    },
    {
        category: 'planos',
        question: 'Como funciona o plano gratuito do sistema?',
        answer: 'Todos os novos usuários cadastrados recebem automaticamente o acesso ao nosso plano gratuito de forma vitalícia para gerenciar suas contas. O plano gratuito possui alguns limites de uso, como quantidade máxima de clientes cadastrados por mês. Você pode usar pelo tempo que quiser sem a necessidade de cadastrar cartão de crédito ou dados de pagamento!'
    },
    {
        category: 'planos',
        question: 'Quais são as formas de pagamento aceitas para a assinatura?',
        answer: 'Trabalhamos exclusivamente com pagamento via PIX. Você acessa a tela de assinatura no seu painel, faz a leitura do QR Code ou copia a chave copia e cola do PIX para realizar a transferência. O sistema identifica o pagamento e atualiza a sua assinatura de forma totalmente automática, liberando os recursos imediatamente!'
    },
    {
        category: 'planos',
        question: 'O que acontece se eu não pagar após o vencimento?',
        answer: 'Sua conta entrará em modo suspenso. Você continuará com acesso à tela de assinatura para regularizar o pagamento, mas não conseguirá acessar seus lançamentos, clientes e relatórios. Seus dados cadastrados ficam protegidos e guardados por até 30 dias após o vencimento antes de serem excluídos definitivamente.'
    },
    {
        category: 'seguranca',
        question: 'Meus dados e os dados dos meus clientes estão seguros?',
        answer: 'Sim, a segurança é nossa prioridade absoluta. O Recebimento $mart utiliza infraestrutura do Supabase, hospedado em servidores de padrão internacional (AWS) com conformidade SOC 2. Todos os dados são transmitidos via conexão segura SSL/TLS (criptografia HTTPS) e as senhas de acesso são protegidas por algoritmos de hash criptográfico unidirecionais.'
    },
    {
        category: 'seguranca',
        question: 'Quem tem acesso às minhas informações financeiras?',
        answer: 'Apenas você e os usuários que você explicitamente autorizar através do recurso de compartilhamento de conta. O suporte técnico do Recebimento $mart só acessa seus dados em casos excepcionais de resolução de chamados sob sua solicitação formal, respeitando estritamente a Lei Geral de Proteção de Dados (LGPD).'
    },
    {
        category: 'funcionalidades',
        question: 'Como funciona a aceitação de lançamentos compartilhados?',
        answer: 'Ao aceitar um convite de lançamentos compartilhados, você tem total controle sobre como esses registros aparecem na sua conta. Você pode escolher associar os lançamentos a um cliente existente, criar automaticamente um novo cliente local (com o nome de quem está compartilhando para facilitar sua organização) ou aceitar os lançamentos sem vinculá-los a nenhum cliente específico, de forma totalmente flexível.'
    }
];

const FAQPage = () => {
    const [openIndex, setOpenIndex] = useState<number | null>(0);
    const [activeTab, setActiveTab] = useState<'todos' | 'geral' | 'funcionalidades' | 'planos' | 'seguranca'>('todos');

    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    const toggleAccordion = (index: number) => {
        setOpenIndex(openIndex === index ? null : index);
    };

    const filteredItems = activeTab === 'todos'
        ? FAQ_ITEMS
        : FAQ_ITEMS.filter(item => item.category === activeTab);

    return (
        <div className="min-h-screen bg-slate-50 font-['Inter',sans-serif]">
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
                {/* Intro */}
                <div className="mb-12 text-center">
                    <div className="inline-flex items-center gap-2 rounded-full bg-[#29a8a8]/10 px-4 py-1.5 mb-4">
                        <HelpCircle className="w-4 h-4 text-[#29a8a8]" />
                        <span className="text-sm font-semibold text-[#29a8a8]">Central de FAQ</span>
                    </div>
                    <h1 className="text-3xl md:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">Perguntas Frequentes</h1>
                    <p className="mt-3 text-slate-500 max-w-xl mx-auto text-lg">Tudo o que você precisa saber sobre as funcionalidades, planos, segurança e o uso do Recebimento $mart.</p>
                </div>

                {/* Tabs */}
                <div className="flex flex-wrap justify-center gap-2 mb-8 bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm">
                    {(['todos', 'geral', 'funcionalidades', 'planos', 'seguranca'] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => {
                                setActiveTab(tab);
                                setOpenIndex(0); // Abre o primeiro item da nova categoria
                            }}
                            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all capitalize ${
                                activeTab === tab
                                    ? 'bg-[#29a8a8] text-white shadow-md'
                                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                            }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {/* FAQ List */}
                <div className="space-y-4">
                    {filteredItems.length > 0 ? (
                        filteredItems.map((item, index) => {
                            const globalIndex = FAQ_ITEMS.indexOf(item);
                            const isOpen = openIndex === globalIndex;

                            return (
                                <div
                                    key={globalIndex}
                                    className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden transition-all hover:border-[#29a8a8]/20"
                                >
                                    <button
                                        onClick={() => toggleAccordion(globalIndex)}
                                        className="w-full text-left px-6 py-5 flex items-center justify-between gap-4 font-bold text-slate-800 hover:text-[#29a8a8] transition-colors"
                                    >
                                        <span className="text-base sm:text-lg leading-relaxed">{item.question}</span>
                                        {isOpen ? (
                                            <ChevronUp className="w-5 h-5 text-[#29a8a8] flex-shrink-0" />
                                        ) : (
                                            <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />
                                        )}
                                    </button>
                                    
                                    {isOpen && (
                                        <div className="px-6 pb-6 pt-1 text-slate-600 border-t border-slate-50 leading-relaxed text-sm sm:text-base animate-in fade-in slide-in-from-top-2 duration-200">
                                            {item.answer}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    ) : (
                        <p className="text-center text-slate-400 py-8">Nenhuma dúvida cadastrada nesta categoria.</p>
                    )}
                </div>

                {/* Suporte Banner */}
                <div className="mt-16 bg-slate-900 rounded-[2rem] p-8 sm:p-12 text-center relative overflow-hidden text-white shadow-xl">
                    <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-48 h-48 bg-[#29a8a8]/20 blur-[80px] rounded-full" />
                    <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/2 w-48 h-48 bg-[#29a8a8]/20 blur-[80px] rounded-full" />
                    <div className="relative z-10 flex flex-col items-center gap-6">
                        <div className="w-14 h-14 rounded-2xl bg-[#29a8a8]/20 flex items-center justify-center">
                            <SupportIcon className="w-8 h-8 text-[#29a8a8]" />
                        </div>
                        <h2 className="text-2xl font-black md:text-3xl">Ainda ficou com alguma dúvida?</h2>
                        <p className="text-slate-400 max-w-md mx-auto text-sm sm:text-base">
                            Nossa equipe de suporte está de prontidão para ajudar você no que for necessário. Fale conosco pelo WhatsApp ou por e-mail!
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 w-full justify-center mt-2">
                            <a
                                href="https://wa.me/5521967621494?text=Olá, vi o FAQ do Recebimento Smart e tenho uma dúvida."
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center gap-2 py-3.5 px-8 rounded-xl bg-[#29a8a8] text-white font-bold hover:scale-105 active:scale-95 transition-all shadow-lg shadow-[#29a8a8]/20 text-sm"
                            >
                                <MessageSquare className="w-4 h-4" />
                                Chamar no WhatsApp
                            </a>
                            <a
                                href="mailto:contato@recebimentosmart.com.br"
                                className="inline-flex items-center justify-center gap-2 py-3.5 px-8 rounded-xl border border-slate-700 text-slate-300 font-bold hover:bg-slate-800 hover:text-white transition-colors text-sm"
                            >
                                Enviar E-mail
                            </a>
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

export default FAQPage;
