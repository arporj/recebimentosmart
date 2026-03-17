import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuth } from '../../../contexts/AuthContext';
import {
    Users, CalendarDays, BarChart3, MessageSquare,
    MessageCircle, FormInput, CreditCard,
    Shield, Settings, LogOut, Gift, Eye, Menu, X
} from 'lucide-react';

interface MainLayoutV2Props {
    children: React.ReactNode;
}

const sidebarSections = [
    {
        title: 'Geral',
        items: [
            { label: 'Clientes', icon: Users, href: '/v2/clientes' },
            { label: 'Pagamentos do Mês', icon: CalendarDays, href: '/v2/pagamentos' },
            { label: 'Relatórios', icon: BarChart3, href: '/v2/relatorios' },
            { label: 'Críticas e Sugestões', icon: MessageSquare, href: '/v2/feedbacks' },
            { label: 'Indique e Ganhe', icon: Gift, href: '/v2/indicacoes', className: 'text-custom font-semibold' },
        ],
    },
    {
        title: 'Gestão',
        items: [
            { label: 'Campos Personalizados', icon: FormInput, href: '/v2/campos-personalizados' },
            { label: 'Configurações da Conta', icon: Settings, href: '/v2/perfil' },
            { label: 'Sua Assinatura', icon: CreditCard, href: '/payment' },
        ],
    },
];

const adminSection = {
    title: 'Admin',
    items: [
        { label: 'Gerenciar Usuários', icon: Shield, href: '/v2/admin/users' },
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

    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // Fechar o menu mobile sempre que a rota mudar
    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [location.pathname]);

    const handleSignOut = async () => {
        await signOut();
        navigate('/v2/login');
    };

    return (
        <div className="min-h-screen flex bg-slate-50 overflow-hidden">
            <Toaster
                position="top-right"
                toastOptions={{
                    duration: 4000,
                    style: { zIndex: 150 },
                    success: { style: { background: '#10B981', color: 'white' } },
                    error: { style: { background: '#EF4444', color: 'white' } },
                }}
            />

            {/* Overlay para fechar o menu mobile ao clicar fora */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 md:hidden transition-opacity"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* ─── Sidebar ─── */}
            <aside className={`bg-[#0f172a] text-slate-300 flex flex-col fixed inset-y-0 left-0 z-50 w-64 transform ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform duration-300 ease-in-out shadow-2xl md:shadow-none`}>
                {/* Logo */}
                <div className="p-6 flex items-center gap-3">
                    <div className="bg-white p-1.5 rounded-lg">
                        <img src="/images/logo.svg" alt="Recebimento $mart" className="h-6 w-6" />
                    </div>
                    <span className="text-white font-bold text-xl tracking-tight hidden md:block">
                        Recebimento <span className="text-[#14b8a6]">$mart</span>
                    </span>
                    <span className="text-white font-bold text-xl tracking-tight md:hidden">
                        Menu
                    </span>
                    <button
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="ml-auto md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-4 py-4 space-y-8 overflow-y-auto custom-scrollbar">
                    {sidebarSections.map((section) => (
                        <div key={section.title}>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 px-2">
                                {section.title}
                            </p>
                            <div className="space-y-1">
                                {section.items.map((item) => {
                                    const isActive = location.pathname === item.href;
                                    return (
                                        <Link
                                            key={item.href + item.label}
                                            to={item.href}
                                            className={`flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${isActive
                                                ? 'bg-[#14b8a6]/10 text-[#14b8a6]'
                                                : 'hover:bg-slate-800 hover:text-white'
                                                }`}
                                        >
                                            <item.icon size={20} />
                                            {item.label}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    ))}

                    {/* Admin section */}
                    {isAdmin && (
                        <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 px-2">
                                {adminSection.title}
                            </p>
                            <div className="space-y-1">
                                {adminSection.items.map((item) => {
                                    const isActive = location.pathname === item.href;
                                    return (
                                        <Link
                                            key={item.href}
                                            to={item.href}
                                            className={`flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${isActive
                                                ? 'bg-[#14b8a6]/10 text-[#14b8a6]'
                                                : 'hover:bg-slate-800 hover:text-white'
                                                }`}
                                        >
                                            <item.icon size={20} />
                                            {item.label}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </nav>

                {/* User section */}
                <div className="p-4 border-t border-slate-800">
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
            <div className="flex-1 flex flex-col min-h-screen ml-0 md:ml-64 w-full transition-all duration-300">

                {/* Header Mobile (Visível apenas em telas pequenas) */}
                <header className="md:hidden bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-30 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-2">
                        <div className="bg-[#0f172a] p-1.5 rounded-md">
                            <img src="/images/logo.svg" alt="Logo" className="w-5 h-5" />
                        </div>
                        <span className="font-bold text-slate-800 text-lg tracking-tight">
                            Recebimento <span className="text-[#14b8a6]">$mart</span>
                        </span>
                    </div>
                    {/* Aqui está o menu sanduíche mantido no lado superior direito, conforme solicitado */}
                    <button
                        onClick={() => setIsMobileMenuOpen(true)}
                        className="p-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors focus:ring-2 focus:ring-[#14b8a6]/20 outline-none"
                    >
                        <Menu size={24} />
                    </button>
                </header>

                <main className="flex-1 flex flex-col">
                    {originalUser && (
                        <div className="bg-amber-500 text-white px-4 md:px-6 py-3 flex items-center justify-between shadow-sm z-20 sticky top-0 md:top-0">
                            <div className="flex items-center gap-3 text-sm font-medium">
                                <Eye size={20} />
                                <span>
                                    Você está visualizando a plataforma como <strong>{user?.user_metadata?.name || user?.email || 'Usuário'}</strong> ({user?.email}).
                                </span>
                            </div>
                            <button
                                onClick={stopImpersonating}
                                className="bg-amber-700 hover:bg-amber-600 text-white px-4 py-1.5 rounded-lg text-sm font-bold transition-colors shadow-sm hidden md:block"
                            >
                                Encerrar Visualização
                            </button>
                        </div>
                    )}
                    <div className="p-4 md:p-8 flex-1 w-full max-w-full overflow-x-hidden">
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
