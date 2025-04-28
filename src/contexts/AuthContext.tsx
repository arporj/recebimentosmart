import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { differenceInDays, parseISO } from 'date-fns';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_DELAY = 1000; // 1 second

async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  retries: number = MAX_RETRIES,
  delay: number = INITIAL_DELAY
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (retries === 0) throw error;
    
    // Only retry on database errors
    if (error instanceof Error && 
        !error.message.includes('Database error saving new user')) {
      throw error;
    }

    await new Promise(resolve => setTimeout(resolve, delay));
    
    return retryWithBackoff(
      operation,
      retries - 1,
      delay * 2 // Exponential backoff
    );
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      // 1. Autentica o usuário
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
  
      if (error || !data.user) throw error || new Error('Usuário não encontrado');
  
      // 2. Busca o perfil do usuário
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();
  
      if (profileError || !profile) {
        throw new Error('Perfil do usuário não encontrado');
      }
  
      // 3. Validação de status
      const status = profile.status;
      const createdAt = profile.created_at ? parseISO(profile.created_at) : null;
      const today = new Date();
  
      if (status === 'blocked') {
        throw new Error('Seu acesso está bloqueado. Entre em contato com a empresa ARRC.');
      }
  
      if (status === 'trial') {
        if (!createdAt) {
          throw new Error('Erro no cadastro. Entre em contato com o suporte.');
        }
        const dias = differenceInDays(today, createdAt);
        if (dias > 7) {
          throw new Error('Seu período de experiência acabou. Entre em contato para ativar sua conta.');
        }
        // trial válido: deixa passar
      }
  
      // Se chegou aqui, está ativo ou trial válido
      setUser(data.user); // garante atualização do contexto
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      }
      throw error;
    }
  };

  const signUp = async (name: string, email: string, password: string) => {
    try {
      const signUpOperation = async () => {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name: name,
            },
          },
        });

        if (error) {
          console.error('Supabase signup error details:', {
            message: error.message,
            status: error.status,
            name: error.name
          });
          throw error;
        }
        
        if (!data.user) throw new Error('No user data returned');
        return data;
      };

      await retryWithBackoff(signUpOperation);
      toast.success('Conta criada com sucesso!');
    } catch (error) {
      console.error('Final signup error:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('Database error saving new user')) {
          toast.error('Não foi possível criar sua conta no momento. Por favor, tente novamente em alguns instantes.');
        } else {
          toast.error(error.message);
        }
      } else {
        toast.error('Erro ao criar conta. Por favor, tente novamente.');
      }
      throw error;
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
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

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}