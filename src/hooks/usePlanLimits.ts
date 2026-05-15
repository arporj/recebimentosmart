import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

export interface PlanUsageData {
  plan_slug: string;
  cycle_start: string;
  usage: {
    clients: number;
    transactions: number;
    accounts: number;
    tags: number;
  };
  limits: {
    clients: number;
    transactions: number;
    accounts: number;
    tags: number;
    can_custom_fields: boolean;
    can_custom_categories: boolean;
  };
}

/**
 * Hook centralizado para verificação e exibição dos limites de uso do plano do usuário
 */
export function usePlanLimits() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [planUsage, setPlanUsage] = useState<PlanUsageData | null>(null);

  const fetchLimits = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    
    try {
      const { data, error } = await supabase.rpc('get_user_plan_usage', {
        p_user_id: user.id
      });
      
      if (error) {
        console.warn('Erro ao resgatar cota do plano:', error.message);
      } else if (data) {
        setPlanUsage(data as PlanUsageData);
      }
    } catch (err) {
      console.error('Falha crítica ao ler cotas:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchLimits();
  }, [fetchLimits]);

  /**
   * Verifica se o usuário atingiu o limite estabelecido.
   * Se atingiu, emite um aviso toast visualmente explicativo e retorna falso.
   */
  const checkLimit = useCallback((entity: 'clients' | 'transactions' | 'accounts' | 'tags'): boolean => {
    if (!planUsage) return true; // Permissivo durante o carregamento inicial para evitar travamentos de UI

    const current = planUsage.usage[entity];
    const max = planUsage.limits[entity];

    // -1 representa ilimitado na arquitetura
    if (max === -1) return true;

    if (current >= max) {
      let entityLabel = '';
      switch (entity) {
        case 'clients':
          entityLabel = 'clientes cadastrados';
          break;
        case 'transactions':
          entityLabel = 'lançamentos financeiros neste mês';
          break;
        case 'accounts':
          entityLabel = 'contas ou cartões cadastrados';
          break;
        case 'tags':
          entityLabel = 'tags organizacionais';
          break;
      }

      toast.error(
        `Você atingiu o limite do seu plano (${current}/${max} ${entityLabel}). Faça o Upgrade do plano para continuar crescendo sem barreiras!`,
        {
          duration: 7000,
          id: `limit-${entity}`,
          icon: '🚀',
        }
      );
      return false;
    }

    return true;
  }, [planUsage]);

  /**
   * Valida permissão para funcionalidades booleanas
   */
  const canUseFeature = useCallback((feature: 'custom_fields' | 'custom_categories'): boolean => {
    if (!planUsage) return true;
    
    const hasAccess = feature === 'custom_fields' 
      ? planUsage.limits.can_custom_fields 
      : planUsage.limits.can_custom_categories;

    if (!hasAccess) {
      const featureLabel = feature === 'custom_fields' 
        ? 'Campos Personalizados' 
        : 'Gerenciamento Avançado de Categorias';

      toast.error(
        `A ferramenta de ${featureLabel} é exclusiva para assinantes dos planos profissionais. Considere fazer um Upgrade!`,
        {
          duration: 6000,
          id: `feature-${feature}`,
          icon: '✨',
        }
      );
      return false;
    }

    return true;
  }, [planUsage]);

  return {
    planUsage,
    loading,
    checkLimit,
    canUseFeature,
    refreshLimits: fetchLimits
  };
}
