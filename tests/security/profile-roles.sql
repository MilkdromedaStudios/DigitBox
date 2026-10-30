-- Run after protect_profile_roles.sql in a disposable PostgreSQL test database.
-- Wrap in a transaction and roll back: no real profiles are changed.
begin;

-- Test fixture needs these two auth users to already exist. The automated
-- PostgreSQL harness creates them with these fixed, non-production UUIDs.
insert into public.profiles (id, role) values
  ('11111111-1111-1111-1111-111111111111', 'user'),
  ('22222222-2222-2222-2222-222222222222', 'admin');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

do $$
begin
  begin
    update public.profiles set role = 'admin'
    where id = '11111111-1111-1111-1111-111111111111';
    raise exception 'FAIL: user promoted their own account';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set id = '33333333-3333-3333-3333-333333333333'
    where id = '11111111-1111-1111-1111-111111111111';
    raise exception 'FAIL: user changed protected identity';
  exception when insufficient_privilege then null;
  end;
  if public.is_admin('11111111-1111-1111-1111-111111111111') then
    raise exception 'FAIL: normal user considered an admin';
  end if;
  if public.is_admin('22222222-2222-2222-2222-222222222222') then
    raise exception 'FAIL: caller can query another account role';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$
begin
  if not public.is_admin('22222222-2222-2222-2222-222222222222') then
    raise exception 'FAIL: legitimate admin rejected';
  end if;
end;
$$;

reset role;
-- A trusted server/database administrator can still provision roles.
update public.profiles set role = 'admin'
where id = '11111111-1111-1111-1111-111111111111';

rollback;
