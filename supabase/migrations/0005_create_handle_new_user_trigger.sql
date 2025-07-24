-- supabase/migrations/0005_create_handle_new_user_trigger.sql

-- 1. Cria a função `handle_new_user` que será chamada pelo trigger.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, valid_until)
  values (
    new.id,
    new.raw_user_meta_data->>'name',
    (new.raw_user_meta_data->>'valid_until')::timestamptz
  );
  return new;
end;
$$;

-- 2. Cria o trigger que é acionado após cada novo usuário ser criado.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
