import React, { useState } from 'react';
import { X, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { toast } from 'react-hot-toast';

interface ThemeSettingsModalProps {
  onClose: () => void;
}

export function ThemeSettingsModal({ onClose }: ThemeSettingsModalProps) {
  const { user } = useAuth();
  const { currentTheme, setTheme } = useTheme();
  const [loading, setLoading] = useState(false);

  const handleThemeChange = async (themeId: string) => {
    try {
      setLoading(true);
      
      const { error } = await supabase.auth.updateUser({
        data: { theme: themeId }
      });

      if (error) throw error;

      setTheme(themeId);
      toast.success('Tema alterado com sucesso!');
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error('Erro ao alterar tema');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-500"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-lg font-medium mb-4">Personalizar Layout</h2>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {Object.values(currentTheme).map((theme) => (
            <button
              key={theme.id}
              onClick={() => handleThemeChange(theme.id)}
              disabled={loading}
              className={`relative p-4 rounded-lg border-2 transition-all ${
                currentTheme.id === theme.id
                  ? 'border-indigo-500 ring-2 ring-indigo-500 ring-opacity-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className={`h-20 rounded-md bg-gradient-to-r from-${theme.primary}-500 to-${theme.primary}-600 mb-2`} />
              <p className="text-sm font-medium text-gray-900">{theme.name}</p>
              {currentTheme.id === theme.id && (
                <div className="absolute top-2 right-2 h-6 w-6 bg-indigo-500 rounded-full flex items-center justify-center">
                  <Check className="h-4 w-4 text-white" />
                </div>
              )}
            </button>
          ))}
        </div>

        <div className="mt-6 text-sm text-gray-500">
          <p>O tema selecionado será aplicado em todos os seus acessos futuros.</p>
        </div>
      </div>
    </div>
  );
}