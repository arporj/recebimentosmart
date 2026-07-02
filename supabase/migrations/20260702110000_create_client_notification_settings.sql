-- Migration: Cria tabela client_notification_settings
-- Suporta 3 níveis de configuração: global (client_id NULL), por cliente, por lançamento

CREATE TABLE IF NOT EXISTS public.client_notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- NULL = configuração global do usuário; preenchido = configuração específica do cliente
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  
  -- Modo de notificação:
  -- 'global'          → usa o dia do mês definido em notify_day_of_month (configuração global)
  -- 'fixed_day'       → dia fixo do mês por cliente (notify_day_of_month)
  -- 'based_on_due'    → baseado na data de vencimento de cada lançamento
  notification_mode TEXT NOT NULL DEFAULT 'global'
    CHECK (notification_mode IN ('global', 'fixed_day', 'based_on_due')),
  
  -- Dia do mês para envio (1–28). Usado em modos 'global' e 'fixed_day'
  notify_day_of_month INT CHECK (notify_day_of_month BETWEEN 1 AND 28),
  
  -- Modo baseado no vencimento:
  -- 'on_due'          → apenas no dia do vencimento
  -- 'full_cycle'      → antes + no dia + depois
  notification_strategy TEXT NOT NULL DEFAULT 'on_due'
    CHECK (notification_strategy IN ('on_due', 'full_cycle')),
  
  -- Para estratégia 'full_cycle': quantos dias antes do vencimento enviar
  notify_before_days INT DEFAULT 3 CHECK (notify_before_days >= 0),
  
  -- Para estratégia 'full_cycle': quantos dias após o vencimento enviar aviso de atraso
  notify_after_days INT DEFAULT 3 CHECK (notify_after_days >= 0),
  
  -- Se a notificação está ativa para este nível
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Um usuário pode ter apenas uma configuração global (client_id NULL) e uma por cliente
  CONSTRAINT unique_user_global_setting UNIQUE (user_id, client_id)
);

COMMENT ON TABLE public.client_notification_settings IS 'Configurações de notificação por e-mail para clientes. client_id NULL = config global do usuário.';
COMMENT ON COLUMN public.client_notification_settings.notification_mode IS 'global: usa dia fixo global | fixed_day: dia fixo por cliente | based_on_due: relativo ao vencimento';
COMMENT ON COLUMN public.client_notification_settings.notification_strategy IS 'on_due: só no vencimento | full_cycle: antes + no dia + aviso de atraso';

-- Índices
CREATE INDEX IF NOT EXISTS idx_client_notif_user ON public.client_notification_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_client_notif_client ON public.client_notification_settings(client_id);

-- RLS
ALTER TABLE public.client_notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own notification settings"
  ON public.client_notification_settings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trigger: atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION public.touch_client_notification_settings()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_touch_client_notif_settings
  BEFORE UPDATE ON public.client_notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_client_notification_settings();
