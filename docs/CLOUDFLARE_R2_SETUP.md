# Serving games from Cloudflare R2

The game HTML files are ~90 MB each. They were stored in Git LFS, but LFS
has a small free bandwidth quota, so pulling them from GitHub fails. The
site now serves them from the Cloudflare R2 bucket **`digitbox-games`**
instead — R2 downloads (egress) are free.

How it works now:

- The site checks R2 first for every game/post file. GitHub is only a
  fallback for files that are not in R2 yet.
- Builds no longer run `git lfs pull`, so deploys never touch LFS.
- The tiny LFS pointer files can stay in the repo; they are harmless and
  are never served to visitors.

Follow these three steps once and everything works.

## Step 1 — Upload the game files to the bucket

The files must be uploaded with this folder layout inside the bucket:

```
digitbox-games/
  projects/Crystal Seeker 3D.html
  projects/IGE Editor.html
  ...                              (one per game, same names as before)
  posts/we-are-back.html
```

**Option A — Cloudflare dashboard (easiest):**

1. Open the Cloudflare dashboard → **R2** → **digitbox-games**.
2. Create a folder called `projects` and drag the real game `.html` files
   into it (use the copies on your computer — the ones in a fresh GitHub
   download are 133-byte pointer files, not the real games).
3. Do the same with a `posts` folder for post HTML files.

**Option B — script (uploads everything at once):**

From the repo root on a computer that has the real files in
`public/projects/`:

```bash
npx wrangler login          # first time only
bash scripts/upload-games-to-r2.sh
```

The script skips LFS pointer files automatically and tells you which ones
it skipped.

## Step 2 — Turn on public access for the bucket

1. Cloudflare dashboard → **R2** → **digitbox-games** → **Settings**.
2. Under **Public access**, enable the **r2.dev subdomain** (click
   "Allow Access").
3. Copy the URL it gives you. It looks like:
   `https://pub-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.r2.dev`

(If you later connect a custom domain to the bucket, that URL works too
and is faster — just use it in Step 3 instead.)

## Step 3 — Tell the site where the bucket is

Add one environment variable to your deployment (Cloudflare Pages →
your project → **Settings** → **Environment variables**, or Vercel →
**Settings** → **Environment Variables**):

```
R2_PUBLIC_BASE_URL=https://pub-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.r2.dev
```

Then redeploy. That's it — games now load from R2 and never touch GitHub
LFS again.

## Adding a new game later

1. Upload the new game's `.html` file to the bucket under `projects/`
   (dashboard drag-and-drop or
   `npx wrangler r2 object put "digitbox-games/projects/My Game.html" --file "My Game.html" --content-type "text/html; charset=utf-8" --remote`).
2. Add the game's name (without `.html`) to `data/projects-index.json` in
   this repo so it shows up in the gallery.

You do **not** need to commit the big HTML file to GitHub anymore.

## Troubleshooting

- **Game page shows "File not found"** — the file name in the bucket must
  exactly match the name in `data/projects-index.json` plus `.html`,
  inside the `projects/` folder (capitals and spaces matter).
- **Game page shows LFS pointer text or an LFS error** — the file being
  served is a pointer, or `R2_PUBLIC_BASE_URL` is not set on the
  deployment. Check Step 3 and redeploy.
- **Upload script says "SKIP (Git LFS pointer)"** — your local copy of
  that file is a pointer, not the real game. Use the original file from
  wherever you exported the game (e.g. the TurboWarp/packager output).
