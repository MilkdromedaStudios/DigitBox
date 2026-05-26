-- Free-tier friendly game save config for Supabase.
-- Run this in SQL Editor after the base schema exists.

create table if not exists public.project_saves (
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  save_data jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, project_id)
);

alter table public.project_saves enable row level security;

create index if not exists idx_project_saves_updated_at
  on public.project_saves(updated_at desc);

create or replace function public.touch_project_save_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_project_saves_updated_at on public.project_saves;
create trigger trg_project_saves_updated_at
before update on public.project_saves
for each row
execute procedure public.touch_project_save_updated_at();

drop policy if exists "project_saves_read_own" on public.project_saves;
create policy "project_saves_read_own"
on public.project_saves
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "project_saves_insert_own" on public.project_saves;
create policy "project_saves_insert_own"
on public.project_saves
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "project_saves_update_own" on public.project_saves;
create policy "project_saves_update_own"
on public.project_saves
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "project_saves_delete_own" on public.project_saves;
create policy "project_saves_delete_own"
on public.project_saves
for delete
to authenticated
using (auth.uid() = user_id);
