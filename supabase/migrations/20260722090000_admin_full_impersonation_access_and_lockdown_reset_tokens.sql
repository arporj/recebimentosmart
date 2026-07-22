-- 1) Paridade total de impersonação para admins.
--
-- A impersonação neste sistema é feita apenas no front-end (AuthContext.impersonateUser
-- troca o objeto `user` em memória, mas a sessão real no Supabase continua sendo a do
-- admin). Por isso, para o admin conseguir usar o sistema "como se fosse" o usuário
-- impersonado, cada tabela de dados operacionais do usuário precisa de uma policy que
-- libere todas as operações (não só SELECT) para quem tem profiles.is_admin = true,
-- independentemente de quem seja o dono da linha.
--
-- Antes desta migração, várias tabelas só tinham bypass de SELECT para admin
-- (clients, payments, financial_*, transaction_tags, client_shares, profiles), e outras
-- não tinham bypass nenhum (custom_fields, client_custom_field_values,
-- client_notification_settings, notifications, referral_credits, referrals,
-- payment_transactions, pix_transactions, user_transaction_usage) — nesses casos a
-- impersonação simplesmente não mostrava nada, pois o RLS barrava com base no
-- auth.uid() real (o admin), não no usuário impersonado.

DROP POLICY IF EXISTS "Admins can view all clients" ON public.clients;
CREATE POLICY "Admins can manage all clients"
    ON public.clients FOR ALL
    USING (fn_is_admin())
    WITH CHECK (fn_is_admin());

DROP POLICY IF EXISTS "Admins can view all payments" ON public.payments;
CREATE POLICY "Admins can manage all payments"
    ON public.payments FOR ALL
    USING (is_admin(auth.uid()))
    WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can view all financial transactions" ON public.financial_transactions;
CREATE POLICY "Admins can manage all financial transactions"
    ON public.financial_transactions FOR ALL
    USING (fn_is_admin())
    WITH CHECK (fn_is_admin());

DROP POLICY IF EXISTS "Admins can view all financial accounts" ON public.financial_accounts;
CREATE POLICY "Admins can manage all financial accounts"
    ON public.financial_accounts FOR ALL
    USING (fn_is_admin())
    WITH CHECK (fn_is_admin());

DROP POLICY IF EXISTS "Admins can view all financial categories" ON public.financial_categories;
CREATE POLICY "Admins can manage all financial categories"
    ON public.financial_categories FOR ALL
    USING (fn_is_admin())
    WITH CHECK (fn_is_admin());

DROP POLICY IF EXISTS "Admins can view all financial tags" ON public.financial_tags;
CREATE POLICY "Admins can manage all financial tags"
    ON public.financial_tags FOR ALL
    USING (fn_is_admin())
    WITH CHECK (fn_is_admin());

DROP POLICY IF EXISTS "Admins can view all transaction tags" ON public.transaction_tags;
CREATE POLICY "Admins can manage all transaction tags"
    ON public.transaction_tags FOR ALL
    USING (fn_is_admin())
    WITH CHECK (fn_is_admin());

DROP POLICY IF EXISTS "Admins can view all client shares" ON public.client_shares;
CREATE POLICY "Admins can manage all client shares"
    ON public.client_shares FOR ALL
    USING (fn_is_admin())
    WITH CHECK (fn_is_admin());

DROP POLICY IF EXISTS "Allow admins to read all profiles" ON public.profiles;
CREATE POLICY "Admins can manage all profiles"
    ON public.profiles FOR ALL
    USING (is_admin(auth.uid()))
    WITH CHECK (is_admin(auth.uid()));

-- Tabelas que não tinham NENHUM bypass de admin (a lacuna reportada pelo usuário,
-- que notou campos personalizados sumindo ao impersonar).
CREATE POLICY "Admins can manage all custom fields"
    ON public.custom_fields FOR ALL
    USING (fn_is_admin())
    WITH CHECK (fn_is_admin());

CREATE POLICY "Admins can manage all client custom field values"
    ON public.client_custom_field_values FOR ALL
    USING (fn_is_admin())
    WITH CHECK (fn_is_admin());

CREATE POLICY "Admins can manage all client notification settings"
    ON public.client_notification_settings FOR ALL
    USING (fn_is_admin())
    WITH CHECK (fn_is_admin());

CREATE POLICY "Admins can manage all notifications"
    ON public.notifications FOR ALL
    USING (fn_is_admin())
    WITH CHECK (fn_is_admin());

CREATE POLICY "Admins can manage all referral credits"
    ON public.referral_credits FOR ALL
    USING (fn_is_admin())
    WITH CHECK (fn_is_admin());

CREATE POLICY "Admins can manage all referrals"
    ON public.referrals FOR ALL
    USING (fn_is_admin())
    WITH CHECK (fn_is_admin());

CREATE POLICY "Admins can manage all payment transactions"
    ON public.payment_transactions FOR ALL
    USING (fn_is_admin())
    WITH CHECK (fn_is_admin());

CREATE POLICY "Admins can manage all pix transactions"
    ON public.pix_transactions FOR ALL
    USING (fn_is_admin())
    WITH CHECK (fn_is_admin());

CREATE POLICY "Admins can manage all user transaction usage"
    ON public.user_transaction_usage FOR ALL
    USING (fn_is_admin())
    WITH CHECK (fn_is_admin());

-- 2) Bloqueio crítico: password_reset_tokens estava com SELECT/INSERT/DELETE liberados
-- para os papéis anon + authenticated (USING (true)), permitindo que qualquer pessoa —
-- sem estar logada — lesse ou apagasse tokens de redefinição de senha de qualquer
-- conta via API pública do PostgREST (risco de takeover de conta). O fluxo legítimo
-- (server/lib/passwordResetService.js) já usa a service_role key, que sempre ignora
-- RLS (rolbypassrls = true) — então remover as policies abertas não quebra nada.
DROP POLICY IF EXISTS "Enable read access for all users" ON public.password_reset_tokens;
DROP POLICY IF EXISTS "Enable inserts for authenticated users only" ON public.password_reset_tokens;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.password_reset_tokens;
