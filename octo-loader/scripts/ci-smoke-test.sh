#!/usr/bin/env bash
# Octo Loader end-to-end smoke test.
#
# Proves the mod works against real jars from Modrinth:
#   1. Builds a throwaway Fabric server instance.
#   2. Drops REAL foreign jars into the octoloader/ inbox:
#        - Create            (NeoForge mod)              -> expect: honest incompatible verdict
#        - Lithium 1.21.1    (Fabric mod, wrong version) -> expect: version-bridged to current MC
#        - WorldEdit         (Bukkit/Paper plugin)       -> expect: loader-bridged to Fabric build
#   3. Runs the Octo Loader CLI (same engine as in-game) and asserts the outcomes.
#   4. Boots a real Fabric dedicated server with the staged mods and checks they load.
#
# Usage: ci-smoke-test.sh <octo-loader-jar> [game-version] [fabric-loader-version] [fabric-installer-version]
set -euo pipefail

OCTO_JAR=$(readlink -f "$1")
GAME_VERSION="${2:-26.2}"
LOADER_VERSION="${3:-0.19.3}"
INSTALLER_VERSION="${4:-1.1.1}"
UA='octo-loader-ci (github.com/MilkdromedaStudios/DigitBox)'

WORK="${RUNNER_TEMP:-$(mktemp -d)}/octo-smoke"
SRV="$WORK/instance"
mkdir -p "$SRV/mods" "$SRV/octoloader"
echo "==> Test instance: $SRV"

fetch_modrinth() { # <project> <loaders-json> <game-versions-json or ''> <dest-dir>
    python3 - "$@" <<'EOF'
import json, sys, urllib.parse, urllib.request, pathlib
project, loaders, gvs, dest = sys.argv[1:5]
q = 'loaders=' + urllib.parse.quote(loaders)
if gvs:
    q += '&game_versions=' + urllib.parse.quote(gvs)
url = f'https://api.modrinth.com/v2/project/{project}/version?{q}'
req = urllib.request.Request(url, headers={'User-Agent': 'octo-loader-ci'})
v = json.load(urllib.request.urlopen(req))[0]
f = next(f for f in v['files'] if f['primary'])
req = urllib.request.Request(f['url'], headers={'User-Agent': 'octo-loader-ci'})
path = pathlib.Path(dest) / f['filename']
path.write_bytes(urllib.request.urlopen(req).read())
print(f"    fetched {project} {v['version_number']} -> {path.name}")
EOF
}

echo "==> Downloading real test jars from Modrinth"
fetch_modrinth fabric-api '["fabric"]' "[\"$GAME_VERSION\"]" "$SRV/mods"
fetch_modrinth create '["neoforge"]' '' "$SRV/octoloader"
fetch_modrinth lithium '["fabric"]' '["1.21.1"]' "$SRV/octoloader"
fetch_modrinth worldedit '["bukkit"]' '' "$SRV/octoloader"
cp "$OCTO_JAR" "$SRV/mods/"

assert_outcomes() {
    python3 - "$SRV" <<'EOF'
import json, pathlib, sys
srv = pathlib.Path(sys.argv[1])
report = json.loads((srv / 'octoloader' / 'octo-report.json').read_text())
by_prefix = {}
for item in report['results']:
    for prefix in ('create-', 'lithium-', 'worldedit-'):
        if item['file'].startswith(prefix):
            by_prefix[prefix] = item

lithium = by_prefix['lithium-']
assert lithium['status'] == 'bridged-version', lithium
assert lithium['staged'] and (srv / 'mods' / lithium['staged']).exists(), lithium

worldedit = by_prefix['worldedit-']
assert worldedit['status'] == 'bridged-loader', worldedit
assert worldedit['staged'] and (srv / 'mods' / worldedit['staged']).exists(), worldedit

create = by_prefix['create-']
assert create['status'] == 'incompatible', create
assert 'create-fabric' in create['detail'] or 'Fabric' in create['detail'], create

print('    resolution outcomes OK:')
print('      lithium   ->', lithium['status'], '->', lithium['staged'])
print('      worldedit ->', worldedit['status'], '->', worldedit['staged'])
print('      create    ->', create['status'], '(honest verdict, no fake staging)')
EOF
}

# Remove everything a previous phase staged so each phase starts clean.
reset_instance() {
    find "$SRV/mods" -name '*.jar' ! -name 'fabric-api-*' ! -name 'octo-loader-*' -delete
    rm -rf "$SRV/plugins"
    rm -f "$SRV/octoloader/.octo-state.json"
}

# Runs a resolution phase, retrying when the report shows transient network errors
# (Modrinth has intermittent 5xx weather; the mod degrades gracefully, but this test
# demands the real bridged outcomes).
run_resolution() { # $1 = 1 to disable the hash-lookup endpoint (fallback path)
    for attempt in 1 2 3; do
        if [ "${1:-0}" = "1" ]; then
            OCTO_DISABLE_HASH_LOOKUP=1 java -jar "$OCTO_JAR" --dir "$SRV" --game-version "$GAME_VERSION" --force
        else
            java -jar "$OCTO_JAR" --dir "$SRV" --game-version "$GAME_VERSION" --force
        fi
        if ! grep -q '"status": "error"' "$SRV/octoloader/octo-report.json"; then
            return 0
        fi
        echo "    transient Modrinth errors in report (attempt $attempt) — retrying in 45s"
        sleep 45
    done
    echo "Modrinth stayed unavailable across retries"
    return 1
}

echo "==> Phase 1: resolution via hash identification"
run_resolution 0
assert_outcomes

echo "==> Phase 2: resolution with the hash-lookup endpoint disabled (metadata fallback)"
reset_instance
run_resolution 1
assert_outcomes

echo "==> Booting a real Fabric $GAME_VERSION dedicated server with the staged mods"
cd "$SRV"
curl -sSL -o fabric-server.jar \
    "https://meta.fabricmc.net/v2/versions/loader/$GAME_VERSION/$LOADER_VERSION/$INSTALLER_VERSION/server/jar"
echo 'eula=true' > eula.txt
printf 'online-mode=false\nlevel-type=minecraft\\:flat\nmax-players=2\n' > server.properties
java -Xmx2G -jar fabric-server.jar nogui > server.log 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 120); do
    grep -q 'Done (' server.log && break
    kill -0 "$SERVER_PID" 2>/dev/null || break
    sleep 5
done
kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true

grep -q 'Done (' server.log || { echo 'Server never reached Done'; tail -50 server.log; exit 1; }

echo "==> Asserting the bridged mods actually loaded in-game"
grep -Eiq 'octoloader.*ready|Octo Loader .* ready' server.log || { grep -i octo server.log; exit 1; }
grep -Eiq 'lithium' server.log || { echo 'lithium missing from mod list'; exit 1; }
grep -Eiq 'worldedit' server.log || { echo 'worldedit missing from mod list'; exit 1; }
echo '    server booted with Octo Loader + bridged Lithium + bridged WorldEdit:'
grep -Ei 'Loading [0-9]+ mods' server.log || true
grep -Ei 'octo' server.log | head -5

echo '==> SMOKE TEST PASSED'
