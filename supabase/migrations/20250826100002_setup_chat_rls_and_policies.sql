-- Enable RLS for conversations table
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Policies for conversations
CREATE POLICY "Users can view their own conversations." ON conversations
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own conversations." ON conversations
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins have full access to conversations." ON conversations
    FOR ALL USING (public.is_admin(auth.uid()));

-- Enable RLS for messages table
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Policies for messages
CREATE POLICY "Users can view messages in their own conversations." ON messages
    FOR SELECT USING (conversation_id IN (SELECT id FROM conversations WHERE user_id = auth.uid()));

CREATE POLICY "Users can send messages in their own conversations." ON messages
    FOR INSERT WITH CHECK (
        (sender_id = auth.uid()) AND
        (conversation_id IN (SELECT id FROM conversations WHERE user_id = auth.uid() AND status = 'open'))
    );

CREATE POLICY "Admins have full access to messages." ON messages
    FOR ALL USING (public.is_admin(auth.uid()));
