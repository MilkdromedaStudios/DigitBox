#!/usr/bin/env bash
set -euo pipefail

if command -v git >/dev/null 2>&1 && git lfs version >/dev/null 2>&1; then
  echo "[vercel-build] git and git-lfs detected; pulling LFS objects..."
  lfs_url="$(git config --get lfs.url || true)"

  if [ -z "${lfs_url}" ]; then
    remote_url="$(git config --get remote.origin.url || true)"
    if [ -n "${remote_url}" ]; then
      lfs_url="${remote_url}"
      git config lfs.url "${lfs_url}"
      echo "[vercel-build] lfs.url was empty; set it from remote.origin.url"
    fi
  fi

  if [ -z "${lfs_url}" ]; then
    echo "[vercel-build] WARNING: No LFS endpoint configured (lfs.url/remote.origin.url missing); skipping git lfs pull."
  else
    echo "[vercel-build] Running: git lfs pull --include=\"*\" --exclude=\"\""

    if ! git lfs pull --include="*" --exclude=""; then
      echo "[vercel-build] WARNING: Git LFS pull failed; continuing build."
      echo "[vercel-build] Ensure Vercel Project Settings > Git > Git LFS is enabled and repository access is authorized."
    fi

    echo "[vercel-build] Running: git lfs checkout"
    if ! git lfs checkout; then
      echo "[vercel-build] WARNING: Git LFS checkout failed; continuing build."
    fi
  fi
else
  echo "[vercel-build] git or git-lfs is unavailable; skipping git lfs pull."
fi

echo "[vercel-build] Running next build..."
next build
