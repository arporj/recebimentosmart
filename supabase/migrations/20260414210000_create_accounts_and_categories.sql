-- Contas Financeiras (Corrente, Investimento, Cartão de Crédito)
CREATE TABLE IF NOT EXISTS public.financial_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    type TEXT CHECK (type IN ('checking', 'savings', 'credit_card', 'investment')) NOT NULL,
    initial_balance NUMERIC(15, 2) DEFAULT 0,
    credit_limit NUMERIC(15, 2),          -- apenas para cartão de crédito
    closing_day INTEGER CHECK (closing_day >= 1 AND closing_day <= 31),  -- dia de fechamento da fatura
    due_day INTEGER CHECK (due_day >= 1 AND due_day <= 31),              -- dia de vencimento da fatura
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, name)
);

-- Categorias Financeiras (por usuário, com subcategorias via parent_id)
CREATE TABLE IF NOT EXISTS public.financial_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    parent_id UUID REFERENCES public.financial_categories(id) ON DELETE CASCADE,
    icon TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, name, parent_id)
);

-- Habilitar RLS
ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_categories ENABLE ROW LEVEL SECURITY;

-- Políticas de Segurança
CREATE POLICY "Users can manage their own financial accounts"
    ON public.financial_accounts FOR ALL
    USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own financial categories"
    ON public.financial_categories FOR ALL
    USING (auth.uid() = user_id);

-- Índices
CREATE INDEX IF NOT EXISTS idx_financial_accounts_user ON public.financial_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_financial_categories_user ON public.financial_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_financial_categories_parent ON public.financial_categories(parent_id);

-- Função para popular categorias padrão para novos usuários
-- Será chamada via trigger ou manualmente
CREATE OR REPLACE FUNCTION public.seed_default_categories(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.financial_categories (user_id, name, parent_id, icon) VALUES
        (p_user_id, 'Moradia', NULL, '🏠'),
        (p_user_id, 'Alimentação', NULL, '🍽️'),
        (p_user_id, 'Transporte', NULL, '🚗'),
        (p_user_id, 'Saúde', NULL, '🏥'),
        (p_user_id, 'Educação', NULL, '📚'),
        (p_user_id, 'Lazer', NULL, '🎮'),
        (p_user_id, 'Vestuário', NULL, '👕'),
        (p_user_id, 'Telefonia', NULL, '📱'),
        (p_user_id, 'Internet', NULL, '🌐'),
        (p_user_id, 'Impostos e Tarifas', NULL, '📋'),
        (p_user_id, 'Salário', NULL, '💰'),
        (p_user_id, 'Freelance', NULL, '💻'),
        (p_user_id, 'Investimentos', NULL, '📈'),
        (p_user_id, 'Assinaturas', NULL, '🔄'),
        (p_user_id, 'Outros', NULL, '📦')
    ON CONFLICT (user_id, name, parent_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
