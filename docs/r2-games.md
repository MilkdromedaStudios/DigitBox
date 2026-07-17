# Serving games from Cloudflare R2

The game HTML files are too large for the git repo (several exceed GitHub LFS
limits and Cloudflare Pages' 25 MB static-asset limit), so they live in the
`digitbox-games` R2 bucket instead. The app reads them through
`/api/content/file`, which looks in R2 first and falls back to the GitHub repo.

## One-time setup

### 1. Upload the existing games to the bucket

On a machine that has the real game files (not git-lfs pointers):

```bash
node scripts/upload-games-to-r2.mjs "/path/to/games directory"
```

The script uploads each `.html` file to `digitbox-games` under the
`projects/` prefix using wrangler. Authenticate first with `npx wrangler login`
(or set `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`).

Alternatively, upload through the Cloudflare dashboard (R2 → digitbox-games →
Upload) — make sure each object key is `projects/<Game Name>.html`, matching
the names in `data/projects-index.json`.

### 2. Bind the bucket to the Pages project

In the Cloudflare dashboard: **Workers & Pages → digitbox → Settings →
Bindings → Add → R2 bucket**

- Variable name: `DIGITBOX_GAMES` (must match exactly)
- R2 bucket: `digitbox-games`

Add the binding for both **Production** and **Preview**.

While in Settings, also confirm **Runtime → Compatibility flags** includes
`nodejs_compat` (required by next-on-pages) for both environments.

### 3. (Optional) Public bucket URL for non-Cloudflare deployments

The R2 binding only exists on Cloudflare Pages. For the Vercel deployment to
read games from R2, enable public access on the bucket (R2 → digitbox-games →
Settings → Public access, r2.dev subdomain or a custom domain) and set the
environment variable:

```
R2_PUBLIC_BASE_URL=https://pub-<hash>.r2.dev
```

Without this, non-Cloudflare deployments fall back to reading via the GitHub
API, which no longer works for games (the files were removed from the repo).

## How content flows after migration

- **Play a game / read a post**: `/api/content/file` → R2 binding → R2 public
  URL (if configured) → GitHub repo (small files like posts still live there).
- **Publish** (`/api/content/publish`): writes the HTML (and post markdown) to
  R2 when the binding exists, otherwise commits to the repo as before. The
  small JSON indexes (`data/projects-index.json`, `data/posts-index.json`) are
  always committed to the repo.
- **Delete** (`/api/content/delete`): removes the object from R2 and, if it
  also exists in the repo, deletes it there too.
