import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';

export type ThemeOption = {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
    border: string;
  };
};

const themes: Record<string, ThemeOption> = {
  default: {
    id: 'default',
    name: 'Padrão',
    primary: 'indigo',
    secondary: 'gray',
    accent: 'amber',
    colors: {
      primary: 'bg-indigo-600 hover:bg-indigo-700 text-white',
      secondary: 'bg-gray-100 hover:bg-gray-200',
      accent: 'bg-amber-500',
      background: 'bg-gray-50',
      text: 'text-gray-900',
      border: 'border-gray-200'
    }
  },
  ocean: {
    id: 'ocean',
    name: 'Oceano',
    primary: 'blue',
    secondary: 'slate',
    accent: 'cyan',
    colors: {
      primary: 'bg-blue-600 hover:bg-blue-700 text-white',
      secondary: 'bg-slate-100 hover:bg-slate-200',
      accent: 'bg-cyan-500',
      background: 'bg-slate-50',
      text: 'text-slate-900',
      border: 'border-slate-200'
    }
  },
  forest: {
    id: 'forest',
    name: 'Floresta',
    primary: 'emerald',
    secondary: 'stone',
    accent: 'lime',
    colors: {
      primary: 'bg-emerald-600 hover:bg-emerald-700 text-white',
      secondary: 'bg-stone-100 hover:bg-stone-200',
      accent: 'bg-lime-500',
      background: 'bg-stone-50',
      text: 'text-stone-900',
      border: 'border-stone-200'
    }
  },
  sunset: {
    id: 'sunset',
    name: 'Pôr do Sol',
    primary: 'orange',
    secondary: 'zinc',
    accent: 'yellow',
    colors: {
      primary: 'bg-orange-600 hover:bg-orange-700 text-white',
      secondary: 'bg-zinc-100 hover:bg-zinc-200',
      accent: 'bg-yellow-500',
      background: 'bg-zinc-50',
      text: 'text-zinc-900',
      border: 'border-zinc-200'
    }
  },
  royal: {
    id: 'royal',
    name: 'Real',
    primary: 'purple',
    secondary: 'neutral',
    accent: 'fuchsia',
    colors: {
      primary: 'bg-purple-600 hover:bg-purple-700 text-white',
      secondary: 'bg-neutral-100 hover:bg-neutral-200',
      accent: 'bg-fuchsia-500',
      background: 'bg-neutral-50',
      text: 'text-neutral-900',
      border: 'border-neutral-200'
    }
  }
};

interface ThemeContextType {
  currentTheme: ThemeOption;
  setTheme: (themeId: string) => void;
  getThemeClass: (type: keyof ThemeOption['colors']) => string;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [currentTheme, setCurrentTheme] = useState<ThemeOption>(themes.default);

  useEffect(() => {
    if (user?.user_metadata?.theme) {
      setCurrentTheme(themes[user.user_metadata.theme] || themes.default);
    }
  }, [user]);

  const setTheme = (themeId: string) => {
    const theme = themes[themeId] || themes.default;
    setCurrentTheme(theme);
  };

  const getThemeClass = (type: keyof ThemeOption['colors']) => {
    return currentTheme.colors[type];
  };

  return (
    <ThemeContext.Provider value={{ currentTheme, setTheme, getThemeClass }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}