import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuth } from '../../../contexts/AuthContext';
import { AdBanner } from '../AdBanner';
import { supabase } from '../../../lib/supabase';
import {
    Users, CalendarDays, BarChart3,
    MessageCircle, FormInput, CreditCard,
    Shield, Settings, LogOut, Eye, Menu, X,
    Wallet, FolderOpen, Tag, ChevronDown, ChevronRight,
    UserCheck, Share2, Mail
} from 'lucide-react';

interface MainLayoutV2Props {
    children: React.ReactNode;
}

interface SidebarItem {
    label: string;
    icon: any;
    href?: string;
    subItems?: SidebarItem[];
}

interface SidebarSection {
    title: string;
    items: SidebarItem[];
}

const sidebarSections: SidebarSection[] = [
    {
        title: 'Geral',
        items: [
            { label: 'Dashboard', icon: BarChart3, href: '/v2/dashboard' },
            { label: 'Resumo por Clientes', icon: UserCheck, href: '/v2/recorrencia' },
            { label: 'Lançamentos Compartilhados', icon: Share2, href: '/v2/compartilhado' },
        ],
    },
    {
        title: 'Gestão Financeira',
        items: [
            { label: 'Lançamentos', icon: CreditCard, href: '/v2/financeiro/lancamentos' },
            { label: 'Cartão de Crédito', icon: CreditCard, href: '/v2/financeiro/cartoes' },
            { label: 'Relatórios', icon: BarChart3, href: '/v2/relatorios' },
            {
                label: 'Cadastros',
                icon: FormInput,
                subItems: [
                    { label: 'Clientes', icon: Users, href: '/v2/financeiro/clientes' },
                    { label: 'Contas', icon: Wallet, href: '/v2/financeiro/contas' },
                    { label: 'Categorias', icon: FolderOpen, href: '/v2/financeiro/categorias' },
                    { label: 'Tags', icon: Tag, href: '/v2/financeiro/tags' },
                ]
            },
        ],
    },
    {
        title: 'Configurações',
        items: [
            { label: 'Campos Personalizados', icon: FormInput, href: '/v2/campos-personalizados' },
            { label: 'Configurações da Conta', icon: Settings, href: '/v2/perfil' },
            { label: 'Sua Assinatura', icon: CreditCard, href: '/payment' },
            { label: 'Enviar Feedback', icon: MessageCircle, href: '/v2/feedbacks' },
        ],
    },
];

const adminSection: SidebarSection = {
    title: 'Admin',
    items: [
        { label: 'Gerenciar Usuários', icon: Shield, href: '/v2/admin/users' },
        { label: 'Testes do Sistema', icon: Shield, href: '/v2/admin/tests' },
        { label: 'Disparos de E-mail', icon: Mail, href: '/v2/admin/broadcast' },
        { label: 'Gestão de Feedbacks', icon: MessageCircle, href: '/v2/admin/feedbacks' },
        { label: 'Configurações Globais', icon: Settings, href: '/v2/admin/configuracoes' },
    ],
};

export function MainLayoutV2({ children }: MainLayoutV2Props) {
    const { user, isAdmin, signOut, originalUser, stopImpersonating } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    // Se estivermos impersonificando, a barra lateral ainda mostrará quem nós realmente somos
    const displayUser = originalUser || user;
    const userName = displayUser?.user_metadata?.name || displayUser?.email || 'Usuário';
    const initials = userName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [expandedItems, setExpandedItems] = useState<string[]>(['Cadastros']); // Cadastro aberto por padrão
    const [pendingCount, setPendingCount] = useState(0);
    const [displayedCount, setDisplayedCount] = useState(0);
    const [animationKey, setAnimationKey] = useState(0);

    // Função para sintetizar um som de notificação sutil e harmônico via Web Audio API
    const playNotificationChime = () => {
        try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContextClass) return;
            
            const ctx = new AudioContextClass();
            
            // Acorde consonante sutil: Sol5 (783.99 Hz) e Dó6 (1046.50 Hz)
            const frequencies = [783.99, 1046.50];
            const duration = 0.35; // 350ms
            
            frequencies.forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const gainNode = ctx.createGain();
                
                osc.type = 'sine';
                osc.frequency.value = freq;
                
                const now = ctx.currentTime;
                // Envelope suave e rápido
                gainNode.gain.setValueAtTime(0, now);
                gainNode.gain.linearRampToValueAtTime(idx === 0 ? 0.12 : 0.08, now + 0.015);
                gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);
                
                osc.connect(gainNode);
                gainNode.connect(ctx.destination);
                
                osc.start(now);
                osc.stop(now + duration);
            });
        } catch (e) {
            console.warn('Web Audio API não inicializada ou bloqueada pelo navegador:', e);
        }
    };

    // Função para contar notificações pendentes
    const fetchPendingCount = async () => {
        if (!user) return;
        try {
            // 1. Contar compartilhamentos de clientes pendentes (onde o e-mail do cliente é igual ao e-mail do usuário)
            const { count: clientSharesCount } = await supabase
                .from('client_shares')
                .select('*', { count: 'exact', head: true })
                .eq('receiver_email', user.email?.toLowerCase())
                .eq('status', 'pending');

            // 2. Contar lançamentos compartilhados pendentes de aceitação (onde user_id é o logado, shared_by_user_id não é nulo e status é pending)
            const { count: newTransCount } = await supabase
                .from('financial_transactions')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .not('shared_by_user_id', 'is', null)
                .eq('status', 'pending');

            // 3. Contar atualizações de transações pendentes (onde receiver_id é o logado e status é pending)
            const { count: updatesCount } = await supabase
                .from('shared_transaction_updates')
                .select('*', { count: 'exact', head: true })
                .eq('receiver_id', user.id)
                .eq('status', 'pending');

            const total = (clientSharesCount || 0) + (newTransCount || 0) + (updatesCount || 0);
            setPendingCount(total);
        } catch (err) {
            console.error('Erro ao buscar notificações pendentes:', err);
        }
    };

    // Efeito para gerenciar a animação premium do badge ao mudar o contador
    useEffect(() => {
        if (pendingCount !== displayedCount) {
            // Tocar som de chime de notificação se o número de pendentes aumentou
            if (pendingCount > displayedCount) {
                playNotificationChime();
            }

            if (displayedCount === 0) {
                // Se o badge estava oculto, exibe imediatamente com a animação de explosão
                setDisplayedCount(pendingCount);
                setAnimationKey(prev => prev + 1);
            } else if (pendingCount === 0) {
                // Se zerou, dispara animação para encolher (scale-0) e depois oculta
                setAnimationKey(prev => prev + 1);
                const timer = setTimeout(() => {
                    setDisplayedCount(0);
                }, 500);
                return () => clearTimeout(timer);
            } else {
                // Se alterou de um valor maior que zero para outro maior que zero:
                // Dispara a animação (fazendo encolher)
                setAnimationKey(prev => prev + 1);
                // No momento em que está no scale-0 (100ms), troca o número silenciosamente
                const timer = setTimeout(() => {
                    setDisplayedCount(pendingCount);
                }, 100);
                return () => clearTimeout(timer);
            }
        }
    }, [pendingCount, displayedCount]);

    // Subscrição em tempo real para as tabelas relevantes
    useEffect(() => {
        if (!user) return;

        fetchPendingCount();

        const channel = supabase
            .channel('shared_notifications')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'client_shares' },
                () => fetchPendingCount()
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'financial_transactions' },
                () => fetchPendingCount()
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'shared_transaction_updates' },
                () => fetchPendingCount()
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user]);

    // Fechar a sidebar sempre que a rota mudar
    useEffect(() => {
        setIsSidebarOpen(false);
    }, [location.pathname]);

    const handleSignOut = async () => {
        await signOut();
    };

    const toggleExpand = (label: string) => {
        setExpandedItems(prev =>
            prev.includes(label)
                ? prev.filter(item => item !== label)
                : [...prev, label]
        );
    };

    const renderItem = (item: SidebarItem, level = 1) => {
        const hasSubItems = item.subItems && item.subItems.length > 0;
        const isExpanded = expandedItems.includes(item.label);
        const isActive = item.href ? location.pathname === item.href : false;
        const isChildActive = item.subItems?.some(sub => sub.href === location.pathname);

        if (hasSubItems) {
            return (
                <div key={item.label} className="space-y-0.5">
                    <button
                        onClick={() => toggleExpand(item.label)}
                        className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-colors ${
                            isChildActive 
                                ? 'text-white bg-slate-800/50' 
                                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                        }`}
                    >
                        <item.icon size={16} />
                        <span className="flex-1 text-left">{item.label}</span>
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    {isExpanded && (
                        <div className="ml-3 pl-3 border-l border-slate-800 space-y-0.5">
                            {item.subItems!.map(sub => renderItem(sub, level + 1))}
                        </div>
                    )}
                </div>
            );
        }

        const hasBadge = item.href === '/v2/compartilhado' && displayedCount > 0;

        return (
            <Link
                key={item.href + item.label}
                to={item.href!}
                className={`flex items-center gap-3 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${isActive
                    ? 'bg-[#14b8a6]/10 text-[#14b8a6]'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                    }`}
            >
                <item.icon size={level === 1 ? 16 : 14} />
                <span className={level === 1 ? 'flex-1' : 'text-[11px] flex-1 font-medium'}>{item.label}</span>
                {hasBadge && (
                    <span
                        key={animationKey}
                        className="animate-pop-badge bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center justify-center min-w-[16px] h-[16px]"
                    >
                        {displayedCount}
                    </span>
                )}
            </Link>
        );
    };

    return (
        <div className="min-h-screen flex bg-slate-50">
            <Toaster
                position="top-right"
                toastOptions={{
                    duration: 4000,
                    style: { zIndex: 150 },
                    success: { style: { background: '#10B981', color: 'white' } },
                    error: { style: { background: '#EF4444', color: 'white' } },
                }}
            />

            {/* Overlay para fechar a sidebar ao clicar fora */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 transition-opacity"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* ─── Sidebar ─── */}
            <aside className={`bg-[#0f172a] text-slate-300 flex flex-col fixed inset-y-0 left-0 z-50 w-64 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 ease-in-out shadow-2xl`}>
                {/* Logo */}
                <div className="p-6 flex items-center gap-3">
                    <div className="bg-white p-1.5 rounded-lg">
                        <img src="/images/logo.svg" alt="Recebimento $mart" className="h-6 w-6" />
                    </div>
                    <span className="text-white font-bold text-xl tracking-tight">
                        Recebimento <span className="text-[#14b8a6]">$mart</span>
                    </span>
                    <button
                        onClick={() => setIsSidebarOpen(false)}
                        className="ml-auto p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-4 py-2 space-y-4 overflow-y-auto custom-scrollbar">
                    {sidebarSections.map((section) => (
                        <div key={section.title}>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 px-2">
                                {section.title}
                            </p>
                            <div className="space-y-0.5">
                                {section.items.map(item => renderItem(item))}
                            </div>
                        </div>
                    ))}

                    {/* Admin section */}
                    {isAdmin && (
                        <div>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 px-2">
                                {adminSection.title}
                            </p>
                            <div className="space-y-0.5">
                                {adminSection.items.map(item => renderItem(item))}
                            </div>
                        </div>
                    )}
                </nav>

                {/* Espaço publicitário contextual para planos free */}
                <div className="px-4 py-2 mt-auto mb-2 flex-shrink-0">
                    <AdBanner format="sidebar" slotId="4023170366" />
                </div>

                {/* User section */}
                <div className="p-4 border-t border-slate-800 flex-shrink-0">
                    <div
                        onClick={handleSignOut}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800 cursor-pointer transition-colors"
                    >
                        <div className="w-8 h-8 rounded-full bg-[#14b8a6] flex items-center justify-center text-white font-bold text-xs">
                            {initials}
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <p className="text-sm font-medium text-white truncate">{userName}</p>
                            <p className="text-xs text-slate-500 truncate">Sair do sistema</p>
                        </div>
                        <LogOut className="text-slate-500" size={16} />
                    </div>
                </div>
            </aside>

            {/* ─── Main Content ─── */}
            <div className="flex-1 flex flex-col min-h-screen ml-0 w-full transition-all duration-300">

                {/* Header Superior (Sempre visível para permitir abrir o menu lateral colapsado) */}
                <header className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-30 flex items-center gap-3 shadow-sm justify-start">
                    {/* Botão de menu hambúrguer para expandir a sidebar colapsada em qualquer resolução, posicionado do lado esquerdo, antes do logo */}
                    <button
                        onClick={() => setIsSidebarOpen(true)}
                        className="p-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors focus:ring-2 focus:ring-[#14b8a6]/20 outline-none flex-shrink-0 relative"
                    >
                        <Menu size={24} />
                        {displayedCount > 0 && (
                            <span 
                                key={animationKey}
                                className="absolute -top-1.5 -right-1.5 animate-pop-badge bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center justify-center min-w-[16px] h-[16px] shadow-sm"
                            >
                                {displayedCount}
                            </span>
                        )}
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="bg-[#0f172a] p-1.5 rounded-md">
                            <img src="/images/logo.svg" alt="Logo" className="w-5 h-5" />
                        </div>
                        <span className="font-bold text-slate-800 text-lg tracking-tight">
                            Recebimento <span className="text-[#14b8a6]">$mart</span>
                        </span>
                    </div>
                </header>

                <main className="flex-1 flex flex-col">
                    {originalUser && (
                        <div className="bg-amber-500 text-white px-4 md:px-6 py-2.5 md:py-3 flex items-center justify-between gap-3 shadow-sm z-20 sticky top-[57px] md:top-[64px]">
                            <div className="flex items-center gap-2 md:gap-3 text-xs md:text-sm font-medium">
                                <Eye size={18} className="flex-shrink-0" />
                                <span>
                                    Você está visualizando como <strong>{user?.user_metadata?.name || user?.email || 'Usuário'}</strong> ({user?.email}).
                                </span>
                            </div>
                            <button
                                onClick={stopImpersonating}
                                className="bg-amber-700 hover:bg-amber-600 text-white px-3 py-1.5 md:px-4 rounded-lg text-xs md:text-sm font-bold transition-colors shadow-sm whitespace-nowrap flex-shrink-0"
                            >
                                Sair
                            </button>
                        </div>
                    )}
                    <div className="p-4 md:p-8 flex-1 w-full max-w-full">
                        <AdBanner format="horizontal" slotId="5916047981" className="mb-6" />
                        {children}
                    </div>
                </main>
            </div>

            <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
      `}</style>
        </div>
    );
}

export default MainLayoutV2;
