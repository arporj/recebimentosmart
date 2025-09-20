import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { addDays, differenceInDays, parseISO, isFuture } from 'date-fns';
import toast from 'react-hot-toast';

interface AuthContextType {
  user: User | null;
  hasFullAccess: boolean;
  isAdmin: boolean;
  plano: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string, referralCode?: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateUserName: (name: string) => Promise<void>;
  referralCode: string | null;
  pixKey: string | null;
  fetchReferralInfo: () => Promise<void>;
  updatePixKey: (pixKey: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [hasFullAccess, setHasFullAccess] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [plano, setPlano] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [pixKey, setPixKey] = useState<string | null>(null);

  useEffect(() => {
    const checkUserStatus = async (currentUser: User | null) => {
      if (currentUser) {
        try {
          const { data: profile, error } = await supabase
            .from('profiles')
            .select('valid_until, is_admin, plano')
            .eq('id', currentUser.id)
            .single();

          if (error) throw error;

          if (profile) {
            const trialDays = 7;
            const createdAt = parseISO(currentUser.created_at);
            const trialEndDate = addDays(createdAt, trialDays);

            const hasPaidAccess = profile.valid_until ? isFuture(parseISO(profile.valid_until)) : false;
            const isInTrial = isFuture(trialEndDate);

            setHasFullAccess(hasPaidAccess || isInTrial);
            setIsAdmin(profile.is_admin || false);
            setPlano(profile.plano || 'basico');
          } else {
            setHasFullAccess(false);
            setIsAdmin(false);
            setPlano(null);
          }
        } catch (error) {
          console.error("Erro ao buscar perfil do usuário:", error);
          setHasFullAccess(false);
          setIsAdmin(false);
          setPlano(null);
        }
      }
      setUser(currentUser);
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      checkUserStatus(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      checkUserStatus(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

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
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name,
            referral_code: referralCode,
          },
        },
      });
      
      if (error || !data.user) throw error || new Error('Erro ao criar conta');

      setUser({
        ...data.user,
        user_metadata: {
          ...data.user.user_metadata,
          valid_until: validUntil,
        },
      });
      setHasFullAccess(true);
      
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
      const { error } = await supabase.functions.invoke('send-password-reset', {
        body: { email },
      });

      if (error) {
        throw error;
      }

      toast.success('E-mail de recuperação enviado! Verifique sua caixa de entrada.');
    } catch (error) {
      toast.error('Não foi possível enviar o e-mail. Verifique o endereço e tente novamente.');
      throw error;
    }
  };

  // Função para buscar informações de indicação e PIX
  const fetchReferralInfo = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('referral_code, pix_key')
        .eq('id', user.id)
        .single();
      
      if (error) throw error;
      
      if (data) {
        setReferralCode(data.referral_code);
        setPixKey(data.pix_key);
      }
    } catch (error) {
      console.error('Erro ao buscar informações de indicação:', error);
    }
  };

  // Função para atualizar a chave PIX
  const updatePixKey = async (newPixKey: string) => {
    if (!user) return;
    
    try {
      setLoading(true);
      const { error } = await supabase
        .from('profiles')
        .update({ pix_key: newPixKey })
        .eq('id', user.id);
      
      if (error) throw error;
      
      setPixKey(newPixKey);
      toast.success('Chave PIX atualizada com sucesso!');
    } catch (error) {
      console.error('Erro ao atualizar chave PIX:', error);
      toast.error('Não foi possível atualizar a chave PIX.');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Função para atualizar o nome do usuário
  const updateUserName = async (name: string) => {
    if (!user) return;
    
    try {
      setLoading(true);
      
      // Atualiza os metadados do usuário
      const { error } = await supabase.auth.updateUser({
        data: { name }
      });
      
      if (error) throw error;
      
      // Atualiza o estado local
      setUser(prev => {
        if (!prev) return null;
        return {
          ...prev,
          user_metadata: {
            ...prev.user_metadata,
            name
          }
        };
      });
      
    } catch (error) {
      console.error('Erro ao atualizar nome:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      hasFullAccess, 
      isAdmin, 
      plano, 
      loading, 
      signIn, 
      signUp, 
      signOut, 
      resetPassword,
      updateUserName,
      referralCode,
      pixKey,
      fetchReferralInfo,
      updatePixKey
    }}>
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
