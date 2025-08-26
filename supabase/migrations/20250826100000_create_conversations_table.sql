CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'open' -- open, closed
);

-- Indexes
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_status ON conversations(status);

-- Comments
COMMENT ON TABLE conversations IS 'Stores chat conversations between users and admins.';
COMMENT ON COLUMN conversations.status IS 'The current status of the conversation, e.g., open or closed.';
