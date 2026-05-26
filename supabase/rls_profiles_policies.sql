-- Profiles + RLS policies for DigitBox

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid and p.role = 'admin'
  );
$$;

-- Keep updated_at fresh.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute procedure public.touch_updated_at();

-- Users can read/update their own profile. Admins can read all profiles.
drop policy if exists "profiles_read_own_or_admin" on public.profiles;
create policy "profiles_read_own_or_admin"
on public.profiles
for select
to authenticated
using (auth.uid() = id or public.is_admin(auth.uid()));

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id and role in ('admin','user'));

-- Optional profile bootstrap via auth trigger.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'user')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.posts enable row level security;
alter table public.projects enable row level security;
alter table public.gallery_images enable row level security;
alter table public.project_saves enable row level security;

-- Public reads for content tables.
drop policy if exists "posts_read_public" on public.posts;
create policy "posts_read_public" on public.posts
for select
using (true);

drop policy if exists "projects_read_public" on public.projects;
create policy "projects_read_public" on public.projects
for select
using (true);

drop policy if exists "gallery_images_read_public" on public.gallery_images;
create policy "gallery_images_read_public" on public.gallery_images
for select
using (true);

-- Admin-only writes for content tables.
drop policy if exists "posts_admin_write" on public.posts;
create policy "posts_admin_write" on public.posts
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "projects_admin_write" on public.projects;
create policy "projects_admin_write" on public.projects
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "gallery_images_admin_write" on public.gallery_images;
create policy "gallery_images_admin_write" on public.gallery_images
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

-- Users can only see/write their own save records.
drop policy if exists "project_saves_read_own" on public.project_saves;
create policy "project_saves_read_own" on public.project_saves
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "project_saves_write_own" on public.project_saves;
create policy "project_saves_write_own" on public.project_saves
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Policy behavior test guide (run in SQL editor with admin/non-admin JWTs):
-- 1) As admin: insert/update/delete on posts/projects/gallery_images should succeed.
-- 2) As non-admin: insert/update/delete on posts/projects/gallery_images should fail.
-- 3) As anon/authenticated: select from posts/projects/gallery_images should succeed.
-- 4) As non-admin user A: upsert/select on project_saves where user_id = A should succeed.
-- 5) As non-admin user A: select/update/delete on project_saves where user_id = B should fail.
