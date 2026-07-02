-- Migration: Adiciona campo is_default à tabela financial_accounts
-- Permite marcar uma conta como "conta principal" do usuário

ALTER TABLE public.financial_accounts
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.financial_accounts.is_default IS 'Indica se esta é a conta padrão/principal do usuário para novos lançamentos de clientes';

-- Garante que apenas uma conta por usuário seja marcada como padrão via trigger
CREATE OR REPLACE FUNCTION public.ensure_single_default_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Se estamos marcando uma conta como padrão, remove o padrão das outras contas do mesmo usuário
  IF NEW.is_default = true THEN
    UPDATE public.financial_accounts
    SET is_default = false
    WHERE user_id = NEW.user_id
      AND id <> NEW.id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_single_default_account ON public.financial_accounts;
CREATE TRIGGER trg_ensure_single_default_account
  BEFORE INSERT OR UPDATE OF is_default
  ON public.financial_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_single_default_account();
