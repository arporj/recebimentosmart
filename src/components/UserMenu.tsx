import React, { useState, useRef, useEffect } from 'react';
import { User, LogOut, MessageSquare, CreditCard, UserCheck, Calendar, BarChart, Gift, Settings, UserX, Inbox } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';

// Exportação nomeada para corresponder à importação em App.tsx
export const UserMenu: React.FC = () => {
  const { user, signOut, hasFullAccess, isAdmin, originalUser, stopImpersonating, plano } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { pathname } = location;
  
  const isProOrAdmin = isAdmin || (plano && ['pro', 'pró', 'premium'].includes(plano.trim().toLowerCase()));
  
  // Estado para controlar a visibilidade do menu
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [unreadUserFeedback, setUnreadUserFeedback] = useState(false);
  const [unreadAdminFeedback, setUnreadAdminFeedback] = useState(false);
  
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (user) {
      checkUnreadFeedbacks();
      
      // Subscribe to changes
      const subscription = supabase
        .channel('feedback_updates')
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'feedbacks' 
        }, () => {
          checkUnreadFeedbacks();
        })
        .subscribe();
        
      return () => {
        subscription.unsubscribe();
      };
    }
  }, [user, isAdmin]);

  const checkUnreadFeedbacks = async () => {
    if (!user) return;

    try {
      // Check user unread
      const { count: userCount } = await supabase
        .from('feedbacks')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('has_unread_user', true);
        
      setUnreadUserFeedback((userCount || 0) > 0);

      // Check admin unread if admin
      if (isAdmin) {
        const { count: adminCount } = await supabase
          .from('feedbacks')
          .select('id', { count: 'exact', head: true })
          .eq('has_unread_admin', true);
          
        setUnreadAdminFeedback((adminCount || 0) > 0);
      }
    } catch (error) {
      console.error('Erro ao verificar feedbacks:', error);
    }
  };

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
  const handleNavigation = (path: string) => {
    setIsMenuOpen(false);
    navigate(path);
  };

  // Se o período de teste expirou, mostramos apenas o menu de pagamento e sair
  if (!hasFullAccess && !isAdmin) {
    return (
      <div className="relative">
        <div className="flex items-center">
          {originalUser && (
            <button
              onClick={stopImpersonating}
              className="mr-2 flex items-center space-x-1 p-1 rounded-md text-white bg-amber-600 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-white/75"
              title="Voltar para sua conta"
            >
              <UserX className="h-4 w-4" />
              <span className="hidden sm:inline text-xs">Voltar</span>
            </button>
          )}
          <button 
            ref={buttonRef}
            className={`flex items-center space-x-2 p-2 rounded-md text-white ${originalUser ? 'bg-amber-600' : ''} hover:bg-custom-hover focus:outline-none focus:ring-2 focus:ring-white/75`}
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-haspopup="true"
            aria-expanded={isMenuOpen}
          >
            <User className="h-5 w-5" />
            <span>{user?.user_metadata?.name || user?.email}</span>
            {originalUser && (
              <span className="text-xs bg-white text-amber-600 px-1 py-0.5 rounded ml-1">(Impersonando)</span>
            )}
          </button>
        </div>
        
        {isMenuOpen && (
          <div 
            ref={menuRef}
            className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg overflow-hidden z-50 border border-secondary-100"
            role="menu"
          >
            <div className="py-2">
              <button
                onClick={() => handleNavigation('/payment')}
                className="flex items-center w-full px-4 py-2 text-sm text-red-700 hover:bg-secondary-100 focus:bg-secondary-100 focus:outline-none font-bold"
                role="menuitem"
              >
                <CreditCard className="h-4 w-4 mr-2 text-red-500" />
                Sua Assinatura
              </button>
              
              <hr className="my-1" />
              
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  handleLogout();
                }}
                className="flex items-center w-full px-4 py-2 text-sm text-neutral-700 hover:bg-secondary-100 focus:bg-secondary-100 focus:outline-none"
                role="menuitem"
              >
                <LogOut className="h-4 w-4 mr-2 text-neutral-500" />
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
      <div className="flex items-center">
        {originalUser && (
          <button
            onClick={stopImpersonating}
            className="mr-2 flex items-center space-x-1 p-1 rounded-md text-white bg-amber-600 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-white/75"
            title="Voltar para sua conta"
          >
            <UserX className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">Voltar</span>
          </button>
        )}
        <button 
          ref={buttonRef}
          className={`flex items-center space-x-2 p-2 rounded-md text-white ${originalUser ? 'bg-amber-600' : ''} hover:bg-custom-hover focus:outline-none focus:ring-2 focus:ring-white/75`}
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-haspopup="true"
          aria-expanded={isMenuOpen}
        >
          <User className="h-5 w-5" />
          <span className="hidden sm:inline">{user?.user_metadata?.name || user?.email}</span>
          {originalUser && (
            <span className="text-xs bg-white text-amber-600 px-1 py-0.5 rounded ml-1">(Impersonando)</span>
          )}
        </button>
      </div>
      
      {isMenuOpen && (
        <div 
          ref={menuRef}
          className="absolute right-0 mt-2 w-64 bg-white rounded-md shadow-lg overflow-hidden z-50 border border-secondary-200"
          role="menu"
        >
          <div className="py-1">
            {/* Itens de Navegação Principal */}
            <div className="border-b border-secondary-200 pb-1 mb-1">
              <button
                onClick={() => handleNavigation('/monthly')}
                className={`flex items-center w-full px-4 py-2 text-sm ${
                  pathname === '/monthly' ? 'text-custom font-semibold' : 'text-neutral-700'
                } hover:bg-secondary-100 focus:bg-secondary-100 focus:outline-none`}
                role="menuitem"
              >
                <Calendar className="h-4 w-4 mr-3 text-neutral-500" />
                Pagamentos do Mês
              </button>

              {isProOrAdmin && (
              <button
                onClick={() => handleNavigation('/reports')}
                className={`flex items-center w-full px-4 py-2 text-sm ${
                  pathname === '/reports' ? 'text-custom font-semibold' : 'text-neutral-700'
                } hover:bg-secondary-100 focus:bg-secondary-100 focus:outline-none`}
                role="menuitem"
              >
                <BarChart className="h-4 w-4 mr-3 text-neutral-500" />
                Relatórios
              </button>
              )}

              <button
                onClick={() => handleNavigation('/feedback')}
                className={`flex items-center w-full px-4 py-2 text-sm ${
                  pathname === '/feedback' ? 'text-custom font-semibold' : 'text-neutral-700'
                } hover:bg-secondary-100 focus:bg-secondary-100 focus:outline-none`}
                role="menuitem"
              >
                <div className="relative mr-3">
                  <MessageSquare className="h-4 w-4 text-neutral-500" />
                  {unreadUserFeedback && (
                    <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full"></span>
                  )}
                </div>
                Críticas e Sugestões
              </button>
            </div>

            {isAdmin && (
              <div className="border-b border-secondary-200 pb-1 mb-1">
                <button
                  onClick={() => handleNavigation('/admin/feedbacks')}
                  className={`flex items-center w-full px-4 py-2 text-sm ${
                    pathname === '/admin/feedbacks' ? 'text-custom font-semibold' : 'text-neutral-700'
                  } hover:bg-secondary-100 focus:bg-secondary-100 focus:outline-none`}
                  role="menuitem"
                >
                  <div className="relative mr-3">
                    <Inbox className="h-4 w-4 text-neutral-500" />
                    {unreadAdminFeedback && (
                      <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full"></span>
                    )}
                  </div>
                  Gestão de Feedbacks
                </button>
              </div>
            )}

            {/* Itens de Configuração e Conta */}
            {isProOrAdmin && (
            <button
              onClick={() => handleNavigation('/campos-personalizados')}
              className={`flex items-center w-full px-4 py-2 text-sm ${
                pathname === '/campos-personalizados' ? 'text-custom font-semibold' : 'text-neutral-700'
              } hover:bg-secondary-100 focus:bg-secondary-100 focus:outline-none`}
              role="menuitem"
            >
              <Settings className="h-4 w-4 mr-3 text-neutral-500" />
              Campos Personalizados
            </button>
            )}

            <button
              onClick={() => handleNavigation('/profile')}
              className={`flex items-center w-full px-4 py-2 text-sm ${
                pathname === '/profile' ? 'text-custom font-semibold' : 'text-neutral-700'
              } hover:bg-secondary-100 focus:bg-secondary-100 focus:outline-none`}
              role="menuitem"
            >
              <User className="h-4 w-4 mr-3 text-neutral-500" />
              Meu Perfil
            </button>
            
            <button
              onClick={() => handleNavigation('/payment')}
              className="flex items-center w-full px-4 py-2 text-sm text-neutral-700 hover:bg-secondary-100 focus:bg-secondary-100 focus:outline-none"
              role="menuitem"
            >
              <CreditCard className="h-4 w-4 mr-3 text-neutral-500" />
              Sua Assinatura
            </button>

            <div className="border-t border-secondary-200 pt-1 mt-1">
              <button
                onClick={() => handleNavigation('/indicacoes')}
                className="flex items-center w-full px-4 py-2 text-sm text-neutral-700 hover:bg-secondary-100 focus:bg-secondary-100 focus:outline-none"
                role="menuitem"
              >
                <Gift className="h-4 w-4 mr-3 text-neutral-500" />
                Indicações
              </button>

              <button
                onClick={() => handleNavigation('/feedback')}
                className="flex items-center w-full px-4 py-2 text-sm text-neutral-700 hover:bg-secondary-100 focus:bg-secondary-100 focus:outline-none"
                role="menuitem"
              >
                <MessageSquare className="h-4 w-4 mr-3 text-neutral-500" />
                Críticas e Sugestões
              </button>
            </div>

            {/* Seção do Administrador */}
            {isAdmin && !originalUser && (
              <div className="border-t border-secondary-200 pt-1 mt-1">
                <span className="px-4 py-2 text-xs font-bold text-neutral-400 block">Admin</span>
                <button
                  onClick={() => handleNavigation('/admin/users')}
                  className="flex items-center w-full px-4 py-2 text-sm text-neutral-700 hover:bg-secondary-100 focus:bg-secondary-100 focus:outline-none"
                  role="menuitem"
                >
                  <UserCheck className="h-4 w-4 mr-3 text-neutral-500" />
                  Gerenciar Usuários
                </button>
                <button
                  onClick={() => handleNavigation('/admin/chat')}
                  className={`flex items-center w-full px-4 py-2 text-sm ${
                    pathname === '/admin/chat' ? 'text-custom font-semibold' : 'text-neutral-700'
                  } hover:bg-secondary-100 focus:bg-secondary-100 focus:outline-none`}
                  role="menuitem"
                >
                  <MessageSquare className="h-4 w-4 mr-3 text-neutral-500" />
                  Chat Admin
                </button>
                <button
                  onClick={() => handleNavigation('/configuracoes')}
                  className={`flex items-center w-full px-4 py-2 text-sm ${
                    pathname === '/configuracoes' ? 'text-custom font-semibold' : 'text-neutral-700'
                  } hover:bg-secondary-100 focus:bg-secondary-100 focus:outline-none`}
                  role="menuitem"
                >
                  <Settings className="h-4 w-4 mr-3 text-neutral-500" />
                  Configurações
                </button>
              </div>
            )}
            
            {/* Logout */}
            <div className="border-t border-secondary-200 pt-1 mt-1">
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  handleLogout();
                }}
                className="flex items-center w-full px-4 py-2 text-sm text-neutral-700 hover:bg-secondary-100 focus:bg-secondary-100 focus:outline-none"
                role="menuitem"
              >
                <LogOut className="h-4 w-4 mr-3 text-neutral-500" />
                Sair
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
// Mantendo também a exportação default para compatibilidade
export default UserMenu;
