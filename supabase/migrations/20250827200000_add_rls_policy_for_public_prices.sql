-- Migration: Adiciona uma política de RLS para permitir acesso público aos preços dos planos.
--
-- Motivo:
-- A Landing Page precisa buscar os preços dos planos para exibi-los a visitantes
-- não autenticados. Esta política abre o acesso de leitura APENAS para as chaves de preço.

CREATE POLICY "Allow public read access to plan prices"
ON public.app_settings
FOR SELECT
USING (key IN ('price_basico', 'price_pro', 'price_premium'));
