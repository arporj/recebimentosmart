-- Migration: Adiciona o plano 'Trial' e o define como padrão para novos usuários
--
-- Motivo:
-- Precisamos de uma forma clara de identificar usuários em período de teste.
-- Esta migração adapta a estrutura existente da coluna 'plano' na tabela 'profiles'
-- para suportar este novo estado.

-- 1. Adiciona 'trial' como um valor possível para o tipo de plano ENUM.
-- Usamos 'IF NOT EXISTS' para tornar o script repetível sem erros caso já tenha sido aplicado.
ALTER TYPE public.plan_type ADD VALUE IF NOT EXISTS 'trial';

-- 2. Altera o valor padrão da coluna 'plano' para 'trial'.
-- Isso garante que novos perfis criados comecem com o plano 'trial' por padrão.
ALTER TABLE public.profiles
ALTER COLUMN plano SET DEFAULT 'trial';

-- 3. Atualiza o comentário da coluna para refletir a mudança para referência futura.
COMMENT ON COLUMN public.profiles.plano IS 'O plano de assinatura atual do usuário. O padrão para novos usuários é "trial".';
