-- Make legacy monthly_payment column nullable and default 0 on clients table
ALTER TABLE public.clients ALTER COLUMN monthly_payment DROP NOT NULL;
ALTER TABLE public.clients ALTER COLUMN monthly_payment SET DEFAULT 0;
