#!/usr/bin/env bash
set -euo pipefail

if command -v git >/dev/null 2>&1 && command -v git-lfs >/dev/null 2>&1; then
  echo "[vercel-build] git and git-lfs detected; checking for LFS pointers..."

  if git lfs ls-files >/dev/null 2>&1 && [ -n "$(git lfs ls-files | head -n 1)" ]; then
    echo "[vercel-build] LFS pointers found."

    lfs_url="$(git config --get lfs.url || true)"

    if [ -n "$lfs_url" ] && [[ "$lfs_url" =~ ^https?:// ]]; then
      echo "[vercel-build] Using configured lfs.url=$lfs_url"
      if ! git lfs pull --include="*" --exclude=""; then
        echo "[vercel-build] ERROR: Git LFS pull failed using configured lfs.url."
        exit 2
      fi

      if ! git lfs checkout; then
        echo "[vercel-build] ERROR: Git LFS checkout failed."
        exit 2
      fi
    else
      echo "[vercel-build] No valid lfs.url configured; skipping manual git lfs pull."
      echo "[vercel-build] In Vercel, enable Project Settings > Git > Git LFS support so cloning fetches LFS objects automatically."
    fi
  else
    echo "[vercel-build] No LFS pointers detected; skipping git lfs pull."
  fi
else
  echo "[vercel-build] git or git-lfs is unavailable; skipping git lfs pull."
fi

echo "[vercel-build] Running next build..."
next build
