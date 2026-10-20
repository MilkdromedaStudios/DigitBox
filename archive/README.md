# DigitBox archive

## `digitbox-portfolio-2026-10-20.zip`

A snapshot of the DigitBox portfolio website taken right before it was turned
into the DigitBox entertainment hub (videos + cloud games).

- **Source commit:** `025332198c3f33cd04da2af52c5a5239580af33b` (branch `main`)
- **Created:** 2026-10-20 with `git archive`, so it holds exactly the files that
  were committed at that point (358 files).

### What is inside

Everything that made up the old site, including the parts the redesign removed:

- the portfolio homepage, gallery, about page, and the old navigation
- **DigitBox AI** (`pages/ai.js`, `pages/api/ai/`, `lib/ai.js`, `lib/aiChats.js`)
- **AppGPT** and its Telegram bot (`public/appgpt/`, `pages/api/appgpt/`, `appgpt-bot/`)
- **DEEPFORGE** — the game, its clan/combat/world components, its API routes,
  its patch scripts and every DEEPFORGE GitHub workflow
- posts, changelog, admin, login, profile, DigitBox Pro billing, the
  Cloudflare worker, docs, Supabase SQL and project indexes

### What is not inside

- `public/projects/Eaglercraft-Launcher-main/` — the Eaglercraft game builds
  (about 650 MB). They were left out because a zip that size cannot be stored in
  a normal GitHub file, and the folder is still in the repository unchanged:
  the new site keeps serving it as a cloud game.
- Large game files tracked with Git LFS (for example `public/projects/Appel 3D.html`)
  appear in the zip as small LFS pointer files, exactly as git stores them. The
  real game files are still in the repository's LFS storage and the
  `game-assets` release.

### Restoring

To get the old site back exactly as it was, including the Eaglercraft files,
check out the source commit:

```bash
git checkout 025332198c3f33cd04da2af52c5a5239580af33b
```

Or unzip the archive and run it like any Next.js app (`npm install && npm run dev`).
