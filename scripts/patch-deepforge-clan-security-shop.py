from pathlib import Path

# ----- Authenticate clan mutations -----
p = Path('cloudflare/deepforge-worker/src/index.js')
s = p.read_text()

join_anchor = '''    if (url.pathname === "/v1/clans/join" && request.method === "POST") {
      let body;'''
join_secure = '''    if (url.pathname === "/v1/clans/join" && request.method === "POST") {
      const authResult = await authenticatedD1User(request, env);
      if (authResult.error) return json({ error: authResult.error }, authResult.status, env);
      let body;'''
if join_anchor in s:
    s = s.replace(join_anchor, join_secure, 1)
# First matching playerId after join route only.
pos = s.find('if (url.pathname === "/v1/clans/join"')
if pos >= 0:
    tail = s[pos:]
    tail = tail.replace('const playerId = body.playerId;', 'const playerId = authResult.user.id;', 1)
    s = s[:pos] + tail

leave_anchor = '''    if (url.pathname === "/v1/clans/leave" && request.method === "POST") {
      let body;'''
leave_secure = '''    if (url.pathname === "/v1/clans/leave" && request.method === "POST") {
      const authResult = await authenticatedD1User(request, env);
      if (authResult.error) return json({ error: authResult.error }, authResult.status, env);
      let body;'''
if leave_anchor in s:
    s = s.replace(leave_anchor, leave_secure, 1)
pos = s.find('if (url.pathname === "/v1/clans/leave"')
if pos >= 0:
    tail = s[pos:]
    tail = tail.replace('const playerId = body.playerId;', 'const playerId = authResult.user.id;', 1)
    s = s[:pos] + tail

profile_anchor = '''    if (url.pathname === "/v1/clans/profile" && request.method === "PUT") {
      let body;'''
profile_secure = '''    if (url.pathname === "/v1/clans/profile" && request.method === "PUT") {
      const authResult = await authenticatedD1User(request, env);
      if (authResult.error) return json({ error: authResult.error }, authResult.status, env);
      let body;'''
if profile_anchor in s:
    s = s.replace(profile_anchor, profile_secure, 1)
pos = s.find('if (url.pathname === "/v1/clans/profile"')
if pos >= 0:
    tail = s[pos:]
    tail = tail.replace('''      if (!validPlayerId(body.playerId)) return json({ error: "Invalid player id" }, 400, env);

''', '')
    tail = tail.replace('''        body.playerId
      ).run();''', '''        authResult.user.id
      ).run();''', 1)
    s = s[:pos] + tail

p.write_text(s)
print('secured clan mutations', len(s))

# ----- Send bearer token automatically for clan calls -----
p = Path('components/deepforge/cloudSync.js')
s = p.read_text()
old = '''async function clanRequest(path, options) {
  const root = apiRoot();
  if (!root) throw new Error("Cloudflare API is unavailable.");
  const response = await fetch(root + path, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...((options && options.headers) || {}),
    },
  });'''
new = '''async function clanRequest(path, options) {
  const root = apiRoot();
  if (!root) throw new Error("Cloudflare API is unavailable.");
  const token = getCloudAuthToken();
  const response = await fetch(root + path, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...((options && options.headers) || {}),
    },
  });'''
if old in s:
    s = s.replace(old, new, 1)
p.write_text(s)
print('updated clan client auth', len(s))

# ----- Make the city depot a real next-item equipment shop -----
p = Path('components/deepforge/WorldCityOverlay.js')
s = p.read_text()
anchor = '''export default function WorldCityOverlay(props) {'''
helpers = '''function nextDrillToolName(level) {
  return drillToolName((Number(level) || 1) + 1);
}

function cargoToolName(capacity) {
  const cap = Number(capacity) || 18;
  if (cap < 26) return "Reinforced Ore Sack";
  if (cap < 42) return "Steel Mine Cart";
  if (cap < 66) return "Powered Ore Hauler";
  return "Deep Hauler Mk " + Math.max(1, Math.floor((cap - 58) / 8));
}

function armorToolName(level) {
  const n = (Number(level) || 1) + 1;
  if (n === 2) return "Hardhat & Work Vest";
  if (n === 3) return "Reinforced Mining Suit";
  if (n === 4) return "Steel-Plated Suit";
  if (n === 5) return "Deep-Shaft Exosuit";
  return "Exosuit Mk " + (n - 4);
}

function swordToolName(level) {
  const n = (Number(level) || 1) + 1;
  if (n === 2) return "Iron Mining Sword";
  if (n === 3) return "Steel Mining Sword";
  if (n === 4) return "Tempered Cutter Sword";
  if (n === 5) return "Powered Mining Blade";
  return "Deepforge Blade Mk " + (n - 4);
}

'''
if anchor in s and 'function nextDrillToolName' not in s:
    s = s.replace(anchor, helpers + anchor, 1)

old = '''                {[
                  { key: "drill", icon: "⛏", name: drillToolName(props.game.drill), detail: "Mining tool · power " + (props.drillDamage || props.game.drill) },
                  { key: "cargoMax", icon: "🛒", name: "Heavy Haul Cart", detail: props.game.cargoMax + " ore capacity" },
                  { key: "armor", icon: "🛡", name: "Reinforced Mining Suit", detail: props.game.maxHp + " protection" },
                  { key: "blaster", icon: "⚔", name: "Steel Mining Sword", detail: "Sword level " + props.game.blaster },
                ].map((item) => {'''
new = '''                {[
                  { key: "drill", icon: "⛏", name: nextDrillToolName(props.game.drill), detail: "Current: " + drillToolName(props.game.drill) + " · tool power " + (props.drillDamage || props.game.drill) },
                  { key: "cargoMax", icon: "🛒", name: cargoToolName(props.game.cargoMax), detail: "Current capacity " + props.game.cargoMax + " · +8 capacity" },
                  { key: "armor", icon: "🛡", name: armorToolName(props.game.armor), detail: "Current protection " + props.game.maxHp + " · +15 HP" },
                  { key: "blaster", icon: "⚔", name: swordToolName(props.game.blaster), detail: "Current sword level " + props.game.blaster + " · more melee damage" },
                ].map((item) => {'''
if old in s:
    s = s.replace(old, new, 1)

old_button = '''                      <div><b>{item.name}</b><small>{item.detail}</small></div>
                      <em>${cost.toLocaleString()}</em>'''
new_button = '''                      <div><b>BUY {item.name}</b><small>{item.detail}</small></div>
                      <em>${cost.toLocaleString()}</em>'''
if old_button in s:
    s = s.replace(old_button, new_button, 1)
p.write_text(s)
print('polished city equipment depot', len(s))
