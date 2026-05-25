#!/usr/bin/env bash
set -euo pipefail

if command -v git >/dev/null 2>&1 && command -v git-lfs >/dev/null 2>&1; then
  echo "[vercel-build] git and git-lfs detected; checking for LFS pointers..."

  if git lfs ls-files >/dev/null 2>&1 && [ -n "$(git lfs ls-files | head -n 1)" ]; then
    echo "[vercel-build] LFS pointers found; preparing LFS endpoint..."

    lfs_url="$(git config --get lfs.url || true)"

    if [ -z "$lfs_url" ]; then
      remote_url="$(git config --get remote.origin.url || true)"

      if [ -n "$remote_url" ]; then
        if [[ "$remote_url" =~ ^https?:// ]]; then
          normalized_remote="$remote_url"
        elif [[ "$remote_url" =~ ^git@([^:]+):(.+)$ ]]; then
          normalized_remote="https://${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
        elif [[ "$remote_url" =~ ^[^/]+/.+ ]]; then
          normalized_remote="https://$remote_url"
        else
          normalized_remote="$remote_url"
        fi

        lfs_url="${normalized_remote%/}/info/lfs"
      elif [ -n "${VERCEL_GIT_REPO_OWNER:-}" ] && [ -n "${VERCEL_GIT_REPO_SLUG:-}" ]; then
        lfs_url="https://github.com/${VERCEL_GIT_REPO_OWNER}/${VERCEL_GIT_REPO_SLUG}.git/info/lfs"
      else
        lfs_url="https://github.com/MilkdromedaStudios/DigitBox.git/info/lfs"
      fi

      if [ -n "$lfs_url" ]; then
        git config lfs.url "$lfs_url"
        echo "[vercel-build] Configured lfs.url=$lfs_url"
      fi
    fi

    if ! git lfs pull --include="*" --exclude=""; then
      echo "[vercel-build] ERROR: Git LFS pull failed."
      echo "[vercel-build] Ensure Vercel Project Settings > Git > Git LFS is enabled and repository access is authorized."
      exit 2
    fi

    if ! git lfs checkout; then
      echo "[vercel-build] ERROR: Git LFS checkout failed."
      exit 2
    fi
  else
    echo "[vercel-build] No LFS pointers detected; skipping git lfs pull."
  fi
else
  echo "[vercel-build] git or git-lfs is unavailable; skipping git lfs pull."
fi

echo "[vercel-build] Running next build..."
next build
