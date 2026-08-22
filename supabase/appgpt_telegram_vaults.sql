-- AppGPT Telegram account vault
-- Run this once in the Supabase SQL Editor.

create table if not exists public.appgpt_telegram_vaults (
  telegram_user_id text primary key,
  payload text not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists appgpt_telegram_vaults_updated_at_idx
  on public.appgpt_telegram_vaults (updated_at desc);

alter table public.appgpt_telegram_vaults enable row level security;

-- The browser never talks to this table directly. The Next.js sync endpoint
-- validates Telegram initData and uses the server-side Supabase service-role
-- key. Keep anon/authenticated users out of the vault table itself.
revoke all on table public.appgpt_telegram_vaults from anon;
revoke all on table public.appgpt_telegram_vaults from authenticated;
