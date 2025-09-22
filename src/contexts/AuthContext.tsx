import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { addDays, parseISO, isFuture } from 'date-fns';
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
  // Funções de personificação
  isImpersonating: boolean;
  impersonatedUser: User | null;
  startImpersonation: (targetUserId: string) => Promise<void>;
  stopImpersonation: () => Promise<void>;
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

  // Estado para personificação
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [impersonatedUser, setImpersonatedUser] = useState<User | null>(null);
  const [originalSession, setOriginalSession] = useState<Session | null>(null);

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

    const handleAuthChange = async (_event: string, session: Session | null) => {
      const currentUser = session?.user ?? null;
      await checkUserStatus(currentUser);

      // Se a sessão mudar e não for a que estamos personificando, encerre a personificação.
      if (isImpersonating && session?.access_token !== originalSession?.access_token && currentUser?.id !== impersonatedUser?.id) {
        stopImpersonation();
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      handleAuthChange('INITIAL_SESSION', session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthChange);

    return () => subscription.unsubscribe();
  }, [isImpersonating, impersonatedUser, originalSession]);

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          throw new Error('Email ou senha incorretos. Verifique suas credenciais e tente novamente.');
        } else if (error.message.includes('Email not confirmed')) {
          throw new Error('Email não confirmado. Verifique sua caixa de entrada e confirme seu email.');
        } else {
          throw new Error(error.message || 'Erro ao fazer login. Tente novamente.');
        }
      }
      if (!data.user) throw new Error('Usuário não encontrado. Verifique suas credenciais.');
      localStorage.setItem('loginTime', JSON.stringify(new Date().getTime()));
    } catch (error) {
      if (error instanceof Error) throw error;
      else throw new Error('Erro inesperado ao fazer login. Tente novamente.');
    }
  };

  const signUp = async (name: string, email: string, password: string, referralCode?: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name, referral_code: referralCode } } });
      if (error || !data.user) throw error || new Error('Erro ao criar conta');
      toast.success('Conta criada com sucesso! Verifique seu e-mail para confirmação.');
    } catch (error) {
      if (error instanceof Error) toast.error(error.message);
      else toast.error('Erro ao criar conta. Tente novamente.');
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await stopImpersonation(); // Garante que a personificação seja encerrada ao sair
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      localStorage.removeItem('loginTime');
    } catch (error) {
      if (error instanceof Error) toast.error(error.message);
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.functions.invoke('send-password-reset', { body: { email } });
      if (error) throw error;
      toast.success('E-mail de recuperação enviado! Verifique sua caixa de entrada.');
    } catch (error) {
      toast.error('Não foi possível enviar o e-mail. Verifique o endereço e tente novamente.');
      throw error;
    }
  };

  const fetchReferralInfo = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.from('profiles').select('referral_code, pix_key').eq('id', user.id).single();
      if (error) throw error;
      if (data) {
        setReferralCode(data.referral_code);
        setPixKey(data.pix_key);
      }
    } catch (error) {
      console.error('Erro ao buscar informações de indicação:', error);
    }
  };

  const updatePixKey = async (newPixKey: string) => {
    if (!user) return;
    try {
      setLoading(true);
      const { error } = await supabase.from('profiles').update({ pix_key: newPixKey }).eq('id', user.id);
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

  const updateUserName = async (name: string) => {
    if (!user) return;
    try {
      setLoading(true);
      const { error } = await supabase.auth.updateUser({ data: { name } });
      if (error) throw error;
      setUser(prev => prev ? { ...prev, user_metadata: { ...prev.user_metadata, name } } : null);
    } catch (error) {
      console.error('Erro ao atualizar nome:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const startImpersonation = async (targetUserId: string) => {
    if (!isAdmin) {
      toast.error("Apenas administradores podem usar esta função.");
      return;
    }
    try {
      setLoading(true);
      const { data: currentSessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !currentSessionData.session) {
        throw new Error("Não foi possível obter a sessão atual do administrador.");
      }
      setOriginalSession(currentSessionData.session);

      const { data, error } = await supabase.functions.invoke('impersonate-user', {
        body: { targetUserId },
      });

      if (error) throw error;

      const { accessToken, user: targetUser } = data;
      await supabase.auth.setSession({ access_token: accessToken, refresh_token: currentSessionData.session.refresh_token });

      setImpersonatedUser(targetUser);
      setIsImpersonating(true);
      toast.success(`Iniciando visualização como ${targetUser.email}`);

    } catch (error) {
      console.error("Erro ao iniciar personificação:", error);
      toast.error((error as Error).message || "Não foi possível iniciar a visualização.");
      await stopImpersonation(); // Limpa qualquer estado parcial
    } finally {
      setLoading(false);
    }
  };

  const stopImpersonation = async () => {
    if (!originalSession) return;
    try {
      setLoading(true);
      const { error } = await supabase.auth.setSession(originalSession);
      if (error) throw error;

      setOriginalSession(null);
      setImpersonatedUser(null);
      setIsImpersonating(false);
      toast.success("Retornando para a conta de administrador.");
    } catch (error) {
      console.error("Erro ao parar personificação:", error);
      toast.error("Não foi possível retornar à sua conta.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      hasFullAccess,
      isAdmin: isAdmin && !isImpersonating, // Admin é true apenas se for o usuário original
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
      updatePixKey,
      isImpersonating,
      impersonatedUser,
      startImpersonation,
      stopImpersonation
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
