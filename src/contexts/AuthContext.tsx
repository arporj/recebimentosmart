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
  impersonatedUser: User | null;
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
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

        if (error) throw error;

        const trialDays = 7;
        const createdAt = parseISO(currentUser.created_at);
        const trialEndDate = addDays(createdAt, trialDays);
        const hasPaidAccess = profile?.valid_until ? isFuture(parseISO(profile.valid_until)) : false;
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
            navigate('/payment');
          }
        }
      } catch (err) {
        console.error('Erro ao buscar perfil do usuário:', err);
        setHasFullAccess(false);
        setIsAdmin(false);
        setPlano(null);
      } finally {
        setLoading(false);
      }
    };

    checkUserStatus(user);
  }, [user, originalUser, navigate, location.pathname]);


  const signIn = async (email: string, password: string) => {
    // ... same as before
  };

  const signUp = async (name: string, email: string, cpf_cnpj: string, password: string, referralCode?: string) => {
    // ... same as before
  };

  const signOut = async () => {
    // ... same as before
  };

  const resetPassword = async (email: string) => {
    // ... same as before
  };

  const fetchReferralInfo = async () => {
    // ... same as before
  };

  const updatePixKey = async (newPixKey: string) => {
    // ... same as before
  };

  const updateUserName = async (name: string) => {
    // ... same as before
  };

  const impersonateUser = async (userId: string) => {
    if (!user || !isAdmin) return;
    try {
      setLoading(true);
      const { data: targetUserData, error: rpcError } = await supabase.rpc('get_all_users_admin');
      if (rpcError) throw rpcError;
      const targetUser = targetUserData.find((u: any) => u.id === userId);
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

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}