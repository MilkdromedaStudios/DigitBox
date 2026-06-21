# DigitBox (Next.js + Supabase)

This project uses **Next.js (Pages Router)** with **Supabase** for authentication and data storage.

## Option A Auth Setup (Supabase only, no Google)

This repo is configured for **email + password** auth only.

### 1) Add environment variables
Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 2) Configure Supabase Auth
In Supabase Dashboard:

1. Go to **Authentication → Providers → Email**.
2. Enable Email provider.
3. Enable **Email + Password** sign-in.
4. If you want users to log in immediately without email verification:
   - Disable **Confirm email** in auth settings.

> Note: Disabling email verification is less secure and can allow fake/unowned emails.

### 3) Create required tables (minimum)
You should create and secure these tables:

- `posts`
- `projects`
- `project_saves`
- `gallery_images`

Recommended: add `author_id` (`uuid`) fields referencing `auth.users.id` instead of only email strings.

### 4) Enable RLS
Enable Row Level Security for all app tables and add policies so:

- Public can read posts/projects/gallery.
- Users can write only their own saves in `project_saves`.
- Only admins can create/update/delete posts/projects/gallery.

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build

```bash
npm run build
npm start
```

Note: project is actively being developed...

## Supabase keepalive

This repository includes a daily GitHub Actions workflow that sends a small request to Supabase so the project receives regular activity. If you want it to perform an actual sign-in and sign-out cycle, create a dedicated low-privilege Supabase user and add these GitHub repository secrets:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_KEEPALIVE_EMAIL` (optional; enables sign-in/sign-out)
- `SUPABASE_KEEPALIVE_PASSWORD` (optional; enables sign-in/sign-out)

If the optional keepalive credentials are not set, the workflow only calls the Supabase Auth settings endpoint with the anon key. You can also run it manually from the Actions tab with the `Supabase Keepalive` workflow.
