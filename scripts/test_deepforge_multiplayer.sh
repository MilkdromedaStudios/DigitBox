#!/usr/bin/env bash
set -euo pipefail

BASE="https://digitbox.pages.dev"
CLEANUP_SHA="d4c88727d727f6eb3eca8bef0865c60bfeeab8a3"

# Wait until the cleanup version is the deployed production build.
if [ -n "${GH_TOKEN:-}" ]; then
  ready=0
  for _ in $(seq 1 120); do
    checks="$(curl -sS --max-time 15 -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" "https://api.github.com/repos/MilkdromedaStudios/DigitBox/commits/$CLEANUP_SHA/check-runs" || true)"
    if CHECKS="$checks" python3 -c 'import json,os,sys; d=json.loads(os.environ.get("CHECKS","{}")); c=[x for x in d.get("check_runs",[]) if x.get("name")=="Cloudflare Pages"]; sys.exit(0 if c and c[-1].get("status")=="completed" and c[-1].get("conclusion")=="success" else 1)' 2>/dev/null; then
      ready=1
      break
    fi
    sleep 3
  done
  test "$ready" = "1"
fi

suffix="${GITHUB_RUN_ID:-local}-$(date +%s)-$RANDOM"
pass_a="$(printf 'DfA-%s-%s!' "$suffix" "$RANDOM")"
pass_b="$(printf 'DfB-%s-%s!' "$suffix" "$RANDOM")"
email_a="deepforge-multi-a-${suffix}@example.invalid"
email_b="deepforge-multi-b-${suffix}@example.invalid"
token_a=""
token_b=""

cleanup() {
  if [ -n "${token_a:-}" ]; then curl -sS -X DELETE -H "Authorization: Bearer $token_a" "$BASE/v1/auth/account" >/dev/null 2>&1 || true; fi
  if [ -n "${token_b:-}" ]; then curl -sS -X DELETE -H "Authorization: Bearer $token_b" "$BASE/v1/auth/account" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT

health="$(curl --fail-with-body -sS "$BASE/v1/health")"
HEALTH="$health" python3 -c 'import json,os,sys; d=json.loads(os.environ["HEALTH"]); sys.exit(0 if d.get("ok") is True and d.get("d1") is True else 1)'

payload_a="$(jq -n --arg e "$email_a" --arg p "$pass_a" --arg n "Multi Miner A $suffix" '{email:$e,password:$p,displayName:$n}')"
payload_b="$(jq -n --arg e "$email_b" --arg p "$pass_b" --arg n "Multi Miner B $suffix" '{email:$e,password:$p,displayName:$n}')"
signup_a="$(curl --fail-with-body -sS -X POST -H "Content-Type: application/json" --data "$payload_a" "$BASE/v1/auth/signup")"
signup_b="$(curl --fail-with-body -sS -X POST -H "Content-Type: application/json" --data "$payload_b" "$BASE/v1/auth/signup")"
token_a="$(SIGNUP="$signup_a" python3 -c 'import json,os; print(json.loads(os.environ["SIGNUP"])["token"])')"
token_b="$(SIGNUP="$signup_b" python3 -c 'import json,os; print(json.loads(os.environ["SIGNUP"])["token"])')"
user_a="$(SIGNUP="$signup_a" python3 -c 'import json,os; print(json.loads(os.environ["SIGNUP"])["user"]["id"])')"
user_b="$(SIGNUP="$signup_b" python3 -c 'import json,os; print(json.loads(os.environ["SIGNUP"])["user"]["id"])')"

world_a="$(curl --fail-with-body -sS -X POST -H "Authorization: Bearer $token_a" -H "Content-Type: application/json" --data '{"x":11.25,"y":2.5,"companyValue":1111,"trophies":21}' "$BASE/api/deepforge/multiplayer")"
world_b="$(curl --fail-with-body -sS -X POST -H "Authorization: Bearer $token_b" -H "Content-Type: application/json" --data '{"x":93.5,"y":3.5,"companyValue":2222,"trophies":42}' "$BASE/api/deepforge/multiplayer")"
city_a="$(WORLD="$world_a" python3 -c 'import json,os; print(json.loads(os.environ["WORLD"])["me"]["cityX"])')"
city_b="$(WORLD="$world_b" python3 -c 'import json,os; print(json.loads(os.environ["WORLD"])["me"]["cityX"])')"
test "$city_a" != "$city_b"

snap="$(curl --fail-with-body -sS -H "Authorization: Bearer $token_a" "$BASE/api/deepforge/multiplayer")"
SNAP="$snap" A="$user_a" B="$user_b" python3 -c 'import json,os,sys; d=json.loads(os.environ["SNAP"]); p={x.get("id") for x in d.get("players",[])}; c={x.get("ownerId") for x in d.get("cities",[])}; sys.exit(0 if os.environ["A"] in p and os.environ["B"] in p and os.environ["A"] in c and os.environ["B"] in c else 1)'

curl --fail-with-body -sS -X POST -H "Authorization: Bearer $token_b" -H "Content-Type: application/json" --data '{"x":111.75,"y":4.25,"companyValue":2300,"trophies":44}' "$BASE/api/deepforge/multiplayer" >/dev/null
moved="$(curl --fail-with-body -sS -H "Authorization: Bearer $token_a" "$BASE/api/deepforge/multiplayer")"
MOVED="$moved" B="$user_b" python3 -c 'import json,os,sys; d=json.loads(os.environ["MOVED"]); p=next((x for x in d.get("players",[]) if x.get("id")==os.environ["B"]),None); sys.exit(0 if p and abs(float(p.get("x",0))-111.75)<0.001 and int(p.get("trophies",0))==44 else 1)'

# Going offline removes the miner but leaves the city visitable.
curl --fail-with-body -sS -X DELETE -H "Authorization: Bearer $token_b" "$BASE/api/deepforge/multiplayer" >/dev/null
offline="$(curl --fail-with-body -sS -H "Authorization: Bearer $token_a" "$BASE/api/deepforge/multiplayer")"
OFFLINE="$offline" B="$user_b" python3 -c 'import json,os,sys; d=json.loads(os.environ["OFFLINE"]); b=os.environ["B"]; p={x.get("id") for x in d.get("players",[])}; c={x.get("ownerId"):x for x in d.get("cities",[])}; sys.exit(0 if b not in p and b in c and c[b].get("online") is False else 1)'

curl --fail-with-body -sS -X DELETE -H "Authorization: Bearer $token_a" "$BASE/v1/auth/account" >/dev/null
old_a="$token_a"; token_a=""
curl --fail-with-body -sS -X DELETE -H "Authorization: Bearer $token_b" "$BASE/v1/auth/account" >/dev/null
old_b="$token_b"; token_b=""

status_a="$(curl -sS -o /tmp/deepforge-a.json -w "%{http_code}" -H "Authorization: Bearer $old_a" "$BASE/v1/auth/me")"
status_b="$(curl -sS -o /tmp/deepforge-b.json -w "%{http_code}" -H "Authorization: Bearer $old_b" "$BASE/v1/auth/me")"
test "$status_a" = "401"
test "$status_b" = "401"

echo "DEEPFORGE multiplayer production test passed: two cities, live movement, offline persistent city, cleanup."
