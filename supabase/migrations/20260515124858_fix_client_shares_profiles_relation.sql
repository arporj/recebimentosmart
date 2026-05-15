-- Fix client_shares_sender_id_fkey to reference public.profiles(id) instead of auth.users(id)
-- This enables PostgREST to resolve the relation for join selects in the API

ALTER TABLE public.client_shares 
    DROP CONSTRAINT IF EXISTS client_shares_sender_id_fkey;

ALTER TABLE public.client_shares 
    ADD CONSTRAINT client_shares_sender_id_fkey 
    FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
