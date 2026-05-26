-- Migration: Cria a função `update_user_subscription` corrigida (V2).
--
-- Motivo:
-- Corrige a lógica de renovação da validade do plano do usuário.
-- Adiciona exatamente 1 mês (interval '1 month') em vez de 31 dias fixos.
-- Caso o usuário possua uma validade futura (valid_until > now()), o novo vencimento 
-- é acrescido em 1 mês a partir do vencimento atual (pagamento antecipado cumulativo).
-- Caso a validade esteja expirada ou seja nula, o acréscimo de 1 mês é feito a partir de agora (now()).

CREATE OR REPLACE FUNCTION public.update_user_subscription(p_user_id UUID, p_plan_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    current_valid_until TIMESTAMPTZ;
BEGIN
    -- Busca a validade atual
    SELECT valid_until INTO current_valid_until
    FROM public.profiles
    WHERE id = p_user_id;

    -- Se a validade atual for futura, adiciona 1 mês a partir dela
    -- Caso contrário, adiciona 1 mês a partir de agora (now())
    IF current_valid_until IS NOT NULL AND current_valid_until > now() THEN
        UPDATE public.profiles
        SET
            plan = p_plan_name,
            valid_until = current_valid_until + interval '1 month'
        WHERE id = p_user_id;
    ELSE
        UPDATE public.profiles
        SET
            plan = p_plan_name,
            valid_until = now() + interval '1 month'
        WHERE id = p_user_id;
    END IF;
END;
$$;
