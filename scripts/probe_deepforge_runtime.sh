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


echo "===== billing ====="
suffix="billing-probe-${GITHUB_RUN_ID:-local}-$(date +%s)-$RANDOM"
email="${suffix}@example.invalid"
password="DfBilling-${RANDOM}-A9x!"
signup_payload="$(jq -n --arg e "$email" --arg p "$password" --arg n "Billing Probe" '{email:$e,password:$p,displayName:$n}')"
signup="$(curl --fail-with-body -sS -X POST -H "Content-Type: application/json" --data "$signup_payload" "$BASE/v1/auth/signup")"
token="$(SIGNUP="$signup" python3 -c 'import json,os; print(json.loads(os.environ["SIGNUP"])["token"])')"
cleanup_billing_probe() {
  if [ -n "${token:-}" ]; then
    curl -sS -X DELETE -H "Authorization: Bearer $token" "$BASE/v1/auth/account" >/dev/null 2>&1 || true
  fi
}
trap cleanup_billing_probe EXIT
billing_status="$(curl --fail-with-body -sS -H "Authorization: Bearer $token" "$BASE/v1/billing/status")"
echo "$billing_status"
BILLING="$billing_status" python3 -c 'import json,os,sys; d=json.loads(os.environ["BILLING"]); c=d.get("configuration",{}); sys.exit(0 if c.get("stripe") is True and c.get("monthly") is True else 1)'
cleanup_billing_probe
token=""
trap - EXIT

echo "DEEPFORGE production runtime probe completed."
