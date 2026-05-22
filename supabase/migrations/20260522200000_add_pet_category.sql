-- Atualiza a função seed_default_categories para incluir a categoria 'Pet' para novos usuários
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
        (p_user_id, 'Pet', NULL, '🐾'),
        (p_user_id, 'Outros', NULL, '📦')
    ON CONFLICT (user_id, name, parent_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Adiciona a categoria 'Pet' para todos os usuários existentes no banco de dados
INSERT INTO public.financial_categories (user_id, name, parent_id, icon)
SELECT id, 'Pet', NULL, '🐾'
FROM auth.users
ON CONFLICT (user_id, name, parent_id) DO NOTHING;
