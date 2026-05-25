-- Adiciona política de RLS para leitura de transmissões de e-mail por administradores
CREATE POLICY "Admins can view email broadcasts" ON public.email_broadcasts
  FOR SELECT
  TO authenticated
  USING (
    (SELECT profiles.is_admin FROM profiles WHERE profiles.id = auth.uid()) = true
  );
