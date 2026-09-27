# DigitBox (Next.js + Supabase)

This project uses **Next.js (Pages Router)** with **Supabase** for authentication and data storage.

## AppGPT

AppGPT now lives inside DigitBox and is served at:

`https://digitbox.dev/appgpt`

The browser runtime is isolated under `public/appgpt/`, while `next.config.js` rewrites the clean `/appgpt` URL directly to the AppGPT HTML shell. This keeps AppGPT as the top-level document, which is important for Telegram Mini App APIs.

AppGPT supports persistent chat-based app creation, one evolving app per chat, versioned `index.html` artifacts, Code / Preview / Debug tabs, AI provider presets, Telegram-native UI hooks, templates, visual edits, debugging, downloading, and GitHub Pages publishing.

The Telegram onboarding bot lives in `appgpt-bot/` and defaults to the DigitBox AppGPT URL. See `appgpt-bot/README.md` for deployment/setup.

## Eaglercraft Launcher credit

DigitBox includes an independently written **Eaglercraft** launcher/catalog. The launcher UI is DigitBox code, while the browser game/client files are stored locally under:

`public/projects/Eaglercraft-Launcher-main/`

The version/client set was sourced from [RedFlamz/Eaglercraft-Launcher](https://github.com/RedFlamz/Eaglercraft-Launcher). DigitBox does not copy the upstream launcher's page source or artwork as its own interface. The Play buttons use DigitBox-local game assets and a local bootloader instead of redirecting to the RedFlamz website.

Credit for Eaglercraft builds, community clients, mods, and Minecraft-related assets belongs to their respective developers and rights holders. DigitBox is not presented as an official Minecraft or Eaglercraft distribution.

## Game files (fetched from GitHub at runtime)

Large game HTML files in `public/projects/` may be tracked with **Git LFS**. A GitHub Action mirrors LFS-backed game files onto the `game-assets` GitHub Release, and DigitBox's content endpoint can retrieve those files at runtime. Eaglercraft's multi-file browser builds additionally keep their JS/EPK/WASM/resources directly in `public/projects/Eaglercraft-Launcher-main/` and are started by `public/projects/eaglercraft-runtime/play.html`.

See [docs/GITHUB_RELEASE_ASSETS.md](docs/GITHUB_RELEASE_ASSETS.md) for the release-asset setup.

A Cloudflare R2 bucket can optionally serve the same files (checked before
GitHub) — see [docs/CLOUDFLARE_R2_SETUP.md](docs/CLOUDFLARE_R2_SETUP.md).

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
