#!/usr/bin/env bash
set -euo pipefail

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
# machines that ran `git lfs pull`). Either way Next.js would copy the
# directory into the build output — pointer text at best, 100 MB games at
# worst — so move it aside for the duration of the build.
EXCLUDED_GAMES_DIR=".build-excluded-projects"
restore_excluded_games() {
  if [ -d "${EXCLUDED_GAMES_DIR}" ]; then
    rm -rf public/projects
    mv "${EXCLUDED_GAMES_DIR}" public/projects
  fi
}

if [ -d "public/projects" ]; then
  echo "[build] Excluding public/projects from the build (game files are fetched from GitHub at runtime)"
  rm -rf "${EXCLUDED_GAMES_DIR}"
  mv public/projects "${EXCLUDED_GAMES_DIR}"
  trap restore_excluded_games EXIT
fi

echo "[build] Running next build..."
next build
