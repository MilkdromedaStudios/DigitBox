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

# Game and post HTML files are served from the Cloudflare R2 bucket at
# runtime (see docs/CLOUDFLARE_R2_SETUP.md), so the build must NOT pull
# Git LFS objects — LFS bandwidth is limited and the files are huge.
# Only the tiny LFS pointer files stay in the repo.

echo "[build] Running next build..."
next build
