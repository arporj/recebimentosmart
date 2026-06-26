-- Adicionar colunas de preferências visuais na tabela public.profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS theme_preference TEXT DEFAULT 'original',
ADD COLUMN IF NOT EXISTS row_density TEXT DEFAULT 'original',
ADD COLUMN IF NOT EXISTS remove_bold_list BOOLEAN DEFAULT false;

-- Comentários descritivos sobre as novas colunas
COMMENT ON COLUMN public.profiles.theme_preference IS 'Preferência de tema de cor (original, light, dark)';
COMMENT ON COLUMN public.profiles.row_density IS 'Preferência de densidade de linhas de listagens (original, compact, expanded)';
COMMENT ON COLUMN public.profiles.remove_bold_list IS 'Preferência de remover negrito (bold) das listagens';
