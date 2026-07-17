#!/usr/bin/env bash
# Uploads the real game/post HTML files to the Cloudflare R2 bucket.
#
# Run this from a computer that has the REAL files (not tiny Git LFS
# pointer files) in public/projects and public/posts. LFS pointers are
# detected and skipped automatically.
#
# Requirements: Node.js installed. Log in to Cloudflare once with:
#   npx wrangler login
#
# Usage (from the repo root):
#   bash scripts/upload-games-to-r2.sh
#
# The bucket name defaults to "digitbox-games"; override with R2_BUCKET.
set -euo pipefail

BUCKET="${R2_BUCKET:-digitbox-games}"
uploaded=0
skipped=0

upload_dir() {
  local dir="$1" prefix="$2"
  [ -d "$dir" ] || return 0

  local file name
  for file in "$dir"/*.html; do
    [ -e "$file" ] || continue

    if head -c 60 "$file" | grep -q "git-lfs.github.com"; then
      echo "SKIP (Git LFS pointer, not the real file): $file"
      skipped=$((skipped + 1))
      continue
    fi

    name="$(basename "$file")"
    echo "Uploading: $prefix/$name"
    npx wrangler r2 object put "$BUCKET/$prefix/$name" \
      --file "$file" \
      --content-type "text/html; charset=utf-8" \
      --remote
    uploaded=$((uploaded + 1))
  done
}

upload_dir "public/projects" "projects"
upload_dir "public/posts" "posts"

echo
echo "Done. Uploaded: $uploaded, skipped: $skipped."
echo "Files live in the '$BUCKET' bucket under projects/ and posts/."
if [ "$skipped" -gt 0 ]; then
  echo
  echo "Skipped files are Git LFS pointers — replace them with the real"
  echo "HTML files (from your own copy of the games) and run this again."
fi
