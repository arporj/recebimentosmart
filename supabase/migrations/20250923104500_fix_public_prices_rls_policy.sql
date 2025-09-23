-- Migration: Corrige a criação da política RLS para preços públicos para evitar erro de "already exists"

DROP POLICY IF EXISTS "Allow public read access to plan prices" ON public.app_settings;
CREATE POLICY "Allow public read access to plan prices"
ON public.app_settings
FOR SELECT
USING (key IN ('price_basico', 'price_pro', 'price_premium'));
