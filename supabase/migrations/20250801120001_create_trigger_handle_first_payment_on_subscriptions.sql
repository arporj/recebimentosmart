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

create trigger on_new_subscription_trigger
after insert on public.subscriptions
for each row
execute procedure public.handle_new_subscription();
