-- Migration: preferência de grupos colapsados no card de contas + garante que sempre
-- exista uma conta principal (is_default) quando o usuário tiver ao menos uma conta.

-- Preferência de UI: quais grupos de tipo de conta (checking/savings/investment) estão colapsados
-- no card de resumo da tela de Lançamentos. Guardado no perfil (não em localStorage) para
-- sincronizar entre dispositivos, seguindo o mesmo padrão de dashboard_widgets.
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS collapsed_account_groups jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Backfill: garante que todo usuário que já tem conta, mas nenhuma marcada como principal,
-- passe a ter a mais antiga marcada como is_default = true.
WITH ranked AS (
  SELECT id, user_id,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC) AS rn
  FROM public.financial_accounts
),
users_without_default AS (
  SELECT DISTINCT user_id
  FROM public.financial_accounts
  GROUP BY user_id
  HAVING bool_or(is_default) = false
)
UPDATE public.financial_accounts fa
SET is_default = true
FROM ranked
WHERE fa.id = ranked.id
  AND ranked.rn = 1
  AND ranked.user_id IN (SELECT user_id FROM users_without_default);

-- Trigger: força a primeira conta de um usuário a nascer como principal.
CREATE OR REPLACE FUNCTION public.force_default_on_first_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.financial_accounts WHERE user_id = NEW.user_id
  ) THEN
    NEW.is_default := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_force_default_on_first_account ON public.financial_accounts;
CREATE TRIGGER trg_force_default_on_first_account
  BEFORE INSERT
  ON public.financial_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.force_default_on_first_account();

-- Trigger: bloqueia desmarcar a conta principal quando ela é a única conta do usuário.
CREATE OR REPLACE FUNCTION public.block_unset_only_default_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_default = true AND NEW.is_default = false THEN
    IF (SELECT COUNT(*) FROM public.financial_accounts WHERE user_id = NEW.user_id) = 1 THEN
      RAISE EXCEPTION 'Não é possível desmarcar a conta principal: esta é a única conta cadastrada.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_unset_only_default_account ON public.financial_accounts;
CREATE TRIGGER trg_block_unset_only_default_account
  BEFORE UPDATE OF is_default
  ON public.financial_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.block_unset_only_default_account();

-- Trigger: ao excluir a conta principal, promove automaticamente a mais antiga
-- das contas restantes do usuário para manter a invariante "sempre há uma conta principal".
CREATE OR REPLACE FUNCTION public.promote_default_after_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_default = true THEN
    UPDATE public.financial_accounts
    SET is_default = true
    WHERE id = (
      SELECT id FROM public.financial_accounts
      WHERE user_id = OLD.user_id
      ORDER BY created_at ASC
      LIMIT 1
    );
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_promote_default_after_delete ON public.financial_accounts;
CREATE TRIGGER trg_promote_default_after_delete
  AFTER DELETE
  ON public.financial_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.promote_default_after_delete();
