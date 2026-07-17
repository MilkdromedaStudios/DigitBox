#!/usr/bin/env bash
set -euo pipefail

# Detect CI before the .env files are loaded — the committed .env.local
# contains captured VERCEL_* variables that would make local builds look
# like CI.
IS_CI_BUILD=""
if [ -n "${VERCEL:-}" ] || [ -n "${CF_PAGES:-}" ] || [ -n "${CI:-}" ]; then
  IS_CI_BUILD=1
fi

load_env_file() {
  local env_file="$1"
  if [ -f "${env_file}" ]; then
    echo "[build] Loading environment variables from ${env_file}"
    set -a
    # shellcheck disable=SC1090
    . "${env_file}"
    set +a
  fi
}

if [ -f ".env.local" ]; then
  load_env_file ".env.local"
elif [ -f ".env" ]; then
  load_env_file ".env"
fi

# The game HTML files are never part of the build: they are fetched at
# runtime from the GitHub release (see docs/GITHUB_RELEASE_ASSETS.md) or the
# Cloudflare R2 bucket (see docs/CLOUDFLARE_R2_SETUP.md). The build must NOT
# pull Git LFS objects — LFS bandwidth is limited and the files are huge.
export GIT_LFS_SKIP_SMUDGE=1

# public/projects holds the games as Git LFS pointers (real files on dev
# machines that pulled them). Either way the directory must not be in
# public/ when the build output is packaged: Cloudflare Pages rejects static
# files over 25 MB, and even pointer text should not be deployed. Move it
# aside; on CI (ephemeral checkout) it stays out so the packaging steps that
# run after this script cannot pick it up, locally it is restored on exit.
EXCLUDED_GAMES_DIR=".build-excluded-projects"
restore_excluded_games() {
  if [ -d "${EXCLUDED_GAMES_DIR}" ]; then
    rm -rf public/projects
    mv "${EXCLUDED_GAMES_DIR}" public/projects
  fi
}

if [ -d "public/projects" ]; then
  rm -rf "${EXCLUDED_GAMES_DIR}"
  mv public/projects "${EXCLUDED_GAMES_DIR}"
  if [ -n "${IS_CI_BUILD}" ]; then
    echo "[build] CI build: leaving public/projects out of the tree (game files are fetched from GitHub at runtime)"
  else
    echo "[build] Excluding public/projects for the duration of the build (moved to ${EXCLUDED_GAMES_DIR})"
    trap restore_excluded_games EXIT
  fi
fi

echo "[build] Running next build..."
next build
