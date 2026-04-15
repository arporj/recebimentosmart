-- Migração para adicionar informações de Instituição Bancária e Bandeira de Cartão
-- Adiciona colunas para identificar o banco, o ícone e a bandeira do cartão

ALTER TABLE public.financial_accounts
ADD COLUMN bank_name TEXT, -- Nome da instituição (ex: Banco Inter, Nubank, XP)
ADD COLUMN bank_icon TEXT, -- Slug ou URL do ícone da instituição
ADD COLUMN card_brand TEXT; -- Bandeira do cartão (ex: visa, mastercard, elo, amex)

COMMENT ON COLUMN public.financial_accounts.bank_name IS 'Nome do banco ou corretora vinculado à conta';
COMMENT ON COLUMN public.financial_accounts.bank_icon IS 'Slug ou identificador do ícone do banco';
COMMENT ON COLUMN public.financial_accounts.card_brand IS 'Bandeira do cartão (visa, mastercard, elo, amex, etc)';
