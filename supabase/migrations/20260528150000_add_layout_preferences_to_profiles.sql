-- Adicionar colunas de preferências de layout na tabela public.profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS layout_preference TEXT DEFAULT 'default',
ADD COLUMN IF NOT EXISTS show_currency_symbol BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS show_negative_sign BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS value_alignment TEXT DEFAULT 'right';

-- Comentários descritivos sobre as novas colunas
COMMENT ON COLUMN public.profiles.layout_preference IS 'Preferência de layout de exibição das transações financeiras';
COMMENT ON COLUMN public.profiles.show_currency_symbol IS 'Preferência se exibe o símbolo de moeda (R$)';
COMMENT ON COLUMN public.profiles.show_negative_sign IS 'Preferência se exibe sinal de menos nas despesas';
COMMENT ON COLUMN public.profiles.value_alignment IS 'Preferência de alinhamento visual dos valores das transações';
