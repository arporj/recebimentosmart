import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Adaptador de Storage Customizado
// Permite decidir dinamicamente se salva a sessão no localStorage ou sessionStorage
const customStorageAdapter = {
  getItem: (key: string): string | null => {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem(key) || window.localStorage.getItem(key);
  },
  setItem: (key: string, value: string): void => {
    if (typeof window === 'undefined') return;
    if (window.sessionStorage.getItem('use_session_storage') === 'true') {
      window.sessionStorage.setItem(key, value);
      // Garante que não ficou resquício da sessão antiga no local storage
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
      // Garante que não ficou resquício no session storage
      window.sessionStorage.removeItem(key);
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