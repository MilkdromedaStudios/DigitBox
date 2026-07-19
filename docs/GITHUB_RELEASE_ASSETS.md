# Game files: stored in the repo (Git LFS), served from a GitHub Release

The game HTML files live in the repo under `public/projects/` as **Git LFS**
files — several are 25–100+ MB, and Crystal Seeker 3D (101 MB) is over
GitHub's 100 MB limit for regular files, so LFS pointers are the only way to
keep the folder in git. Builds never include them, and the deployed site
fetches them from GitHub at runtime.

Serving games straight from LFS would burn through the free LFS bandwidth
(1 GB/month), so a GitHub Action mirrors the files onto the `game-assets`
**GitHub Release** (up to 2 GB per file, free unlimited downloads), and the
site reads from the release first. Everything runs on GitHub — no local
machine is needed.

## How it works

- **Repo**: `public/projects/*.html` are LFS pointer files (a few lines of
  text each). The real content sits in GitHub's LFS storage.
- **Sync**: `.github/workflows/sync-games-to-release.yml` runs whenever
  `public/projects` changes on `main` (or manually from the Actions tab). It
  compares each pointer's size against the release assets and uploads only
  what changed, so re-runs cost almost no LFS bandwidth.
- **Build**: the repo `.lfsconfig` sets `fetchexclude = *`, so clones and
  checkouts (Vercel, Cloudflare Pages, CI) only ever see the tiny pointer
  files. `scripts/vercel-build.sh` additionally moves `public/projects/` out
  of the tree during CI builds, so neither pointers nor real files land in
  the build output. Keep the hosting platform's own Git LFS option
  **disabled** too (Vercel: Project Settings → Git → Git LFS).
- **Runtime**: `/api/content/file` looks for content in this order and
  streams it back to the game iframe:
  1. Cloudflare R2 bucket (only if configured — optional)
  2. **GitHub release assets** (free bandwidth — the normal path)
  3. The repo itself — small files come via the API, and LFS files are
     served through `media.githubusercontent.com`, which does use LFS
     bandwidth; it is the fallback while the release is not synced yet.
- **Delete**: `/api/content/delete` also removes the matching release asset.

GitHub renames uploaded assets ("Appel 3D.html" becomes "Appel.3D.html") —
that is expected; the app and the workflow both account for it.

## Adding or updating a game

1. Commit the new `public/projects/<Game Name>.html` (with git-lfs installed
   locally, the `.gitattributes` rule stores it in LFS automatically) and add
   the title to `data/projects-index.json`.
2. Push to `main` — the sync workflow uploads it to the release by itself.

To force a re-sync at any time: Actions tab → **Sync games to release** →
Run workflow. `scripts/upload-games-to-github.mjs` still exists as a manual
alternative that uploads files from a local directory.

To get the real game files on your own machine (the `.lfsconfig` blocks the
download by default):

```bash
git lfs pull --include="public/projects/*" --exclude=""
```

## Environment variables on the deployment

None are required for serving games and posts: reads default to the public
`MilkdromedaStudios/DigitBox` repo (see `lib/githubRepo.js`) and go through
GitHub's download hosts (`github.com/releases/download`,
`raw.githubusercontent.com`), which are not rate-limited the way the API is —
unauthenticated API calls are capped at 60/hour per IP and used to cause
403s. The API is only touched as a last-resort fallback. Optional:

```
GITHUB_TOKEN=<required for publishing from the admin; also raises API rate limits>
GITHUB_REPO_OWNER=<override, defaults to MilkdromedaStudios>
GITHUB_REPO_NAME=<override, defaults to DigitBox>
GITHUB_ASSETS_TAG=game-assets   # optional, this is the default
```
