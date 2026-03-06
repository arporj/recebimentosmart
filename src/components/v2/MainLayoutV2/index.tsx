import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuth } from '../../../contexts/AuthContext';
import {
    Users, CalendarDays, BarChart3, MessageSquare,
    MessageCircle, FormInput, CreditCard,
    Shield, Settings, LogOut
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
        ],
    },
    {
        title: 'Gestão',
        items: [
            { label: 'Gestão de Feedbacks', icon: MessageCircle, href: '/admin/feedbacks' },
            { label: 'Campos Personalizados', icon: FormInput, href: '/campos-personalizados' },
            { label: 'Sua Assinatura', icon: CreditCard, href: '/payment' },
        ],
    },
];

const adminSection = {
    title: 'Admin',
    items: [
        { label: 'Gerenciar Usuários', icon: Shield, href: '/admin/users' },
        { label: 'Configurações', icon: Settings, href: '/profile' },
    ],
};

export function MainLayoutV2({ children }: MainLayoutV2Props) {
    const { user, isAdmin, signOut } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    const userName = user?.user_metadata?.name || user?.email || 'Usuário';
    const initials = userName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);

    const handleSignOut = async () => {
        await signOut();
        navigate('/v2/login');
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

            {/* ─── Sidebar ─── */}
            <aside className="w-64 bg-[#0f172a] text-slate-300 flex flex-col fixed h-full z-50">
                {/* Logo */}
                <div className="p-6 flex items-center gap-3">
                    <div className="bg-white p-1.5 rounded-lg">
                        <img src="/images/logo.png" alt="Recebimento $mart" className="h-6 w-6" />
                    </div>
                    <span className="text-white font-bold text-xl tracking-tight">
                        Recebimento <span className="text-[#14b8a6]">$mart</span>
                    </span>
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
            <main className="ml-64 flex-1 p-8">
                {children}
            </main>

            <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
      `}</style>
        </div>
    );
}

export default MainLayoutV2;
