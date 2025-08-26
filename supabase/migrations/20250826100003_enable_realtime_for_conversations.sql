-- Enable Realtime for conversations
ALTER TABLE conversations REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;

COMMENT ON TABLE conversations IS 'Stores chat conversations between users and admins. [REALTIME ENABLED]';
