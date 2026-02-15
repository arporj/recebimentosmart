-- Drop the trigger and function for feedback notifications as we moved to client-side calls
DROP TRIGGER IF EXISTS on_new_feedback_created ON public.feedbacks;
DROP FUNCTION IF EXISTS public.handle_new_feedback_notification();
