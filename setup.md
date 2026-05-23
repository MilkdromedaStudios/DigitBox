# Supabase Setup Guide for DigitBox

This guide configures your app to:
- Use **Supabase Auth (email + password only)**.
- Let users log in without email verification (optional, less secure).
- Save and load posts, projects, gallery items, and per-user project saves.

## 1) Create your Supabase project

1. Go to https://supabase.com and create/select your project.
2. In **Project Settings → API**, copy:
   - **Project URL**
   - **anon public key**

## 2) Connect to your project from Supabase

In the Supabase dashboard, open your project and click **Connect** (top-right), then choose **Connect to your project**.

Use the **App Frameworks → Next.js** snippet to confirm the two values you need:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

> Tip: this is the fastest way to copy the exact environment-variable names and values for this app.

## 3) Add environment variables in Next.js

Create `.env.local` in your repo root:

```bash
NEXT_PUBLIC_SUPABASE_URL=YOUR_PROJECT_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

Restart your dev server after editing env vars.

## 4) Configure Auth (email/password only)

In Supabase dashboard:

1. Open **Authentication → Providers → Email**.
2. Enable **Email** provider.
3. Enable **Email + Password**.
4. Disable magic-link-only flows if you do not want them.
5. If you want no email verification:
   - Go to **Authentication settings** and disable **Confirm email**.

> ⚠️ Security note: disabling email verification is less secure and allows signups with unowned email addresses.

## 5) Run SQL setup

Open **SQL Editor** in Supabase and run the following script.

```sql
-- Extensions
create extension if not exists pgcrypto;

-- Profiles table (for roles/admin)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

-- Posts
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  image_url text,
  author text,
  author_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Projects
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  html_code text not null,
  likes integer not null default 0,
  author text,
  author_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Gallery images
create table if not exists public.gallery_images (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  image_url text not null,
  author text,
  author_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Per-user project saves
create table if not exists public.project_saves (
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  save_data jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, project_id)
);

-- Auto-create profile rows when a user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'user')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.projects enable row level security;
alter table public.gallery_images enable row level security;
alter table public.project_saves enable row level security;

-- Helpers
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role = 'admin'
  );
$$;

-- Profiles policies
create policy "Users can read own profile"
on public.profiles for select
using (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

-- Public read policies
create policy "Public read posts"
on public.posts for select using (true);

create policy "Public read projects"
on public.projects for select using (true);

create policy "Public read gallery"
on public.gallery_images for select using (true);

-- Admin write policies
create policy "Admin manage posts"
on public.posts for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy "Admin manage projects"
on public.projects for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy "Admin manage gallery"
on public.gallery_images for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

-- Project saves policies (users only for themselves)
create policy "User read own saves"
on public.project_saves for select
using (auth.uid() = user_id);

create policy "User insert own saves"
on public.project_saves for insert
with check (auth.uid() = user_id);

create policy "User update own saves"
on public.project_saves for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "User delete own saves"
on public.project_saves for delete
using (auth.uid() = user_id);
```

## 6) Set your admin user

After you sign up with your admin email, run this in SQL Editor:

```sql
update public.profiles
set role = 'admin'
where email = 'your-admin-email@example.com';
```

## 7) Create storage buckets

In **Storage**, create buckets:
- `post-images`
- `gallery-images`

Recommended bucket access:
- Public read: ON (if images should be visible publicly).
- Write/delete: restricted by storage policies to admins.

### Optional storage policies example

```sql
-- Example for post-images bucket
create policy "Public read post images"
on storage.objects for select
using (bucket_id = 'post-images');

create policy "Admin upload post images"
on storage.objects for insert
with check (
  bucket_id = 'post-images'
  and public.is_admin(auth.uid())
);

create policy "Admin delete post images"
on storage.objects for delete
using (
  bucket_id = 'post-images'
  and public.is_admin(auth.uid())
);
```

Repeat similarly for `gallery-images`.

## 8) Verify locally

```bash
npm install
npm run dev
```

Then test:
1. Create account from `/login`.
2. Log in with email/password.
3. Visit `/admin` with a promoted admin user.
4. Create a post/project and verify they appear on `/posts` and `/gallery`.
5. Open a project in `/gallery` and confirm save data persists per user.

## 9) Troubleshooting

- **"Invalid login credentials"**: wrong password or user not created.
- **401/403 from Supabase**: missing RLS policy or role not set to admin.
- **Images upload fails**: missing bucket or storage insert policy.
- **Session not persisting**: ensure browser allows local storage/cookies.


## 10) Free Supabase tier notes for game save data

The current gallery page saves per-user game state into `project_saves` using a single row per `(user_id, project_id)` and `upsert`, which is free-tier friendly and keeps row growth controlled. Apply `supabase/sql/project_saves_free_tier.sql` to ensure table, index, trigger, and RLS policies are present.

### Quick Supabase setup verification checklist

Run these in Supabase SQL Editor:

```sql
-- 1) Ensure required tables exist.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('posts', 'projects', 'gallery_images', 'project_saves', 'profiles')
order by table_name;

-- 2) Ensure RLS is enabled on game saves.
select relname as table_name, relrowsecurity as rls_enabled
from pg_class
where relname = 'project_saves';

-- 3) Ensure save policies exist.
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'project_saves'
order by policyname;
```

If all 3 checks return expected rows, your Supabase save setup is configured correctly for this app.
