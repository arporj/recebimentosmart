import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuth } from '../../../contexts/AuthContext';
import { AdBanner } from '../AdBanner';
import { supabase } from '../../../lib/supabase';
import { VoiceFloatingButton } from '../VoiceFloatingButton';
import {
    Users, CalendarDays, BarChart3,
    MessageCircle, FormInput, CreditCard,
    Shield, Settings, LogOut, Eye, Menu, X,
    Wallet, FolderOpen, Tag, ChevronDown, ChevronRight,
    UserCheck, Share2, Mail, Bell, RefreshCw
} from 'lucide-react';
import { ChangelogDrawer } from '../ChangelogDrawer';

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
            { label: 'Novidades', icon: Bell },
        ],
    },
];

const adminSection: SidebarSection = {
    title: 'Admin',
    items: [
        { label: 'Gerenciar Usuários', icon: Shield, href: '/v2/admin/users' },
        { label: 'Testes do Sistema', icon: Shield, href: '/v2/admin/tests' },
        { label: 'Disparos de E-mail', icon: Mail, href: '/v2/admin/broadcast' },
        { label: 'Gestão de Changelogs', icon: RefreshCw, href: '/v2/admin/changelogs' },
        { label: 'Gestão de Feedbacks', icon: MessageCircle, href: '/v2/admin/feedbacks' },
        { label: 'Configurações Globais', icon: Settings, href: '/v2/admin/configuracoes' },
    ],
};

export function MainLayoutV2({ children }: MainLayoutV2Props) {
    const { user, isAdmin, signOut, originalUser, stopImpersonating, plano } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    // Se estivermos impersonificando, a barra lateral ainda mostrará quem nós realmente somos
    const displayUser = originalUser || user;
    const userName = displayUser?.user_metadata?.name || displayUser?.email || 'Usuário';
    const initials = userName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [expandedItems, setExpandedItems] = useState<string[]>(['Cadastros']); // Cadastro aberto por padrão
    const [sidebarDesktopCollapsed, setSidebarDesktopCollapsed] = useState(() => {
        return localStorage.getItem('sidebar_desktop_collapsed') === 'true';
    });

    const [isChangelogOpen, setIsChangelogOpen] = useState(false);
    const [unreadChangelogCount, setUnreadChangelogCount] = useState(0);

    const checkUnreadChangelogs = async () => {
        if (!user) return;
        try {
            // Buscar todos os changelogs publicados
            const { data: changelogsData } = await supabase
                .from('changelogs')
                .select('id')
                .lte('published_at', new Date().toISOString());

            const fetchedChangelogs = changelogsData || [];
            if (fetchedChangelogs.length === 0) {
                setUnreadChangelogCount(0);
                return;
            }

            // Buscar leituras do usuário
            const { data: readData } = await supabase
                .from('user_changelog_reads')
                .select('changelog_id')
                .eq('user_id', user.id);

            const readIds = (readData || []).map(r => r.changelog_id);

            // Contar os não lidos
            const unread = fetchedChangelogs.filter(cl => !readIds.includes(cl.id));
            setUnreadChangelogCount(unread.length);
        } catch (error) {
            console.error('Erro ao verificar novidades não lidas:', error);
        }
    };

    useEffect(() => {
        if (user) {
            checkUnreadChangelogs();
            
            // Ouvir inserções/alterações na tabela changelogs em tempo real
            const channel = supabase
                .channel('public_changelogs_changes_layout')
                .on('postgres_changes', { 
                    event: '*', 
                    schema: 'public', 
                    table: 'changelogs' 
                }, () => {
                    checkUnreadChangelogs();
                })
                .on('postgres_changes', { 
                    event: '*', 
                    schema: 'public', 
                    table: 'user_changelog_reads' 
                }, () => {
                    checkUnreadChangelogs();
                })
                .subscribe();

            return () => {
                channel.unsubscribe();
            };
        }
    }, [user]);

    // Fechar a sidebar sempre que a rota mudar
    useEffect(() => {
        setIsSidebarOpen(false);
    }, [location.pathname]);

    // Sincronizar preferência da sidebar quando o usuário mudar
    useEffect(() => {
        const collapsed = localStorage.getItem('sidebar_desktop_collapsed') === 'true';
        setSidebarDesktopCollapsed(collapsed);
    }, [user]);

    // Ouvir alterações temporárias de layout (antes de salvar) vindas da tela de perfil
    useEffect(() => {
        const handleTempPref = (e: Event) => {
            const customEvent = e as CustomEvent<boolean>;
            setSidebarDesktopCollapsed(customEvent.detail);
        };
        window.addEventListener('temp_sidebar_preference', handleTempPref);
        return () => {
            window.removeEventListener('temp_sidebar_preference', handleTempPref);
        };
    }, []);

    const handleSignOut = async () => {
        await signOut();
    };

    const handleOpenChangelog = () => {
        setIsChangelogOpen(true);
        setUnreadChangelogCount(0); // Zera o contador de forma otimista imediatamente
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

        if (item.label === 'Novidades') {
            return (
                <button
                    key={item.label}
                    onClick={handleOpenChangelog}
                    className="w-full flex items-center gap-3 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors text-slate-400 hover:bg-slate-800 hover:text-white"
                >
                    <item.icon size={16} className={unreadChangelogCount > 0 ? 'text-teal-400' : ''} />
                    <span className="flex-1 text-left">{item.label}</span>
                    {unreadChangelogCount > 0 && (
                        <span className="bg-red-500 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-full flex items-center justify-center animate-pulse">
                            {unreadChangelogCount}
                        </span>
                    )}
                </button>
            );
        }

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
                    className={`fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 transition-opacity ${
                        !sidebarDesktopCollapsed ? 'lg:hidden' : ''
                    }`}
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}
 
            {/* ─── Sidebar ─── */}
            <aside className={`bg-[#0f172a] text-slate-300 flex flex-col fixed inset-y-0 left-0 z-50 w-64 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 ease-in-out shadow-2xl ${
                !sidebarDesktopCollapsed ? 'lg:translate-x-0 lg:shadow-none' : ''
            }`}>
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
                        className={`ml-auto p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ${
                            !sidebarDesktopCollapsed ? 'lg:hidden' : ''
                        }`}
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
                                {section.items.map(item => {
                                    if (item.label === 'Relatórios' && !isAdmin && plano !== 'pro' && plano !== 'premium') {
                                        return null;
                                    }
                                    return renderItem(item);
                                })}
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
            <div className={`flex-1 flex flex-col min-h-screen ml-0 w-full transition-all duration-300 animate-in fade-in duration-200 ${
                !sidebarDesktopCollapsed ? 'lg:pl-64' : ''
            }`}>
 
                {/* Header Superior (Sempre visível para permitir abrir o menu lateral colapsado) */}
                <header className={`bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-30 flex items-center gap-3 shadow-sm justify-start ${
                    !sidebarDesktopCollapsed ? 'lg:hidden' : ''
                }`}>
                    {/* Botão de menu hambúrguer para expandir a sidebar colapsada em qualquer resolução, posicionado do lado esquerdo, antes do logo */}
                    <button
                        onClick={() => setIsSidebarOpen(true)}
                        className="p-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors focus:ring-2 focus:ring-[#14b8a6]/20 outline-none flex-shrink-0"
                    >
                        <Menu size={24} />
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="bg-[#0f172a] p-1.5 rounded-md">
                            <img src="/images/logo.svg" alt="Logo" className="w-5 h-5" />
                        </div>
                        <span className="font-bold text-slate-800 text-lg tracking-tight">
                            Recebimento <span className="text-[#14b8a6]">$mart</span>
                        </span>
                    </div>
                    {/* Botão de novidades 🔔 no mobile alinhado à direita */}
                    <button
                        onClick={handleOpenChangelog}
                        className="ml-auto p-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors focus:ring-2 focus:ring-[#14b8a6]/20 outline-none flex-shrink-0 relative"
                    >
                        <Bell size={20} className={unreadChangelogCount > 0 ? 'text-teal-600 animate-bounce' : ''} />
                        {unreadChangelogCount > 0 && (
                            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-white animate-ping"></span>
                        )}
                        {unreadChangelogCount > 0 && (
                            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
                        )}
                    </button>
                </header>
 
                <main className="flex-1 flex flex-col">
                    {originalUser && (
                        <div className={`bg-amber-500 text-white px-4 md:px-6 py-2.5 md:py-3 flex items-center justify-between gap-3 shadow-sm z-20 sticky transition-all ${
                            !sidebarDesktopCollapsed 
                                ? 'top-[57px] md:top-[64px] lg:top-0' 
                                : 'top-[57px] md:top-[64px]'
                        }`}>
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

            <VoiceFloatingButton />
            <ChangelogDrawer
                isOpen={isChangelogOpen}
                onClose={() => setIsChangelogOpen(false)}
                user={user}
                isAdmin={!!isAdmin}
                onReadComplete={checkUnreadChangelogs}
            />
            <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
      `}</style>
        </div>
    );
}

export default MainLayoutV2;
