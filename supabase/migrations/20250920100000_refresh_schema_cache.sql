-- Migration: Força a atualização do cache do esquema do Supabase
-- Motivo: O cache do esquema parece estar obsoleto, causando erros "Could not find the function".
-- Adicionar um comentário a uma função é uma maneira de notificar o PostgREST para recarregar o esquema.

COMMENT ON FUNCTION public.admin_create_user_profile(UUID, TEXT, public.plan_type, TIMESTAMPTZ) IS 'Função para administradores criarem perfis de usuário, contornando as políticas RLS. Atualização para forçar a atualização do cache do esquema.';