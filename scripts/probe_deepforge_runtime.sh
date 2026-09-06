#!/usr/bin/env bash
set -euo pipefail
BASE="https://digitbox.pages.dev"

probe() {
  local label="$1" url="$2"
  local body status
  body="$(mktemp)"
  status="$(curl -sS --max-time 20 -o "$body" -w "%{http_code}" "$url" || true)"
  echo "===== $label ====="
  echo "HTTP $status"
  cat "$body" || true
  echo
  case "$label" in
    health)
      test "$status" = "200"
      BODY="$(cat "$body")" python3 -c 'import json,os,sys; d=json.loads(os.environ["BODY"]); sys.exit(0 if d.get("ok") is True and d.get("d1") is True else 1)'
      ;;
    shared-world)
      test "$status" = "200" || test "$status" = "503"
      BODY="$(cat "$body")" python3 -c 'import json,os,sys; d=json.loads(os.environ["BODY"]); assert "r2" in d; assert "resetAt" in d; assert int(d.get("maxDigRadius",0)*100)==125; assert int(d.get("cityProtectedRadius",0))==9'
      ;;
    combat)
      # No token is intentionally supplied; 401 proves the deployed route exists and is auth-protected.
      test "$status" = "401"
      ;;
  esac
  rm -f "$body"
}

probe health "$BASE/v1/health"
probe shared-world "$BASE/api/deepforge/shared-world"
probe combat "$BASE/api/deepforge/combat"

echo "DEEPFORGE production runtime probe completed."
