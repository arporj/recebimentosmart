-- supabase/migrations/0019_sync_referral_credits.sql

-- Função para sincronizar a tabela referral_credits com base em referrals
CREATE OR REPLACE FUNCTION public.sync_referral_credits_on_conversion()
RETURNS TRIGGER AS $$
BEGIN
    -- Verifica se a indicação foi convertida (primeiro pagamento)
    IF NEW.is_converted = TRUE AND OLD.is_converted = FALSE THEN
        -- Insere ou atualiza um registro em referral_credits
        INSERT INTO public.referral_credits (referred_user_id, referrer_user_id, status)
        VALUES (NEW.referred_id, NEW.referrer_id, 'credited')
        ON CONFLICT (referred_user_id, referrer_user_id) DO UPDATE
        SET status = 'credited';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para chamar a função após a atualização de um registro em referrals
DROP TRIGGER IF EXISTS on_referral_conversion ON public.referrals;
CREATE TRIGGER on_referral_conversion
AFTER UPDATE OF is_converted ON public.referrals
FOR EACH ROW EXECUTE FUNCTION public.sync_referral_credits_on_conversion();