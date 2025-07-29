import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { addDays, differenceInDays, parseISO, isFuture } from 'date-fns';
import toast from 'react-hot-toast';

interface AuthContextType {
  user: User | null;
  hasFullAccess: boolean;
  isAdmin: boolean; // Novo estado para o status de admin
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string, referralCode?: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [hasFullAccess, setHasFullAccess] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false); // Novo estado para admin
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkUserStatus = async (currentUser: User | null) => {
      if (currentUser) {
        try {
          const { data: profile, error } = await supabase
            .from('profiles')
            .select('valid_until, is_admin') // Busca também o campo is_admin
            .eq('id', currentUser.id)
            .single();

          if (error) throw error;

          if (profile) {
            setHasFullAccess(profile.valid_until ? isFuture(parseISO(profile.valid_until)) : false);
            setIsAdmin(profile.is_admin || false); // Define o estado de admin
          } else {
            setHasFullAccess(false);
            setIsAdmin(false);
          }
        } catch (error) {
          console.error("Erro ao buscar perfil do usuário:", error);
          setHasFullAccess(false);
          setIsAdmin(false);
        }
      } else {
        setHasFullAccess(false);
        setIsAdmin(false);
      }
      setUser(currentUser);
      setLoading(false);
    };

    // Verifica a sessão ao carregar o estado inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      checkUserStatus(session?.user ?? null);
    });

    // Escutar mudanças no estado de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      checkUserStatus(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ... (manter as funções signIn, signUp, signOut, resetPassword como estão)

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          throw new Error('Email ou senha incorretos. Verifique suas credenciais e tente novamente.');
        } else if (error.message.includes('Email not confirmed')) {
          throw new Error('Email não confirmado. Verifique sua caixa de entrada e confirme seu email.');
        } else if (error.message.includes('Too many requests')) {
          throw new Error('Muitas tentativas de login. Aguarde alguns minutos antes de tentar novamente.');
        } else {
          throw new Error(error.message || 'Erro ao fazer login. Tente novamente.');
        }
      }
      
      if (!data.user) {
        throw new Error('Usuário não encontrado. Verifique suas credenciais.');
      }
      
      localStorage.setItem('loginTime', JSON.stringify(new Date().getTime()));
      
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      } else {
        throw new Error('Erro inesperado ao fazer login. Tente novamente.');
      }
    }
  };

  const signUp = async (name: string, email: string, password: string, referralCode?: string) => {
    try {
      const validUntil = addDays(new Date(), 7).toISOString();

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name,
            referral_code: referralCode,
            valid_until: validUntil,
          },
        },
      });
      
      if (error || !data.user) throw error || new Error('Erro ao criar conta');

      // O trigger no Supabase irá lidar com a criação do perfil.
      // Apenas atualizamos o estado local para refletir o período de trial.
      setHasFullAccess(true);
      
      if (referralCode && data.user) {
        // A lógica de inserção em 'referrals' e 'referral_credits' agora é tratada por triggers no banco de dados.
        // Não é necessário inserir aqui no lado do cliente.
      }
      
      toast.success('Conta criada com sucesso!');
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error('Erro ao criar conta. Tente novamente.');
      }
      throw error;
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      localStorage.removeItem('loginTime');
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      } 
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      
      if (error) throw error;
      
      toast.success('Email de recuperação enviado! Verifique sua caixa de entrada.');
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error('Erro ao enviar email de recuperação. Tente novamente.');
      }
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, hasFullAccess, isAdmin, loading, signIn, signUp, signOut, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
}
