-- Migration to create RPC function for registering manual payments
-- This function handles the logic of extending user subscription based on payment

CREATE OR REPLACE FUNCTION public.register_manual_payment(
    p_user_id UUID,
    p_payment_date TIMESTAMP WITH TIME ZONE,
    p_amount DECIMAL,
    p_plan_name TEXT,
    p_credits_used INTEGER DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_valid_until TIMESTAMP WITH TIME ZONE;
    v_new_valid_until TIMESTAMP WITH TIME ZONE;
    v_result JSON;
BEGIN
    -- Check if executor is admin
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Access denied. Only admins can register manual payments.';
    END IF;

    -- Get current valid_until from profiles
    SELECT valid_until INTO v_current_valid_until
    FROM public.profiles
    WHERE id = p_user_id;

    -- Calculate new valid_until
    -- Logic:
    -- a) if current valid_until is in the past (or null), add 1 month to TODAY
    -- b) if current valid_until is in the future (or today), add 1 month to current valid_until
    
    IF v_current_valid_until IS NULL OR v_current_valid_until < NOW() THEN
        v_new_valid_until := NOW() + INTERVAL '1 month';
    ELSE
        v_new_valid_until := v_current_valid_until + INTERVAL '1 month';
    END IF;

    -- Update profile
    UPDATE public.profiles
    SET 
        valid_until = v_new_valid_until,
        plano = p_plan_name,
        updated_at = NOW()
    WHERE id = p_user_id;

    -- Deduct credits if used
    IF p_credits_used > 0 THEN
        WITH credits_to_update AS (
            SELECT id FROM public.referral_credits
            WHERE referrer_user_id = p_user_id AND status = 'credited'
            LIMIT p_credits_used
        )
        UPDATE public.referral_credits
        SET status = 'redeemed'
        WHERE id IN (SELECT id FROM credits_to_update);
    END IF;

    -- Insert into payments table for history
    -- Using the existing 'payments' table structure
    INSERT INTO public.payments (
        user_id,
        amount,
        status,
        payment_date,
        payment_method,
        reference_id -- Using manual reference
    ) VALUES (
        p_user_id,
        p_amount, -- This is the actual paid amount (plan price - credits)
        'completed',
        p_payment_date,
        'manual_pix',
        'MANUAL_' || to_char(NOW(), 'YYYYMMDDHH24MISS')
    );

    v_result := json_build_object(
        'success', true,
        'new_valid_until', v_new_valid_until
    );

    RETURN v_result;

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;