import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/supabase';
import { useAuth } from './AuthContext';

type Client = Database['public']['Tables']['clients']['Row'];

interface ClientContextType {
  clients: Client[];
  refreshClients: () => Promise<void>;
}

const ClientContext = createContext<ClientContextType | undefined>(undefined);

export function ClientProvider({ children }: { children: React.ReactNode }) {
  const [clients, setClients] = useState<Client[]>([]);
  const { user } = useAuth();

  const refreshClients = useCallback(async () => {
    if (!user) {
      setClients([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('user_id', user.id)
        .order('name');

      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  }, [user]);

  useEffect(() => {
    refreshClients();
  }, [refreshClients]);

  return (
    <ClientContext.Provider value={{ clients, refreshClients }}>
      {children}
    </ClientContext.Provider>
  );
}

export function useClients() {
  const context = useContext(ClientContext);
  if (context === undefined) {
    throw new Error('useClients must be used within a ClientProvider');
  }
  return context;
}