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
      <div className="min-h-screen bg-gray-50">
        <Toaster {...toasterConfig} />
        
        {/* Navigation */}
        <nav className="bg-white shadow-sm" style={{ zIndex: 100 }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex">
                <Link to="/dashboard" className="flex items-center">
                  <img
                    className="mx-auto h-12 w-auto"
                    src="/images/header.png"
                    alt="RecebimentoSmart"
                  />
                </Link>
              </div>
              <div className="flex items-center space-x-4">
                {/* Botões de navegação principal */}
                <div className="hidden md:flex md:space-x-4">
                  <Link
                    to="/dashboard"
                    className={`inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md ${
                      pathname === '/dashboard'
                        ? 'bg-custom text-white hover:bg-custom-hover'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Clientes
                  </Link>
                  <Link
                    to="/monthly"
                    className={`inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md ${
                      pathname === '/monthly'
                        ? 'bg-custom text-white hover:bg-custom-hover'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    Pagamentos do Mês
                  </Link>
                  <Link
                    to="/campos-personalizados"
                    className={`inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md ${
                      pathname === '/campos-personalizados'
                        ? 'bg-custom text-white hover:bg-custom-hover'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Campos Personalizados
                  </Link>
                  <Link
                    to="/reports"
                    className={`inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md ${
                      pathname === '/reports'
                        ? 'bg-custom text-white hover:bg-custom-hover'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <BarChart className="h-4 w-4 mr-2" />
                    Relatórios
                  </Link>
                  {isAdmin && (
                    <>
                      <Link
                        to="/admin/chat"
                        className={`inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md ${
                          pathname === '/admin/chat'
                            ? 'bg-custom text-white hover:bg-custom-hover'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Chat
                      </Link>
                      <Link
                        to="/configuracoes"
                        className={`inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md ${
                          pathname === '/configuracoes'
                            ? 'bg-custom text-white hover:bg-custom-hover'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        <Settings className="h-4 w-4 mr-2" />
                        Configurações
                      </Link>
                    </>
                  )}
                </div>
                {/* Menu do usuário */}
                <UserMenu />
              </div>
            </div>
          </div>
        </nav>

        {/* Main content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>

        {/* Chat Components */}
        <ChatWidget />
        <ChatWindow />
      </div>
    </ChatProvider>
  );
}
