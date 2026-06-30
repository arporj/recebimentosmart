-- Adiciona coluna dashboard_widgets para salvar a preferência de visibilidade dos widgets de relatórios do usuário
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS dashboard_widgets jsonb DEFAULT '{"fluxoCaixaAcumulado":true,"resultadosCaixa":true,"balancoPatrimonial":true,"receitasCategoria":true,"despesasCategoria":true}'::jsonb;
