-- Migration: Tabelas de memória e histórico do Artie (Assistente IA Agêntico)
-- Criado em: 2026-07-03

-- ========================================================
-- Tabela: artie_messages
-- Armazena o histórico completo de conversas do usuário com o Artie.
-- Apenas as últimas N mensagens são enviadas para a IA (sliding window),
-- mas o histórico completo fica aqui para exibição na UI.
-- ========================================================
CREATE TABLE IF NOT EXISTS public.artie_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id    UUID NOT NULL,           -- Agrupa mensagens de uma conversa contínua
  role          TEXT NOT NULL CHECK (role IN ('user', 'model')),
  content       TEXT NOT NULL,
  tool_call     JSONB,                   -- Payload do tool_call emitido pelo Gemini (se houver)
  tool_result   JSONB,                   -- Resultado da execução da tool (se houver)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.artie_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own artie messages"
  ON public.artie_messages
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS artie_messages_user_session_idx
  ON public.artie_messages (user_id, session_id, created_at DESC);

-- ========================================================
-- Tabela: artie_user_memory
-- Armazena a memória semântica compacta do usuário:
-- padrões de gasto, limites configurados por categoria,
-- tom de conversa preferido, etc.
-- É enviada ao Gemini em cada turno como contexto de perfil.
-- ========================================================
CREATE TABLE IF NOT EXISTS public.artie_user_memory (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Tom de conversa preferido
  conversation_tone     TEXT NOT NULL DEFAULT 'normal'
                          CHECK (conversation_tone IN ('casual', 'normal', 'tecnico')),

  -- Limites de orçamento por categoria (JSON: { "categoria_id": limite_mensal })
  budget_limits         JSONB NOT NULL DEFAULT '{}',

  -- Médias de gasto históricas por categoria (JSON: { "categoria_id": media_mensal })
  -- Atualizado assincronamente por job periódico
  spending_averages     JSONB NOT NULL DEFAULT '{}',

  -- Preferências de alertas proativos
  proactive_alerts      BOOLEAN NOT NULL DEFAULT true,
  alert_threshold_pct   INTEGER NOT NULL DEFAULT 20, -- Alerta quando gastar X% acima do limite

  -- Metadata
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.artie_user_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own artie memory"
  ON public.artie_user_memory
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION public.update_artie_memory_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER artie_memory_updated_at
  BEFORE UPDATE ON public.artie_user_memory
  FOR EACH ROW EXECUTE FUNCTION public.update_artie_memory_timestamp();

-- Comentários de documentação
COMMENT ON TABLE public.artie_messages IS
  'Histórico completo de conversas com o Artie (IA). Apenas últimas 15 mensagens são enviadas à IA por turno (sliding window).';

COMMENT ON TABLE public.artie_user_memory IS
  'Memória semântica compacta do usuário para o Artie. Enviada como contexto em cada turno da conversa.';
