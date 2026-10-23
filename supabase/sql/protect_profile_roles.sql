-- Run as the database owner in Supabase SQL Editor (existing installations too).
begin;

-- SECURITY DEFINER avoids recursive RLS when a profiles policy asks is_admin.
-- Bind the check to the caller; a client cannot test another user's role.
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select uid = (select auth.uid()) and exists (
    select 1 from public.profiles p where p.id = uid and p.role = 'admin'
  );
$$;
revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated, service_role;

-- RLS restricts rows, not the columns inside those rows. Even a permissive
-- legacy profile-update/insert policy must not let a browser set its role.
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if new.role is distinct from 'user' then
        raise exception 'Profile roles are managed by the server' using errcode = '42501';
      end if;
    elsif new.role is distinct from old.role or new.id is distinct from old.id then
      raise exception 'Profile identity and role are managed by the server' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.protect_profile_role() from public;

drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role
before insert or update on public.profiles
for each row execute function public.protect_profile_role();

commit;
