# Serving game files from a GitHub Release

The game HTML files are never part of the build or the git repo — several are
25–100+ MB, which blows past deploy limits (Cloudflare Pages caps static
assets at 25 MB) and GitHub's 100 MB file limit, and Git LFS bandwidth runs
out. Instead, the real files live as **assets on a GitHub Release** (up to
2 GB per file, free downloads), and the deployed app fetches them from GitHub
at runtime when someone opens a game.

## How it works

- **Build**: `scripts/vercel-build.sh` never pulls the game files. If a local
  `public/projects/` directory exists (only on machines that keep the real
  files), it is moved aside during `next build` so nothing big lands in the
  build output. `public/projects/` is also git-ignored.
- **Runtime**: `/api/content/file` looks for content in this order:
  1. Cloudflare R2 bucket (only if configured — optional)
  2. **GitHub release assets** (the game files)
  3. The GitHub repo itself (small files like posts)
  The matching asset is streamed back to the browser as HTML and rendered in
  the game iframe.
- **Delete**: `/api/content/delete` also removes the matching release asset.

## One-time setup

### 1. Upload the game files to the release

On a machine that has the real game files (not git-lfs pointers):

```bash
GITHUB_TOKEN=<token with repo write access> \
node scripts/upload-games-to-github.mjs "/path/to/games directory"
```

`GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME` and (optionally) `GITHUB_TOKEN` are
read from `.env.local` if present. The script creates the release with tag
`game-assets` (override with `GITHUB_ASSETS_TAG`) if it does not exist, and
replaces assets that are already there, so re-running it is safe.

You can also upload through the GitHub web UI: Releases → `game-assets` →
Edit → attach files. Keep each file named `<Game Name>.html` exactly as it
appears in `data/projects-index.json` (GitHub replaces spaces with dots in
asset names — that is expected, the app accounts for it).

### 2. Environment variables on the deployment

The deployment only needs the variables it already uses for publishing:

```
GITHUB_REPO_OWNER=MilkdromedaStudios
GITHUB_REPO_NAME=DigitBox
GITHUB_TOKEN=<optional for a public repo, but recommended for rate limits>
GITHUB_ASSETS_TAG=game-assets   # optional, this is the default
```

With a public repo the assets can be read without a token, but unauthenticated
GitHub API calls are rate-limited to 60/hour per IP, so setting `GITHUB_TOKEN`
is recommended. Responses are cached for an hour (`Cache-Control`), which
keeps the number of GitHub API calls low.

## Publishing new games

`/api/content/publish` still writes new content to the R2 bucket when the
binding exists, otherwise it commits to the repo. Games that are too big to
commit should be uploaded to the release with the script above, and their
title added to `data/projects-index.json`.
