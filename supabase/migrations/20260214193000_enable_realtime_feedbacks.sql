-- Enable Realtime for feedbacks and feedback_messages
-- This is often enabled by default but good to ensure
alter publication supabase_realtime add table public.feedbacks;
alter publication supabase_realtime add table public.feedback_messages;

-- Set REPLICA IDENTITY to FULL to ensure we get all columns in updates/deletes if needed
-- (Optional but helpful for robust realtime updates)
ALTER TABLE public.feedbacks REPLICA IDENTITY FULL;
ALTER TABLE public.feedback_messages REPLICA IDENTITY FULL;
