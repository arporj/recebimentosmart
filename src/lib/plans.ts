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
    description: 'Ideal para testar a ferramenta e controle simples.',
    featuresDefault: [
      { text: 'Até 15 clientes cadastrados', available: true },
      { text: 'Até 30 transações mensais', available: true },
      { text: 'Máximo 2 contas bancárias', available: true },
      { text: 'Até 10 tags para organização', available: true },
      { text: 'Exibição de anúncios', available: true },
      { text: 'Campos personalizados nos cadastros', available: false },
    ],
    popular: false,
    cta: 'Começar Grátis',
    ctaLink: '/v2/cadastro',
  },
  {
    slug: 'basico',
    name: 'Básico',
    priceDefault: '9,90',
    description: 'O empurrão financeiro que seu negócio precisa.',
    featuresDefault: [
      { text: 'Controle de até 40 clientes', available: true },
      { text: 'Até 60 transações mensais', available: true },
      { text: 'Até 4 contas bancárias', available: true },
      { text: 'Até 30 tags para organização', available: true },
      { text: 'Sem exibição de anúncios', available: true },
      { text: 'Campos personalizados nos cadastros', available: true },
    ],
    popular: false,
    cta: 'Começar Agora',
    ctaLink: '/v2/cadastro',
  },
  {
    slug: 'pro',
    name: 'Pró',
    priceDefault: '24,90',
    description: 'Controle total e sem limites para quem quer crescer.',
    featuresDefault: [
      { text: 'Clientes e contatos ilimitados', available: true },
      { text: 'Até 120 transações mensais', available: true },
      { text: 'Contas bancárias ilimitadas', available: true },
      { text: 'Tags ilimitadas para organização', available: true },
      { text: 'Sem exibição de anúncios', available: true },
      { text: 'Campos personalizados completos', available: true },
      { text: 'Painel de relatórios detalhados', available: true },
    ],
    popular: true,
    cta: 'Começar Agora',
    ctaLink: '/v2/cadastro',
  },
  {
    slug: 'premium',
    name: 'Premium',
    priceDefault: '39,90',
    description: 'Acesso totalmente ilimitado e assessoria dedicada.',
    featuresDefault: [
      { text: 'Clientes e contatos ilimitados', available: true },
      { text: 'Transações mensais ilimitadas', available: true },
      { text: 'Contas bancárias ilimitadas', available: true },
      { text: 'Tags ilimitadas para organização', available: true },
      { text: 'Sem exibição de anúncios', available: true },
      { text: 'Campos personalizados completos', available: true },
      { text: 'Dashboard e relatórios Premium', available: true },
      { text: 'Suporte VIP via WhatsApp 24h', available: true },
    ],
    popular: false,
    cta: 'Assinar Premium',
    ctaLink: '/v2/cadastro',
  }
];

export function buildDynamicFeatures(slug: PlanSlug, planData: any): PlanFeature[] {
  const dynamicFeatures: PlanFeature[] = [];

  // 1. Clientes
  if (planData.limit_clients === -1) {
    dynamicFeatures.push({ text: 'Clientes e contatos ilimitados', available: true });
  } else {
    dynamicFeatures.push({ text: `Controle de até ${planData.limit_clients} clientes`, available: true });
  }

  // 2. Transações
  if (planData.limit_transactions === -1) {
    dynamicFeatures.push({ text: 'Transações mensais ilimitadas', available: true });
  } else {
    dynamicFeatures.push({ text: `Até ${planData.limit_transactions} transações/mês`, available: true });
  }

  // 3. Contas bancárias
  if (planData.limit_accounts === -1) {
    dynamicFeatures.push({ text: 'Contas bancárias ilimitadas', available: true });
  } else {
    dynamicFeatures.push({ text: `Até ${planData.limit_accounts} contas bancárias`, available: true });
  }

  // 4. Tags
  if (planData.limit_tags === -1) {
    dynamicFeatures.push({ text: 'Tags ilimitadas para organização', available: true });
  } else {
    dynamicFeatures.push({ text: `Até ${planData.limit_tags} tags para organização`, available: true });
  }

  // 5. Diferenciais Específicos
  if (slug === 'free') {
    dynamicFeatures.push({ text: 'Exibição de anúncios', available: true });
    dynamicFeatures.push({ text: 'Campos personalizados nos cadastros', available: false });
  } else {
    dynamicFeatures.push({ text: 'Sem exibição de anúncios', available: true });
    dynamicFeatures.push({ text: 'Campos personalizados nos cadastros', available: true });
    
    if (slug === 'pro') {
      dynamicFeatures.push({ text: 'Painel de relatórios detalhados', available: true });
    } else if (slug === 'premium') {
      dynamicFeatures.push({ text: 'Dashboard e relatórios Premium', available: true });
      dynamicFeatures.push({ text: 'Suporte VIP via WhatsApp 24h', available: true });
    }
  }

  return dynamicFeatures;
}
