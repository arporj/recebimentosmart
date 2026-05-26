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
      { text: 'Controle de até 15 clientes', available: true },
      { text: 'Até 30 transações mensais', available: true },
      { text: 'Até 2 contas bancárias', available: true },
      { text: 'Até 10 tags para organização', available: true },
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
      { text: 'Controle de até 35 clientes', available: true },
      { text: 'Até 60 transações mensais', available: true },
      { text: 'Até 4 contas bancárias', available: true },
      { text: 'Até 30 tags para organização', available: true },
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
      { text: 'Controle de até 80 clientes', available: true },
      { text: 'Até 120 transações mensais', available: true },
      { text: 'Até 10 contas bancárias', available: true },
      { text: 'Até 70 tags para organização', available: true },
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
      { text: 'Clientes e contatos ilimitados', available: true },
      { text: 'Transações e lançamentos ilimitados', available: true },
      { text: 'Bancos e contas ilimitadas', available: true },
      { text: 'Tags de organização ilimitadas', available: true },
    ],
    popular: false,
    cta: 'Assinar Premium',
    ctaLink: '/v2/cadastro',
  }
];

export function generateFeaturesFromLimits(clients: number, transactions: number, accounts: number, tags: number): PlanFeature[] {
  return [
    {
      text: clients === -1 ? 'Clientes e contatos ilimitados' : `Controle de até ${clients} clientes`,
      available: true
    },
    {
      text: transactions === -1 ? 'Transações e lançamentos ilimitados' : `Até ${transactions} transações mensais`,
      available: true
    },
    {
      text: accounts === -1 ? 'Bancos e contas ilimitadas' : `Até ${accounts} contas bancárias`,
      available: true
    },
    {
      text: tags === -1 ? 'Tags de organização ilimitadas' : `Até ${tags} tags para organização`,
      available: true
    }
  ];
}

export function getPlanFeatures(slug: PlanSlug, planData: any): PlanFeature[] {
  // Resgata os limites (com fallbacks dos limites padrão se planData estiver ausente)
  let clients = 15;
  let transactions = 30;
  let accounts = 2;
  let tags = 10;

  if (planData) {
    clients = planData.limit_clients !== undefined ? planData.limit_clients : (planData.limit_clientes !== undefined ? planData.limit_clientes : -1);
    transactions = planData.limit_transactions !== undefined ? planData.limit_transactions : (planData.limit_transacoes !== undefined ? planData.limit_transacoes : -1);
    accounts = planData.limit_accounts !== undefined ? planData.limit_accounts : (planData.limit_contas !== undefined ? planData.limit_contas : -1);
    tags = planData.limit_tags !== undefined ? planData.limit_tags : -1;
  } else {
    // Limites padrão de fallback
    if (slug === 'basico') {
      clients = 35; transactions = 60; accounts = 4; tags = 30;
    } else if (slug === 'pro') {
      clients = 80; transactions = 120; accounts = 10; tags = 70;
    } else if (slug === 'premium') {
      clients = -1; transactions = -1; accounts = -1; tags = -1;
    }
  }

  const emailEnabled = planData
    ? (planData.email_notification_enabled ?? false)
    : (slug !== 'free');
  const emailFrequency = planData
    ? (planData.email_notification_frequency ?? 'daily')
    : (slug === 'basico' ? 'weekly' : 'daily');

  const frequencyLabel = emailFrequency === 'weekly' ? 'semanal' : 'diária';
  const emailFeatureText = `Notificação ${frequencyLabel} de contas por e-mail`;

  const limitFeatures = [
    {
      text: clients === -1 ? 'Clientes e contatos ilimitados' : `Controle de até ${clients} clientes`,
      available: true
    },
    {
      text: transactions === -1 ? 'Transações e lançamentos ilimitados' : `Até ${transactions} transações mensais`,
      available: true
    },
    {
      text: accounts === -1 ? 'Bancos e contas ilimitadas' : `Até ${accounts} contas bancárias`,
      available: true
    },
    {
      text: tags === -1 ? 'Tags de organização ilimitadas' : `Até ${tags} tags para organização`,
      available: true
    }
  ];

  if (slug === 'free') {
    return [
      ...limitFeatures,
      { text: 'Exibição de anúncios', available: true }
    ];
  }

  if (slug === 'basico') {
    return [
      ...limitFeatures,
      { text: emailEnabled ? emailFeatureText : 'Sem notificações por e-mail', available: emailEnabled }
    ];
  }

  if (slug === 'pro') {
    return [
      { text: 'Tudo do plano Básico', available: true },
      ...limitFeatures,
      { text: emailEnabled ? emailFeatureText : 'Sem notificações por e-mail', available: emailEnabled },
      { text: 'Painel de relatórios detalhados', available: true }
    ];
  }

  if (slug === 'premium') {
    return [
      { text: 'Tudo do plano Pró', available: true },
      ...limitFeatures,
      { text: emailEnabled ? emailFeatureText : 'Sem notificações por e-mail', available: emailEnabled },
      { text: 'Suporte prioritário', available: true },
      { text: 'Acesso antecipado a recursos', available: true }
    ];
  }

  return limitFeatures;
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

