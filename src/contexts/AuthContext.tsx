import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { differenceInDays, parseISO } from 'date-fns';
import toast from 'react-hot-toast';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // 1. Verificação do estado de autenticação e sessão expirada
  useEffect(() => {
    const checkSessionExpiration = () => {
      const loginTime = localStorage.getItem('loginTime');
      
      const maxSessionDuration = 20 * 60 * 1000; // 20 minutos em milissegundos
      
      if (loginTime) {
        const timeElapsed = new Date().getTime() - Number(loginTime);
        
        if (timeElapsed > maxSessionDuration) {
          // Faz o logout se a sessão expirou
          supabase.auth.signOut();
          localStorage.removeItem('loginTime');
          setUser(null); // Reseta o estado de usuário
          toast.error('Sua sessão expirou. Por favor, faça login novamente.');
          return;
        }
      }
    };

    // Verifica a sessão ao carregar o estado inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      checkSessionExpiration(); // Checa expiração no primeiro load
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Escutar mudanças no estado de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      checkSessionExpiration(); // Checa expiração quando o estado muda
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe(); // Limpa o listener ao desmontar
  }, []);

  // 2. Login do usuário (salva horário de login)
  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) {
        // Tratamento específico para diferentes tipos de erro
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
      
      // Salvar horário de login
      localStorage.setItem('loginTime', JSON.stringify(new Date().getTime()));
      
    } catch (error) {
      if (error instanceof Error) {
        // Não usar toast aqui, deixar o componente LoginForm tratar a exibição do erro
        throw error;
      } else {
        throw new Error('Erro inesperado ao fazer login. Tente novamente.');
      }
    }
  };

  // 3. Cadastro de usuário
  const signUp = async (name: string, email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name,
          },
        },
      });
      
      if (error || !data.user) throw error || new Error('Erro ao criar conta');
      
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

  // 4. Logout (limpa horário de login)
  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      localStorage.removeItem('loginTime'); // Remove o horário de login
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      }
      throw error;
    }
  };

  // 5. Reset de senha
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
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook para consumir o contexto
export function useAuth() {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
}
