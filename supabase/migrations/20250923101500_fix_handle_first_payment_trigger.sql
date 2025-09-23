-- Migration: Corrige a criação do trigger on_new_subscription_trigger para evitar erro de "already exists"

create or replace function public.handle_new_subscription()
returns trigger as
$$
begin
  perform net.http_post(
    url:=current_setting('secrets.SUPABASE_URL', true) || '/functions/v1/handle-first-payment',
    body:=jsonb_build_object('record', new),
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('secrets.SUPABASE_SERVICE_ROLE_KEY', true)
    )
  );
  return new;
end;
$$
language plpgsql security definer;

DROP TRIGGER IF EXISTS on_new_subscription_trigger ON public.subscriptions;
create trigger on_new_subscription_trigger
after insert on public.subscriptions
for each row
execute procedure public.handle_new_subscription();
