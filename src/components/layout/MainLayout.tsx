import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import UserMenu from '../UserMenu';
import { Users, BarChart, Calendar, Settings, MessageSquare } from 'lucide-react'; // Adicionado ícone de Configurações
import { useAuth } from '../../contexts/AuthContext'; // Importar o hook de autenticação
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

export function MainLayout({ children }: MainLayoutProps) {
  const { isAdmin } = useAuth(); // Obter o status de admin
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
    <ChatProvider>
      <div className="min-h-screen bg-neutral-50">
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
        <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 bg-neutral-50 w-full">
          {children}
        </main>

        {/* Footer */}
        <footer className="bg-white border-t border-neutral-200 py-6">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-neutral-500">
            <img
              src="https://horizons-cdn.hostinger.com/5781d7fb-b7cc-4bb3-80b5-c52f16421b3b/045c5f7576e02237edd915ee1af176f2.png"
              alt="ARRC Sistemas Logo"
              className="h-10 mx-auto mb-3"
            />
            <p className="mb-1">
              Feito com ❤️ pela ARRC Sistemas
            </p>
            <p className="text-xs">
              © 2025 ARRC Sistemas. Todos os direitos reservados.
            </p>
          </div>
        </footer>

        {/* Chat Components */}
        <ChatWidget />
        <ChatWindow />
      </div>
    </ChatProvider>
  );
}