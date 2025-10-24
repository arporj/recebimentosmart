// src/contexts/SubscriptionContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { isFuture, parseISO } from 'date-fns';
import toast from 'react-hot-toast';

// Tipagens
interface Plan {
  name: string;
  price_monthly: number;
  features?: string[];
}

interface UserData {
  credits: number;
  plan: string;
  valid_until: string;
}

interface PageData {
  plans: Plan[];
  user: UserData;
}

interface SubscriptionContextType {
  loading: boolean;
  pageData: PageData | null;
  paymentStatus: 'idle' | 'pending' | 'completed' | 'failed';
  setPaymentStatus: React.Dispatch<React.SetStateAction<'idle' | 'pending' | 'completed' | 'failed'>>;
  fetchData: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const SubscriptionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pageData, setPageData] = useState<PageData | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'pending' | 'completed' | 'failed'>('idle');
  const hasFetched = useRef(false); // Ref para controlar a busca inicial

  const fetchData = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      console.log('Buscando dados da página de assinatura (context)...');
      
      const defaultData: PageData = {
        plans: [
          { name: 'Básico', price_monthly: 19.90 },
          { name: 'Pró', price: 39.90 },
          { name: 'Premium', price_monthly: 59.90 }
        ],
        user: {
          credits: 0,
          plan: 'trial',
          valid_until: ''
        }
      };
      
      const { data, error } = await supabase.rpc('get_subscription_page_data');
      
      if (error) {
        console.error('Erro na RPC get_subscription_page_data:', error);
        setPageData(defaultData);
        return;
      }
      
      if (!data) {
        console.error('Dados recebidos em formato inválido:', data);
        setPageData(defaultData);
        return;
      }
      
      if (!data.plans || !Array.isArray(data.plans) || data.plans.length === 0) {
        data.plans = defaultData.plans;
      }
      
      if (!data.user) {
        data.user = defaultData.user;
      }
      
      setPageData(data);

      if (data.user && data.user.plan !== 'trial' && data.user.valid_until && isFuture(parseISO(data.user.valid_until))) {
        setPaymentStatus('completed');
      } else {
        setPaymentStatus('idle');
      }

    } catch (error: any) {
      console.error('Erro completo:', error);
      toast.error(`Erro ao carregar dados: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user && !hasFetched.current) {
      hasFetched.current = true;
      fetchData();
    } else if (!user) {
      // Limpar dados quando o usuário deslogar
      setPageData(null);
      setLoading(true);
      setPaymentStatus('idle');
      hasFetched.current = false; // Resetar para a próxima sessão
    }
  }, [user, fetchData]);

  return (
    <SubscriptionContext.Provider value={{ loading, pageData, paymentStatus, setPaymentStatus, fetchData }}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};