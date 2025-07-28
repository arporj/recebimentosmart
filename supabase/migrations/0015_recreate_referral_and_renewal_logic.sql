-- supabase/migrations/0015_recreate_referral_and_renewal_logic.sql

-- 1. Tabela para rastrear o status das indicações
CREATE TABLE IF NOT EXISTS public.referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id UUID NOT NULL REFERENCES public.profiles(id),
    referred_id UUID NOT NULL REFERENCES public.profiles(id),
    is_converted BOOLEAN DEFAULT FALSE, -- Se o indicado pagou pelo menos uma vez
    is_used_for_renewal BOOLEAN DEFAULT FALSE, -- Se a indicação já foi usada para renovação
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Função para processar as renovações de assinatura
CREATE OR REPLACE FUNCTION public.process_subscription_renewals()
RETURNS VOID AS $$
DECLARE
    user_record RECORD;
    renewal_count INT;
BEGIN
    -- Itera sobre todos os usuários cuja assinatura está expirada ou expira hoje
    FOR user_record IN SELECT id FROM public.profiles WHERE valid_until <= NOW() LOOP
        -- Conta quantas indicações convertidas e não utilizadas o usuário tem
        SELECT COUNT(*) INTO renewal_count
        FROM public.referrals r
        WHERE r.referrer_id = user_record.id
          AND r.is_converted = TRUE -- Apenas indicações convertidas (primeiro pagamento)
          AND r.is_used_for_renewal = FALSE;

        -- Se tiver 5 ou mais indicações, renova a assinatura
        IF renewal_count >= 5 THEN
            -- Atualiza a data de validade para 1 mês no futuro
            UPDATE public.profiles
            SET valid_until = valid_until + INTERVAL '1 month'
            WHERE id = user_record.id;

            -- Marca 5 das indicações como utilizadas
            WITH used_referrals AS (
                SELECT id FROM public.referrals
                WHERE referrer_id = user_record.id
                  AND is_converted = TRUE
                  AND is_used_for_renewal = FALSE
                LIMIT 5
            )
            UPDATE public.referrals
            SET is_used_for_renewal = TRUE
            WHERE id IN (SELECT id FROM used_referrals);
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 3. Função para marcar uma indicação como convertida no primeiro pagamento de ASSINATURA
CREATE OR REPLACE FUNCTION public.handle_new_subscription_payment()
RETURNS TRIGGER AS $$
BEGIN
    -- Verifica se este é o primeiro pagamento de assinatura do usuário
    IF NOT EXISTS (SELECT 1 FROM public.subscriptions WHERE user_id = NEW.user_id AND id != NEW.id) THEN
        -- Se for o primeiro pagamento de assinatura, marca a indicação como convertida
        UPDATE public.referrals
        SET is_converted = TRUE
        WHERE referred_id = NEW.user_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Trigger para chamar handle_new_subscription_payment após cada novo pagamento de ASSINATURA
DROP TRIGGER IF EXISTS on_new_payment ON public.payments; -- Remove o trigger antigo
DROP TRIGGER IF EXISTS on_new_subscription_payment ON public.subscriptions;
CREATE TRIGGER on_new_subscription_payment
AFTER INSERT ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.handle_new_subscription_payment();

-- 5. Agendamento da função (Cron Job)
-- Isso precisa ser configurado no painel do Supabase em "Database" -> "Cron Jobs"
-- Nome: Renovação Diária de Assinaturas
-- Schedule: 0 0 * * * (todos os dias à meia-noite UTC)
-- Function: process_subscription_renewals
