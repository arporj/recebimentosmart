-- Migração para Expansão Financeira: Contas a Pagar e Receitas Avulsas

-- Tabela de Tags Financeiras
CREATE TABLE IF NOT EXISTS public.financial_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#14b8a6',
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, name)
);

-- Tabela de Transações Financeiras (Unificada: Receitas e Despesas)
CREATE TABLE IF NOT EXISTS public.financial_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    type TEXT CHECK (type IN ('income', 'expense')) NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    date DATE NOT NULL,
    description TEXT,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    recurrence_enabled BOOLEAN DEFAULT false,
    recurrence_period TEXT CHECK (recurrence_period IN ('weekly', 'monthly', 'quarterly', 'yearly')),
    recurrence_day INTEGER,
    status TEXT CHECK (status IN ('pending', 'paid')) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de Relacionamento Transação <-> Tag
CREATE TABLE IF NOT EXISTS public.transaction_tags (
    transaction_id UUID REFERENCES public.financial_transactions(id) ON DELETE CASCADE NOT NULL,
    tag_id UUID REFERENCES public.financial_tags(id) ON DELETE CASCADE NOT NULL,
    PRIMARY KEY (transaction_id, tag_id)
);

-- Habilitar RLS
ALTER TABLE public.financial_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_tags ENABLE ROW LEVEL SECURITY;

-- Políticas de Segurança (RLS)
CREATE POLICY "Users can manage their own financial tags" 
    ON public.financial_tags FOR ALL 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own financial transactions" 
    ON public.financial_transactions FOR ALL 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own transaction tags" 
    ON public.transaction_tags FOR ALL 
    USING (
        EXISTS (
            SELECT 1 FROM public.financial_transactions 
            WHERE id = transaction_tags.transaction_id AND user_id = auth.uid()
        )
    );

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_financial_transactions_user_date ON public.financial_transactions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_type ON public.financial_transactions(type);
CREATE INDEX IF NOT EXISTS idx_financial_tags_user ON public.financial_tags(user_id);
