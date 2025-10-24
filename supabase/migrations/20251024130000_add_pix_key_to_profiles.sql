-- Add pix_key column to profiles table
ALTER TABLE public.profiles
ADD COLUMN pix_key TEXT NULL;

-- Add a comment to the new column
COMMENT ON COLUMN public.profiles.pix_key IS 'Chave PIX do usuário para recebimento de pagamentos.';
