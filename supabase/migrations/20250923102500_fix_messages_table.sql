-- Migration: Corrige a criação da tabela messages e seus índices para evitar erro de "already exists"

CREATE TABLE IF NOT EXISTS messages (
    id BIGSERIAL PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);

-- Enable Realtime
ALTER TABLE messages REPLICA IDENTITY FULL;
-- ALTER PUBLICATION supabase_realtime ADD TABLE messages; -- Removido para evitar erro de "already exists"

-- Comments
COMMENT ON TABLE messages IS 'Stores individual chat messages within a conversation.';
COMMENT ON COLUMN messages.sender_id IS 'The user who sent the message.';