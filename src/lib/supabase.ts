import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

import { getIsRemembered } from './storage';

// Adaptador de Storage Customizado
// Permite decidir dinamicamente se salva a sessão no localStorage ou sessionStorage
const customStorageAdapter = {
  getItem: (key: string): string | null => {
    if (typeof window === 'undefined') return null;
    const isRemembered = getIsRemembered();
    if (isRemembered) {
      return window.localStorage.getItem(key) || window.sessionStorage.getItem(key);
    }
    return window.sessionStorage.getItem(key);
  },
  setItem: (key: string, value: string): void => {
    if (typeof window === 'undefined') return;
    const isRemembered = getIsRemembered();
    
    if (isRemembered) {
      window.localStorage.setItem(key, value);
      window.sessionStorage.removeItem(key);
    } else {
      window.sessionStorage.setItem(key, value);
      window.localStorage.removeItem(key);
    }
  },
  removeItem: (key: string): void => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: customStorageAdapter, // Usando nosso storage customizado
  }
});