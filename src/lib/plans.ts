export type PlanSlug = 'free' | 'basico' | 'pro' | 'premium';

export interface PlanFeature {
  text: string;
  available: boolean;
}

export interface PlanStaticConfig {
  slug: PlanSlug;
  name: string;
  priceDefault: string;
  description: string;
  featuresDefault: PlanFeature[];
  popular: boolean;
  cta: string;
  ctaLink: string;
}

export const PLAN_ORDER: PlanSlug[] = ['free', 'basico', 'pro', 'premium'];

export const PLAN_MAPPING: Record<string, PlanSlug> = {
  'free': 'free',
  'básico': 'basico',
  'basico': 'basico',
  'pró': 'pro',
  'pro': 'pro',
  'premium': 'premium'
};

export const INITIAL_PLANS_CONFIG: PlanStaticConfig[] = [
  {
    slug: 'free',
    name: 'Free',
    priceDefault: '0,00',
    description: 'Plano gratuito com anúncios para organizar suas finanças básicas.',
    featuresDefault: [
      { text: 'Até 15 clientes', available: true },
      { text: 'Até 30 transações mensais', available: true },
      { text: 'Máximo 2 contas bancárias', available: true },
      { text: 'Até 10 tags', available: true },
      { text: 'Exibição de anúncios', available: true },
    ],
    popular: false,
    cta: 'Começar Grátis',
    ctaLink: '/v2/cadastro',
  },
  {
    slug: 'basico',
    name: 'Básico',
    priceDefault: '9,90',
    description: 'Para quem está começando a organizar suas cobranças.',
    featuresDefault: [
      { text: 'Controle de até 20 clientes', available: true },
      { text: 'Dashboard simples', available: true },
      { text: 'Notificação de cobrança por e-mail', available: true },
    ],
    popular: false,
    cta: 'Começar Agora',
    ctaLink: '/v2/cadastro',
  },
  {
    slug: 'pro',
    name: 'Pró',
    priceDefault: '24,90',
    description: 'Para profissionais que precisam de mais automação e relatórios.',
    featuresDefault: [
      { text: 'Clientes ilimitados', available: true },
      { text: 'Tudo do plano Básico', available: true },
      { text: 'Relatórios detalhados', available: true },
      { text: 'Suporte via chat', available: true },
    ],
    popular: true,
    cta: 'Começar Agora',
    ctaLink: '/v2/cadastro',
  },
  {
    slug: 'premium',
    name: 'Premium',
    priceDefault: '39,90',
    description: 'Para empresas que buscam o máximo de performance e suporte.',
    featuresDefault: [
      { text: 'Tudo do plano Pró', available: true },
      { text: 'Notificação por WhatsApp', available: true },
      { text: 'Suporte prioritário', available: true },
      { text: 'Acesso antecipado a recursos', available: true },
    ],
    popular: false,
    cta: 'Assinar Premium',
    ctaLink: '/v2/cadastro',
  }
];

export function getPlanFeatures(slug: PlanSlug, planData: any): PlanFeature[] {
  // Prioriza a lista de features do banco de dados se ela existir e for válida
  if (planData && planData.features && Array.isArray(planData.features) && planData.features.length > 0) {
    return planData.features.map((featureText: string) => ({
      text: featureText,
      available: true
    }));
  }

  // Fallback estático
  const baseConfig = INITIAL_PLANS_CONFIG.find(t => t.slug === slug);
  return baseConfig ? baseConfig.featuresDefault : [];
}

export function getPlanDescription(slug: PlanSlug, planData: any): string {
  // Prioriza a descrição do banco de dados
  if (planData && planData.description) {
    return planData.description;
  }

  // Fallback estático
  const baseConfig = INITIAL_PLANS_CONFIG.find(t => t.slug === slug);
  return baseConfig ? baseConfig.description : '';
}
