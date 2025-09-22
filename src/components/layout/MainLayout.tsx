import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import UserMenu from '../UserMenu';
import { Users, BarChart, Calendar, Settings, MessageSquare, X, UserCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ChatProvider } from '../../contexts/ChatContext';
import { ChatWidget } from '../chat/ChatWidget';
import { ChatWindow } from '../chat/ChatWindow';

// Configuração do Toaster (movida para o layout para consistência)
const toasterConfig = {
  position: "top-right" as const,
  toastOptions: {
    duration: 4000,
    style: {
      zIndex: 150, // Garantir que fique acima de outros elementos
      marginTop: '70px',
      marginRight: '16px',
      cursor: 'pointer',
    },
    success: { style: { background: '#10B981', color: 'white' } },
    error: { style: { background: '#EF4444', color: 'white' } },
  }
};

interface MainLayoutProps {
  children: React.ReactNode;
}

const ImpersonationBanner = () => {
  const { isImpersonating, impersonatedUser, stopImpersonation } = useAuth();

  if (!isImpersonating || !impersonatedUser) {
    return null;
  }

  return (
    <div className="bg-yellow-400 text-black py-2 px-4 fixed top-0 left-0 right-0 z-50 flex items-center justify-center shadow-lg">
      <UserCheck className="h-5 w-5 mr-3" />
      <span className="font-semibold">
        Visualizando como: {impersonatedUser.email}
      </span>
      <button 
        onClick={stopImpersonation} 
        className="ml-4 bg-yellow-500 hover:bg-yellow-600 text-black font-bold p-1 rounded-full transition-transform duration-200 ease-in-out hover:scale-110"
        title="Voltar para sua conta"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
};

export function MainLayout({ children }: MainLayoutProps) {
  const { isAdmin, isImpersonating } = useAuth();
  const location = useLocation();
  const { pathname } = location;

  // Listener para fechar notificações ao clique
  React.useEffect(() => {
    const handleToastClick = (e: MouseEvent) => {
      const toastElement = (e.target as Element)?.closest('[data-hot-toast-container] > div');
      if (toastElement) {
        Toaster.dismiss();
      }
    };
    
    document.addEventListener('click', handleToastClick);
    return () => document.removeEventListener('click', handleToastClick);
  }, []);

  return (
      <div className={`min-h-screen bg-neutral-50 ${isImpersonating ? 'pt-12' : ''}`}>
        <ImpersonationBanner />
        <Toaster {...toasterConfig} />
        
        {/* Navigation */}
        <nav className="bg-custom shadow-lg" style={{ zIndex: 100 }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center">
                <Link to="/dashboard" className="flex items-center">
                  <img
                    className="mx-auto h-12 w-auto"
                    src="/images/header.png"
                    alt="RecebimentoSmart"
                  />
                </Link>
              </div>
              <div className="flex items-center space-x-4">
                {/* Botão de Clientes */}
                <div className="hidden md:flex">
                  <Link
                    to="/dashboard"
                    className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md transition-colors ${
                      pathname === '/dashboard'
                        ? 'bg-custom-hover text-white ring-2 ring-white/75'
                        : 'text-white hover:bg-custom-hover hover:text-white'
                    }`}
                  >
                    <Users className="h-5 w-5 mr-2" />
                    Clientes
                  </Link>
                </div>
                {/* Menu do usuário */}
                <UserMenu />
              </div>
            </div>
          </div>
        </nav>

        {/* Main content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:8 py-8 bg-neutral-50">
          {children}
        </main>

        {/* Chat Components */}
        <ChatWidget />
        <ChatWindow />
      </div>
  );
}
