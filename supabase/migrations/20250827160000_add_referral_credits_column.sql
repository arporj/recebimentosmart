-- Migration: Adiciona a coluna `referral_credits` na tabela `profiles`
--
-- Motivo:
-- Precisamos de um local para armazenar o valor de desconto em BRL que um usuário
-- acumula através de indicações. Esta coluna servirá como a "carteira de créditos" do usuário.

ALTER TABLE public.profiles
ADD COLUMN referral_credits NUMERIC(10, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.profiles.referral_credits IS 'Créditos acumulados por indicação, em BRL, para serem usados como desconto na próxima fatura.';
