#!/usr/bin/env bash
set -euo pipefail

if command -v git >/dev/null 2>&1 && command -v git-lfs >/dev/null 2>&1; then
  echo "[vercel-build] git and git-lfs detected; pulling LFS objects..."
  echo "[vercel-build] Running: git lfs pull --include=\"*\" --exclude=\"\""

  if ! git lfs pull --include="*" --exclude=""; then
    echo "[vercel-build] WARNING: Git LFS pull failed; continuing build."
    echo "[vercel-build] Ensure Vercel Project Settings > Git > Git LFS is enabled and repository access is authorized."
  fi

  echo "[vercel-build] Running: git lfs checkout"
  if ! git lfs checkout; then
    echo "[vercel-build] WARNING: Git LFS checkout failed; continuing build."
  fi
else
  echo "[vercel-build] git or git-lfs is unavailable; skipping git lfs pull."
fi

echo "[vercel-build] Running next build..."
next build
