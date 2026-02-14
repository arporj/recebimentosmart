import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { addDays, parseISO, isFuture } from 'date-fns';
import toast from 'react-hot-toast';
import { useLocation, useNavigate } from 'react-router-dom';

interface AuthContextType {
  user: User | null;
  hasFullAccess: boolean;
  isAdmin: boolean;
  plano: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, cpf_cnpj: string, password: string, referralCode?: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateUserName: (name: string) => Promise<void>;
  referralCode: string | null;
  pixKey: string | null;
  fetchReferralInfo: () => Promise<void>;
  updatePixKey: (pixKey: string) => Promise<void>;
  originalUser: User | null;
  impersonateUser: (userId: string) => Promise<void>;
  stopImpersonating: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [originalUser, setOriginalUser] = useState<User | null>(null);
  const [hasFullAccess, setHasFullAccess] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [plano, setPlano] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [pixKey, setPixKey] = useState<string | null>(null);

  // Effect for handling auth state changes from Supabase
  useEffect(() => {
    if (originalUser) return; // Do not run when impersonating

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.warn("Erro na verificação de sessão (pode ser ignorado se não estiver logado):", error.message);
        if (error.message.includes("Refresh Token")) {
          // Token inválido, limpar estado local
          setUser(null);
          supabase.auth.signOut().catch(() => { });
        }
      } else {
        setUser(data.session?.user ?? null);
      }
      setLoading(false);
    }).catch(err => {
      console.error("Erro inesperado ao buscar sessão:", err);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [originalUser]);

  // Effect for checking user profile, permissions, and navigation
  useEffect(() => {
    const checkUserStatus = async (currentUser: User | null) => {
      if (!currentUser) {
        setHasFullAccess(false);
        setIsAdmin(false);
        setPlano(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        if (!originalUser) {
          const lastUpdate = localStorage.getItem('lastSeenUpdate');
          const now = new Date().getTime();
          if (!lastUpdate || now - parseInt(lastUpdate) > 300000) {
            await supabase.rpc('update_last_seen');
            localStorage.setItem('lastSeenUpdate', now.toString());
          }
        }

        const { data: profile, error } = await supabase
          .from('profiles')
          .select('valid_until, is_admin, plano, cpf_cnpj')
          .eq('id', currentUser.id)
          .single();

        if (error) {
          console.error('Erro ao buscar perfil:', error);
          // Se não encontrar perfil, não fazemos throw, pois o usuário existe no Auth.
          // Pode ser necessário criar o perfil ou lidar com isso.
        }

        const trialDays = 7;
        const createdAt = parseISO(currentUser.created_at);
        const trialEndDate = addDays(createdAt, trialDays);

        // Verificação mais robusta de validade
        const validUntilDate = profile?.valid_until ? new Date(profile.valid_until) : null;
        const hasPaidAccess = validUntilDate && !isNaN(validUntilDate.getTime())
          ? validUntilDate > new Date()
          : false;

        const isInTrial = isFuture(trialEndDate);
        const currentHasFullAccess = hasPaidAccess || isInTrial;

        setHasFullAccess(currentHasFullAccess);
        setIsAdmin(profile?.is_admin || false);
        setPlano(profile?.plano || 'basico');

        if (!originalUser) {
          if (!profile?.cpf_cnpj && location.pathname !== '/profile') {
            toast.error('Por favor, preencha seu CPF/CNPJ para continuar.');
            navigate('/profile');
          } else if (!currentHasFullAccess && !profile?.is_admin && location.pathname !== '/payment' && location.pathname !== '/profile') {
            // Redireciona apenas se não tiver acesso, não for admin e não estiver nas páginas permitidas
            navigate('/payment');
          }
        }

      } catch (error) {
        console.error('Erro geral em checkUserStatus:', error);
      } finally {
        setLoading(false);
      }
    };

    checkUserStatus(user);
  }, [user, originalUser, navigate, location.pathname]);


  const signIn = async (email: string, password: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success('Login realizado com sucesso!');
      navigate('/dashboard');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao fazer login';
      toast.error(message);
      console.error(error);
      setLoading(false);
    }
  };

  const signUp = async (name: string, email: string, cpf_cnpj: string, password: string, referralCode?: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name, cpf_cnpj, referral_code: referralCode }
        }
      });
      if (error) throw error;
      toast.success('Cadastro realizado com sucesso! Verifique seu e-mail.');
      navigate('/login');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao cadastrar';
      toast.error(message);
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
      navigate('/login');
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (email: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success('E-mail de recuperação enviado!');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao enviar e-mail';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

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
      console.error(error);
    }
  };

  const updatePixKey = async (newPixKey: string) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ pix_key: newPixKey })
        .eq('id', user.id);
      if (error) throw error;
      setPixKey(newPixKey);
      toast.success('Chave PIX atualizada!');
    } catch (error) {
      toast.error('Erro ao atualizar chave PIX');
      console.error(error);
    }
  };

  const updateUserName = async (name: string) => {
    if (!user) return;
    try {
      const { error: authError } = await supabase.auth.updateUser({
        data: { name }
      });
      if (authError) throw authError;

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ name })
        .eq('id', user.id);
      if (profileError) throw profileError;

      toast.success('Nome atualizado!');
      setUser(prev => prev ? { ...prev, user_metadata: { ...prev.user_metadata, name } } : null);
    } catch (error) {
      toast.error('Erro ao atualizar nome');
      console.error(error);
    }
  };

  const impersonateUser = async (userId: string) => {
    if (!user || !isAdmin) return;
    try {
      setLoading(true);
      const { data: targetUserData, error: rpcError } = await supabase.rpc('get_all_users_admin');
      if (rpcError) throw rpcError;
      const targetUser = targetUserData.find((u: { id: string, email?: string, name?: string, created_at?: string }) => u.id === userId);
      if (!targetUser) throw new Error('Usuário não encontrado');

      const { data: profileData, error: profileError } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (profileError) throw profileError;

      setOriginalUser(user);

      const impersonatedUserObj: User = {
        id: userId,
        email: targetUser.email,
        user_metadata: { name: targetUser.name, ...profileData },
        created_at: targetUser.created_at,
        app_metadata: {},
        aud: '',
        role: '',
      };

      setUser(impersonatedUserObj);

      toast.success(`Acessando como ${targetUser.email || 'usuário'}`);
      navigate('/dashboard');
    } catch (error) {
      console.error('Erro ao impersonar usuário:', error);
      toast.error('Não foi possível acessar como este usuário.');
      setLoading(false);
    }
  };

  const stopImpersonating = async () => {
    if (!originalUser) return;
    setUser(originalUser);
    setOriginalUser(null);
    navigate('/admin/users');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        originalUser,
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
        updatePixKey,
        impersonateUser,
        stopImpersonating,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}