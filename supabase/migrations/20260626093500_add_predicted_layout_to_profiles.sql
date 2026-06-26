-- Adicionar coluna de preferência de disposição do valor previsto na tabela public.profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS predicted_layout TEXT DEFAULT 'below';

-- Comentário descritivo sobre a nova coluna
COMMENT ON COLUMN public.profiles.predicted_layout IS 'Preferência de layout do valor previsto (below, column)';
