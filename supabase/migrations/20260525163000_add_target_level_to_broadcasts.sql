-- Adicionar novas colunas na tabela email_broadcasts para suporte a filtros de assinatura
ALTER TABLE public.email_broadcasts ADD COLUMN IF NOT EXISTS target_level text DEFAULT 'all';
ALTER TABLE public.email_broadcasts ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Comentários informativos para a estrutura da base de dados
COMMENT ON COLUMN public.email_broadcasts.target_level IS 'Nível de assinatura alvo para o disparo: all, basico, pro, premium, me';
COMMENT ON COLUMN public.email_broadcasts.created_by IS 'ID do administrador que iniciou o disparo de e-mails';
