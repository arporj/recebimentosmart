-- Adiciona a coluna sidebar_desktop_collapsed à tabela profiles
-- Se false (padrão), a sidebar do desktop ficará fixa na lateral esquerda.
-- Se true, a sidebar ficará colapsada (drawer deslizante).

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS sidebar_desktop_collapsed boolean DEFAULT false;
