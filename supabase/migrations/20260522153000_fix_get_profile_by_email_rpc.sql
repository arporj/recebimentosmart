-- Migração para corrigir RPC de busca de perfil por e-mail com DROP FUNCTION prévio
-- Permite validar se o e-mail de um usuário existe antes de realizar o compartilhamento de dados

-- Dropar a função caso já exista para evitar conflito de tipo de retorno
DROP FUNCTION IF EXISTS public.get_profile_by_email(text);

CREATE OR REPLACE FUNCTION public.get_profile_by_email(email_input text)
RETURNS TABLE (id uuid, name text) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.name
  FROM profiles p
  WHERE lower(p.email) = lower(email_input)
  LIMIT 1;
END;
$$;

-- Concedendo permissão explicita para usuários autenticados usarem a RPC
REVOKE EXECUTE ON FUNCTION public.get_profile_by_email(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_profile_by_email(text) TO authenticated;
