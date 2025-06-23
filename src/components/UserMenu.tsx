import React, { useState, useRef, useEffect } from 'react';
import { User, LogOut, Lock, MessageSquare, CreditCard, UserCheck, Users, Calendar, BarChart } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

// Interface para as props do componente
interface UserMenuProps {
  currentView?: 'clients' | 'reports' | 'status' | 'monthly';
  onViewChange?: (view: 'clients' | 'reports' | 'status' | 'monthly') => void;
}

// Exportação nomeada para corresponder à importação em App.tsx
export const UserMenu: React.FC<UserMenuProps> = ({ currentView, onViewChange }) => {
  const { user, signOut, isTrialActive } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.email === 'arporj@gmail.com' || user?.email === 'andre@andreric.com';
  
  // Estado para controlar a visibilidade do menu
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Fechar o menu quando clicar fora dele
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current && 
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current && 
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await signOut();
      toast.success('Logout realizado com sucesso');
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
      toast.error('Erro ao fazer logout');
    }
  };

  // Função para navegar para uma página específica
  const handleNavigation = (view: 'clients' | 'reports' | 'status' | 'monthly' | 'feedback' | 'payment' | 'admin/users' | 'change-password') => {
    setIsMenuOpen(false);
    
    // Se for uma das views principais e onViewChange estiver disponível, use-o
    if ((view === 'clients' || view === 'reports' || view === 'monthly' || view === 'status') && onViewChange) {
      onViewChange(view);
    } else {
      // Para outras páginas, use o navigate do React Router
      navigate(`/${view}`);
    }
  };

  // Se o período de teste expirou, mostramos apenas o menu de pagamento e sair
  if (!isTrialActive && !isAdmin) {
    return (
      <div className="relative">
        <button 
          ref={buttonRef}
          className="flex items-center space-x-2 p-2 rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-haspopup="true"
          aria-expanded={isMenuOpen}
        >
          <User className="h-5 w-5 text-indigo-600" />
          <span className="text-gray-700">{user?.user_metadata?.name || user?.email}</span>
        </button>
        
        {isMenuOpen && (
          <div 
            ref={menuRef}
            className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg overflow-hidden z-50"
            role="menu"
          >
            <div className="py-2">
              <button
                onClick={() => handleNavigation('payment')}
                className="flex items-center w-full px-4 py-2 text-sm text-red-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none font-bold"
                role="menuitem"
              >
                <CreditCard className="h-4 w-4 mr-2 text-red-500" />
                Realizar Pagamento
              </button>
              
              <hr className="my-1" />
              
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  handleLogout();
                }}
                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                role="menuitem"
              >
                <LogOut className="h-4 w-4 mr-2 text-gray-500" />
                Sair
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Menu normal para usuários com período de teste ativo ou administradores
  return (
    <div className="relative">
      <button 
        ref={buttonRef}
        className="flex items-center space-x-2 p-2 rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        aria-haspopup="true"
        aria-expanded={isMenuOpen}
      >
        <User className="h-5 w-5 text-indigo-600" />
        <span className="text-gray-700">{user?.user_metadata?.name || user?.email}</span>
      </button>
      
      {isMenuOpen && (
        <div 
          ref={menuRef}
          className="absolute right-0 mt-2 w-64 bg-white rounded-md shadow-lg overflow-hidden z-50"
          role="menu"
        >
          <div className="py-2">
            {/* Menu para dispositivos móveis - mostra as opções principais */}
            <div className="md:hidden border-b border-gray-200 pb-2 mb-2">
              <button
                onClick={() => handleNavigation('clients')}
                className={`flex items-center w-full px-4 py-2 text-sm ${
                  currentView === 'clients' ? 'text-indigo-600 font-medium' : 'text-gray-700'
                } hover:bg-gray-100 focus:bg-gray-100 focus:outline-none`}
                role="menuitem"
              >
                <Users className="h-4 w-4 mr-2 text-gray-500" />
                Clientes
              </button>
              
              <button
                onClick={() => handleNavigation('monthly')}
                className={`flex items-center w-full px-4 py-2 text-sm ${
                  currentView === 'monthly' ? 'text-indigo-600 font-medium' : 'text-gray-700'
                } hover:bg-gray-100 focus:bg-gray-100 focus:outline-none`}
                role="menuitem"
              >
                <Calendar className="h-4 w-4 mr-2 text-gray-500" />
                Pagamentos do Mês
              </button>
              
              <button
                onClick={() => handleNavigation('reports')}
                className={`flex items-center w-full px-4 py-2 text-sm ${
                  currentView === 'reports' ? 'text-indigo-600 font-medium' : 'text-gray-700'
                } hover:bg-gray-100 focus:bg-gray-100 focus:outline-none`}
                role="menuitem"
              >
                <BarChart className="h-4 w-4 mr-2 text-gray-500" />
                Relatórios
              </button>
            </div>
            
            {/* Menu comum para todos os dispositivos */}
            <button
              onClick={() => handleNavigation('change-password')}
              className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
              role="menuitem"
            >
              <Lock className="h-4 w-4 mr-2 text-gray-500" />
              Trocar Senha
            </button>
            
            <button
              onClick={() => handleNavigation('feedback')}
              className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
              role="menuitem"
            >
              <MessageSquare className="h-4 w-4 mr-2 text-gray-500" />
              Críticas e Sugestões
            </button>
            
            <button
              onClick={() => handleNavigation('payment')}
              className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
              role="menuitem"
            >
              <CreditCard className="h-4 w-4 mr-2 text-gray-500" />
              Pagamentos
            </button>
            
            {isAdmin && (
              <button
                onClick={() => handleNavigation('admin/users')}
                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                role="menuitem"
              >
                <UserCheck className="h-4 w-4 mr-2 text-gray-500" />
                Gerenciar Usuários
              </button>
            )}
            
            <hr className="my-1" />
            
            <button
              onClick={() => {
                setIsMenuOpen(false);
                handleLogout();
              }}
              className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
              role="menuitem"
            >
              <LogOut className="h-4 w-4 mr-2 text-gray-500" />
              Sair
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Mantendo também a exportação default para compatibilidade
export default UserMenu;
