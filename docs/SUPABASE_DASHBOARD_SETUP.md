# Supabase Dashboard Setup

## 1) Environment variables (`.env.local`)

Add:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `GITHUB_TOKEN`
- `GITHUB_REPO_OWNER`
- `GITHUB_REPO_NAME`
- `GITHUB_REPO_BRANCH` (optional, defaults to `main`)

## 2) Create analytics table

Run in Supabase SQL editor:

```sql
create table if not exists public.project_analytics (
  project_slug text primary key,
  views integer not null default 0,
  opens integer not null default 0,
  updated_at timestamptz not null default now()
);
```

## 3) Create tracking RPC

```sql
create or replace function public.track_project_view(project_slug text)
returns void
language plpgsql
security invoker
as $$
begin
  insert into public.project_analytics(project_slug, views, opens, updated_at)
  values (project_slug, 1, 1, now())
  on conflict (project_slug)
  do update set
    views = public.project_analytics.views + 1,
    opens = public.project_analytics.opens + 1,
    updated_at = now();
end;
$$;
```

## 4) API access and RLS

Enable RLS and add policies appropriate for admins only, or keep table private and expose via secure server routes.

## 5) Website-side already wired

- Project runner sends `POST /api/projects/[slug]/track` on open.
- Analytics dashboard reads `project_analytics` from `/admin/analytics`.
- Admin project lane supports delete via `POST /api/content/delete`.
