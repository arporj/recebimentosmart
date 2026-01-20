import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { addDays, differenceInDays, parseISO, isFuture } from 'date-fns';
import toast from 'react-hot-toast';
import { useLocation, useNavigate } from 'react-router-dom';

interface ProfileData {
  valid_until: string | null;
  is_admin: boolean;
  plano: string | null;
  cpf_cnpj: string | null;
}

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
  // Funções de impersonação
  impersonatedUser: User | null;
  impersonateUser: (userId: string) => Promise<void>;
  stopImpersonating: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation(); // Adicionado para verificar a rota atual
  const [user, setUser] = useState<User | null>(null);
  const [hasFullAccess, setHasFullAccess] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [plano, setPlano] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [pixKey, setPixKey] = useState<string | null>(null);
  // Estado para impersonação
  const [impersonatedUser, setImpersonatedUser] = useState<User | null>(null);
  const [originalUser, setOriginalUser] = useState<User | null>(null);
  const [originalUserAccess, setOriginalUserAccess] = useState({
    hasFullAccess: false,
    isAdmin: false,
    plano: null as string | null,
  });

  useEffect(() => {
    const checkUserStatus = async (currentUser: User | null) => {
      if (impersonatedUser) return;

      if (currentUser) {
        try {
          // Atualiza a última vez que o usuário foi visto
          const lastUpdate = localStorage.getItem('lastSeenUpdate');
          const now = new Date().getTime();
          // Atualiza a cada 5 minutos
          if (!lastUpdate || (now - parseInt(lastUpdate)) > 300000) { 
            await supabase.rpc('update_last_seen');
            localStorage.setItem('lastSeenUpdate', now.toString());
          }

          const { data: profile, error } = await supabase
            .from('profiles')
            .select('valid_until, is_admin, plano, cpf_cnpj')
            .eq('id', currentUser.id)
            .single();

          if (error) throw error;

          if (profile) {
            const trialDays = 7;
            const createdAt = parseISO(currentUser.created_at);
            const trialEndDate = addDays(createdAt, trialDays);

            if (!profile.cpf_cnpj && location.pathname !== '/profile') {
              toast.error('Por favor, preencha seu CPF/CNPJ para continuar.');
              navigate('/profile');
              setLoading(false);
              return;
            }

            const hasPaidAccess = profile.valid_until ? isFuture(parseISO(profile.valid_until)) : false;
            const isInTrial = isFuture(trialEndDate);
            const currentHasFullAccess = hasPaidAccess || isInTrial;

            setHasFullAccess(currentHasFullAccess);
            setIsAdmin(profile.is_admin || false);
            setPlano(profile.plano || 'basico');

            if (!currentHasFullAccess && !profile.is_admin && location.pathname !== '/payment' && location.pathname !== '/profile') {
              navigate('/payment');
            }
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
      } else {
        setHasFullAccess(false);
        setIsAdmin(false);
        setPlano(null);
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
  }, [navigate, location.pathname, impersonatedUser]);

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

  const signUp = async (name: string, email: string, cpf_cnpj: string, password: string, referralCode?: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name,
            referral_code: referralCode,
            cpf_cnpj: cpf_cnpj,
          },
        },
      });
      
      if (error || !data.user) throw error || new Error('Erro ao criar conta');

      // O setUser e setHasFullAccess não são mais necessários aqui,
      // pois o onAuthStateChange cuidará disso após a confirmação do e-mail.
      
      toast.success('Conta criada com sucesso! Verifique seu e-mail para confirmação.');
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
      await stopImpersonating(); // Garante que a impersonação seja encerrada ao sair
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

  // Função para impersonar um usuário
  const impersonateUser = async (userId: string) => {
    if (!user || !isAdmin) return;
    
    try {
      setLoading(true);
      
      const { data: targetUserData, error: rpcError } = await supabase.rpc('get_all_users_admin');
      if (rpcError) throw rpcError;

      const targetUser = targetUserData.find((u: any) => u.id === userId);
      if (!targetUser) throw new Error('Usuário não encontrado');

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (profileError) throw profileError;

      // Guardar o usuário e estado de acesso original
      setOriginalUser(user);
      setOriginalUserAccess({ hasFullAccess, isAdmin, plano });

      // Criar um objeto de usuário para impersonação
      const impersonatedUserObj: User = {
        id: userId,
        email: targetUser.email,
        user_metadata: { name: targetUser.name, ...profileData },
        created_at: targetUser.created_at,
        app_metadata: {},
        aud: '',
        role: '',
      };
      
      // Definir o usuário impersonado e seu estado de acesso
      setImpersonatedUser(impersonatedUserObj);
      const trialDays = 7;
      const createdAt = parseISO(impersonatedUserObj.created_at);
      const trialEndDate = addDays(createdAt, trialDays);
      const hasPaidAccess = profileData.valid_until ? isFuture(parseISO(profileData.valid_until)) : false;
      const isInTrial = isFuture(trialEndDate);
      
      setHasFullAccess(hasPaidAccess || isInTrial);
      setIsAdmin(profileData.is_admin || false);
      setPlano(profileData.plano || 'basico');
      
      toast.success(`Acessando como ${targetUser.email || 'usuário'}`);
      navigate('/dashboard');

    } catch (error) {
      console.error('Erro ao impersonar usuário:', error);
      toast.error('Não foi possível acessar como este usuário.');
    } finally {
      setLoading(false);
    }
  };
  
  // Função para parar de impersonar
  const stopImpersonating = async () => {
    if (!impersonatedUser || !originalUser) return;
    
    try {
      setLoading(true);
      
      // Restaurar o usuário e estado de acesso original
      setImpersonatedUser(null);
      setUser(originalUser);
      setHasFullAccess(originalUserAccess.hasFullAccess);
      setIsAdmin(originalUserAccess.isAdmin);
      setPlano(originalUserAccess.plano);

      setOriginalUser(null);
      setOriginalUserAccess({ hasFullAccess: false, isAdmin: false, plano: null });
      
      toast.success('Voltou para sua conta original');
      navigate('/admin/users');

    } catch (error) {
      console.error('Erro ao voltar para usuário original:', error);
      toast.error('Erro ao voltar para sua conta original.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user: impersonatedUser || user, 
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
      impersonatedUser,
      impersonateUser,
      stopImpersonating
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