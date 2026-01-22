// src/contexts/SubscriptionContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
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
  name?: string;
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

  const fetchData = useCallback(async () => {
    if (!user) {
      setPageData(null);
      setLoading(true);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_subscription_page_data', { p_user_id: user.id });

      if (error) {
        console.error('Erro na RPC get_subscription_page_data:', error);
        toast.error('Não foi possível carregar os dados da assinatura.');
        setPageData(null); // Clear data on error
        return;
      }
      
      setPageData(data);

      if (data?.user?.plan !== 'trial' && data?.user?.valid_until && isFuture(parseISO(data.user.valid_until))) {
        setPaymentStatus('completed');
      } else {
        setPaymentStatus('idle');
      }

    } catch (error) {
      console.error('Erro ao buscar dados da assinatura:', error);
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Erro ao carregar dados: ${message}`);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <SubscriptionContext.Provider value={{ loading, pageData, paymentStatus, setPaymentStatus, fetchData }}>
      {children}
    </SubscriptionContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};