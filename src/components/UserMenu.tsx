import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Settings, LogOut, Palette, Key, ChevronDown, Users, BarChart, AlertCircle, Calendar } from 'lucide-react';
import { ChangePasswordModal } from './ChangePasswordModal';
import { ThemeSettingsModal } from './ThemeSettingsModal';

type View = 'clients' | 'reports' | 'status' | 'monthly';

interface UserMenuProps {
  currentView?: View;
  onViewChange?: (view: View) => void;
}

export function UserMenu({ currentView, onViewChange }: UserMenuProps) {
  const { user, signOut } = useAuth();
  const { getThemeClass } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showThemeSettings, setShowThemeSettings] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Fechar o menu ao clicar fora dele
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  if (!user) return null;

  const handleViewChange = (view: View) => {
    if (onViewChange) {
      onViewChange(view);
      setIsOpen(false);
    }
  };

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center space-x-2 text-sm focus:outline-none"
        >
          <div className={`h-8 w-8 rounded-full ${getThemeClass('primary')} flex items-center justify-center text-white font-medium`}>
            {user.user_metadata.name?.[0]?.toUpperCase() || 'U'}
          </div>
          <span className="hidden sm:block font-medium text-gray-700">
            {user.user_metadata.name || 'Usuário'}
          </span>
          <ChevronDown className="h-4 w-4 text-gray-500" />
        </button>

        {isOpen && (
          <div className="fixed right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-[100]" style={{top: menuRef.current?.getBoundingClientRect().bottom + 'px', right: '1rem'}}>
            <div className="py-1" role="menu">
              {/* Navegação em telas pequenas */}
              <div className="md:hidden border-b border-gray-100 pb-2 mb-2">
                <button
                  onClick={() => handleViewChange('clients')}
                  className={`flex items-center w-full px-4 py-2 text-sm ${
                    currentView === 'clients' ? 'text-blue-600 font-medium' : 'text-gray-700'
                  } hover:bg-gray-100`}
                  role="menuitem"
                >
                  <Users className="h-4 w-4 mr-2" />
                  Clientes
                </button>
                <button
                  onClick={() => handleViewChange('monthly')}
                  className={`flex items-center w-full px-4 py-2 text-sm ${
                    currentView === 'monthly' ? 'text-blue-600 font-medium' : 'text-gray-700'
                  } hover:bg-gray-100`}
                  role="menuitem"
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  Pagamentos do Mês
                </button>
                <button
                  onClick={() => handleViewChange('reports')}
                  className={`flex items-center w-full px-4 py-2 text-sm ${
                    currentView === 'reports' ? 'text-blue-600 font-medium' : 'text-gray-700'
                  } hover:bg-gray-100`}
                  role="menuitem"
                >
                  <BarChart className="h-4 w-4 mr-2" />
                  Relatórios
                </button>
                <button
                  onClick={() => handleViewChange('status')}
                  className={`flex items-center w-full px-4 py-2 text-sm ${
                    currentView === 'status' ? 'text-blue-600 font-medium' : 'text-gray-700'
                  } hover:bg-gray-100`}
                  role="menuitem"
                >
                  <AlertCircle className="h-4 w-4 mr-2" />
                  Status
                </button>
              </div>
              
              {/* Opções do usuário */}
              <button
                onClick={() => {
                  setIsOpen(false);
                  setShowChangePassword(true);
                }}
                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                role="menuitem"
              >
                <Key className="h-4 w-4 mr-2" />
                Trocar Senha
              </button>
              <button
                onClick={() => {
                  setIsOpen(false);
                  setShowThemeSettings(true);
                }}
                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                role="menuitem"
              >
                <Palette className="h-4 w-4 mr-2" />
                Alterar Layout
              </button>
              <button
                onClick={() => {
                  setIsOpen(false);
                  signOut();
                }}
                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                role="menuitem"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sair
              </button>
            </div>
          </div>
        )}
      </div>

      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}

      {showThemeSettings && (
        <ThemeSettingsModal onClose={() => setShowThemeSettings(false)} />
      )}
    </>
  );
}