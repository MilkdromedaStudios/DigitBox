from pathlib import Path

# ---- BetaGameV2.js ----
p = Path('components/deepforge/BetaGameV2.js')
s = p.read_text()

s = s.replace('import { leaveMultiplayerWorld, syncMultiplayerPresence } from "./multiplayer";\n', 'import { leaveMultiplayerWorld, syncMultiplayerPresence } from "./multiplayer";\nimport { loadSharedWorld, submitSharedDigs } from "./sharedWorld";\n')
s = s.replace('const DEFAULT_PLAYER = { x: 0, y: surfaceHeight(0) - 0.38 };\n', 'const DEFAULT_PLAYER = { x: 0, y: surfaceHeight(0) - 0.38 };\nconst MAX_SHARED_DIG_RADIUS = 1.25;\nconst CITY_PROTECTED_RADIUS = 9;\n')

old = '''function WorldScreen(props) {
  const game = props.game;
  return (
'''
new = '''function WorldScreen(props) {
  const game = props.game;
  const [clock, setClock] = useState(Date.now());
  useEffect(function () {
    const timer = setInterval(function () { setClock(Date.now()); }, 1000);
    return function () { clearInterval(timer); };
  }, []);
  const secondsLeft = props.resetAt ? Math.max(0, Math.ceil((props.resetAt - clock) / 1000)) : 0;
  const resetLabel = String(Math.floor(secondsLeft / 60)).padStart(2, "0") + ":" + String(secondsLeft % 60).padStart(2, "0");
  return (
'''
if old in s: s = s.replace(old, new, 1)

s = s.replace('''        buildingCost={props.buildingCost}
        upgradeBuilding={props.upgradeBuilding}
      />''', '''        buildingCost={props.buildingCost}
        upgradeBuilding={props.upgradeBuilding}
        gearCost={props.gearCost}
        upgradeGear={props.upgradeGear}
        drillDamage={props.drillDamage}
      />''', 1)

s = s.replace('''        <RigPanel game={game} drillDamage={props.drillDamage} gearCost={props.gearCost} upgradeGear={props.upgradeGear} />
      </div>''', '''      </div>
      <div style={{position:"absolute",left:12,top:94,zIndex:17,padding:"7px 9px",border:"1px solid rgba(255,255,255,.09)",borderRadius:8,background:"rgba(12,18,21,.82)",color:"#d7e0e2",fontSize:"10px",pointerEvents:"none"}}>
        <b style={{display:"block",fontSize:"9px",letterSpacing:".08em"}}>HOURLY MAP RESET</b>
        <span style={{display:"block",marginTop:2,color:props.sharedR2?"#8fe0ad":"#d8a46d"}}>{props.sharedR2 ? resetLabel : "R2 OFFLINE"}</span>
      </div>''', 1)

s = s.replace('''  const [cityWaypoint, setCityWaypoint] = useState(null);
  const playerIdRef = useRef(null);''', '''  const [cityWaypoint, setCityWaypoint] = useState(null);
  const [sharedWorldMeta, setSharedWorldMeta] = useState({ r2: false, resetAt: 0, hourKey: null, maxDigRadius: MAX_SHARED_DIG_RADIUS, cityProtectedRadius: CITY_PROTECTED_RADIUS, error: "" });
  const playerIdRef = useRef(null);''', 1)
s = s.replace('''  const multiplayerLiveRef = useRef({ player: DEFAULT_PLAYER, companyValue: 0, trophies: 0 });
''', '''  const multiplayerLiveRef = useRef({ player: DEFAULT_PLAYER, companyValue: 0, trophies: 0 });
  const pendingDigsRef = useRef([]);
  const sharedHourRef = useRef(null);
''', 1)

s = s.replace('''  const drillRadius = 0.7 + Math.min(0.42, drillDamage * 0.055) + (researchTech.drilling || 0) * 0.04;''', '''  const drillRadius = Math.min(MAX_SHARED_DIG_RADIUS, 0.7 + Math.min(0.42, drillDamage * 0.055) + (researchTech.drilling || 0) * 0.04);''', 1)

anchor = '''  useEffect(function () {
    let cancelled = false;
    const playerId = getOrCreatePlayerId();'''
insert = '''  useEffect(function () {
    if (!loaded || !authUser || !authUser.id) return undefined;
    let cancelled = false;
    loadCloudSave(authUser.id)
      .then(function (response) {
        if (cancelled || !response) return;
        const remote = normalizeSave(response && response.data ? response.data : response);
        if (!remote) return;
        setPlayer(remote.player);
        setGame(remote.game);
        setNotice("Account progression loaded from D1.");
      })
      .catch(function () {});
    return function () { cancelled = true; };
  }, [loaded, authUser ? authUser.id : ""]);

  useEffect(function () {
    if (!authUser || !authUser.id) {
      sharedHourRef.current = null;
      pendingDigsRef.current = [];
      setSharedWorldMeta({ r2: false, resetAt: 0, hourKey: null, maxDigRadius: MAX_SHARED_DIG_RADIUS, cityProtectedRadius: CITY_PROTECTED_RADIUS, error: "Log in for the shared map." });
      return undefined;
    }
    let stopped = false;
    async function refreshSharedWorld() {
      try {
        const data = await loadSharedWorld();
        if (stopped) return;
        const nextHour = Number(data.hourKey);
        const changedHour = sharedHourRef.current !== null && sharedHourRef.current !== nextHour;
        sharedHourRef.current = nextHour;
        let nextWorld = normalizeWorldChanges(data.worldChanges);
        pendingDigsRef.current.forEach(function (dig) { nextWorld = addDigCircle(nextWorld, dig); });
        setWorldChanges(nextWorld);
        setSharedWorldMeta({
          r2: Boolean(data.r2),
          resetAt: Number(data.resetAt) || 0,
          hourKey: nextHour,
          maxDigRadius: Math.min(MAX_SHARED_DIG_RADIUS, Number(data.maxDigRadius) || MAX_SHARED_DIG_RADIUS),
          cityProtectedRadius: Number(data.cityProtectedRadius) || CITY_PROTECTED_RADIUS,
          error: "",
        });
        if (changedHour) {
          pendingDigsRef.current = [];
          setPlayer(function (current) { return { x: current.x, y: surfaceHeight(current.x) - 0.42 }; });
          setResetKey(function (value) { return value + 1; });
          setNotice("New hourly map started. Terrain reset; account progress was kept.");
        }
      } catch (error) {
        if (stopped) return;
        const data = error && error.data ? error.data : {};
        setSharedWorldMeta(function (current) { return { ...current, r2: false, resetAt: Number(data.resetAt) || current.resetAt, error: error && error.message ? error.message : "R2 world unavailable." }; });
      }
    }
    refreshSharedWorld();
    const timer = setInterval(refreshSharedWorld, 1600);
    return function () { stopped = true; clearInterval(timer); };
  }, [authUser ? authUser.id : ""]);

  useEffect(function () {
    if (!authUser || !authUser.id) return undefined;
    let busy = false;
    const timer = setInterval(async function () {
      if (busy || !sharedWorldMeta.r2 || pendingDigsRef.current.length === 0) return;
      busy = true;
      const batch = pendingDigsRef.current.splice(0, 10);
      try {
        await submitSharedDigs(batch);
      } catch (error) {
        if (!(error && error.data && error.data.protectedCity)) pendingDigsRef.current = batch.concat(pendingDigsRef.current).slice(-80);
        if (error && error.message) setNotice(error.message);
      } finally {
        busy = false;
      }
    }, 450);
    return function () { clearInterval(timer); };
  }, [authUser ? authUser.id : "", sharedWorldMeta.r2]);

'''
if anchor in s and insert not in s: s = s.replace(anchor, insert + anchor, 1)

oldsave = '''      const payload = { version: 3, updatedAt: Date.now(), player: player, game: game, worldChanges: normalizeWorldChanges(worldChanges) };
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(payload)); } catch (_) {}
      if (cloudEnabled() && Date.now() - lastCloudSaveRef.current > 3500) {
        lastCloudSaveRef.current = Date.now();
        setCloudStatus("D1 saving");
        saveCloudSave(playerIdRef.current, payload)'''
newsave = '''      const accountPlayerId = (authUser && authUser.id) || playerIdRef.current;
      const payload = { version: 4, updatedAt: Date.now(), player: player, game: game, worldChanges: authUser ? emptyWorldChanges() : normalizeWorldChanges(worldChanges) };
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(payload)); } catch (_) {}
      if (cloudEnabled() && accountPlayerId && Date.now() - lastCloudSaveRef.current > 3500) {
        lastCloudSaveRef.current = Date.now();
        setCloudStatus(authUser ? "Account saving" : "D1 saving");
        saveCloudSave(accountPlayerId, payload)'''
if oldsave in s: s = s.replace(oldsave, newsave, 1)

# Protect city zones + hard radius cap + queue shared digs.
s = s.replace('''    const radius = Number(excavation.radius) || drillRadius;
    const circle = {''', '''    const radius = Math.min(sharedWorldMeta.maxDigRadius || MAX_SHARED_DIG_RADIUS, Number(excavation.radius) || drillRadius);
    const circle = {''', 1)
needle = '''    const hits = depositsHitByCircle(circle.x, circle.y, circle.r, worldChanges);'''
replacement = '''    const protectedRadius = sharedWorldMeta.cityProtectedRadius || CITY_PROTECTED_RADIUS;
    const protectedCity = multiplayer.cities.find(function (city) { return Math.abs(Number(city.x) - circle.x) <= protectedRadius; });
    if (protectedCity) {
      setNotice("City ground is protected. Walk outside " + protectedCity.ownerName + "'s city limits to mine.");
      return;
    }

    const hits = depositsHitByCircle(circle.x, circle.y, circle.r, worldChanges);'''
if needle in s: s = s.replace(needle, replacement, 1)

needle = '''    setWorldChanges(nextChanges);

    if (collected) {'''
replacement = '''    setWorldChanges(nextChanges);
    if (authUser && authUser.id && sharedWorldMeta.r2) {
      pendingDigsRef.current.push({ x: circle.x, y: circle.y, r: circle.r, shape: "square" });
      if (pendingDigsRef.current.length > 80) pendingDigsRef.current.splice(0, pendingDigsRef.current.length - 80);
    }

    if (collected) {'''
if needle in s: s = s.replace(needle, replacement, 1)
s = s.replace('''setNotice(depth < 5.5 ? "Excavated a round cut through soil." : depth < 22 ? "Excavated a round cut through compact earth." : "Cut a round section of bedrock.");''', '''setNotice(depth < 5.5 ? "Excavated a square cut through soil." : depth < 22 ? "Excavated a square cut through compact earth." : "Cut a square section of bedrock.");''')

# Gear can only be bought while physically inside own city.
old = '''  function upgradeGear(key) {
    const cost = gearCost(key);'''
new = '''  function upgradeGear(key) {
    const inOwnCity = myCity && Math.abs(Number(player.x) - Number(myCity.x)) <= 7.5 && (Number(player.y) - surfaceHeight(Number(player.x))) < 1.5;
    if (!inOwnCity) { setNotice("Walk to your city supply depot to buy mining gear."); return; }
    const cost = gearCost(key);'''
if old in s: s = s.replace(old, new, 1)

# Reset progression only; never erase shared world for logged-in players.
s = s.replace('''    setWorldChanges(emptyWorldChanges());''', '''    if (!authUser) setWorldChanges(emptyWorldChanges());''', 1)
s = s.replace('''      worldChanges: emptyWorldChanges(),
    };''', '''      worldChanges: authUser ? emptyWorldChanges() : emptyWorldChanges(),
    };''', 1)
s = s.replace('''    if (cloudEnabled() && playerIdRef.current) {
      lastCloudSaveRef.current = Date.now();
      setCloudStatus("D1 saving");
      saveCloudSave(playerIdRef.current, resetPayload)''', '''    const resetPlayerId = (authUser && authUser.id) || playerIdRef.current;
    if (cloudEnabled() && resetPlayerId) {
      lastCloudSaveRef.current = Date.now();
      setCloudStatus(authUser ? "Account saving" : "D1 saving");
      saveCloudSave(resetPlayerId, resetPayload)''', 1)

# Final WorldScreen props.
oldcall = '''{tab === "world" && <WorldScreen game={game} player={player} worldChanges={worldChanges} onPosition={setPlayer} onDrill={drill} paused={Boolean(challenge)} resetKey={resetKey} drillDamage={drillDamage} drillRadius={drillRadius} sellCargo={sellCargo} gearCost={gearCost} upgradeGear={upgradeGear} cities={multiplayer.cities} remotePlayers={multiplayer.players} myUserId={authUser && authUser.id} myCity={myCity} waypoint={cityWaypoint} onWaypoint={setCityWaypoint} buildingCost={buildingCost} upgradeBuilding={upgradeBuilding} />}'''
newcall = '''{tab === "world" && <WorldScreen game={game} player={player} worldChanges={worldChanges} onPosition={setPlayer} onDrill={drill} paused={Boolean(challenge)} resetKey={resetKey} drillDamage={drillDamage} drillRadius={drillRadius} sellCargo={sellCargo} gearCost={gearCost} upgradeGear={upgradeGear} cities={multiplayer.cities} remotePlayers={multiplayer.players} myUserId={authUser && authUser.id} myCity={myCity} waypoint={cityWaypoint} onWaypoint={setCityWaypoint} buildingCost={buildingCost} upgradeBuilding={upgradeBuilding} resetAt={sharedWorldMeta.resetAt} sharedR2={sharedWorldMeta.r2} />}'''
if oldcall in s: s = s.replace(oldcall, newcall, 1)

p.write_text(s)
print('patched BetaGameV2.js', len(s))

# ---- WorldCityOverlay.js ----
p = Path('components/deepforge/WorldCityOverlay.js')
s = p.read_text()
s = s.replace('import { BUILDINGS } from "./data";\n', '')
helper_anchor = '''export default function WorldCityOverlay(props) {'''
helper = '''function drillToolName(level) {
  const n = Number(level) || 1;
  if (n <= 1) return "Rusty Pickaxe";
  if (n === 2) return "Iron Pickaxe";
  if (n === 3) return "Steel Pickaxe";
  if (n === 4) return "Pneumatic Pick";
  if (n === 5) return "Power Drill";
  return "Deepcore Drill Mk " + (n - 4);
}

'''
if helper_anchor in s and 'function drillToolName' not in s: s = s.replace(helper_anchor, helper + helper_anchor, 1)
old = '''              <p>Town controls only work while your miner is physically inside your city.</p>
              <div className="df-city-buildings">
                {BUILDINGS.map((building) => {
                  const level = (props.game.buildings && props.game.buildings[building.key]) || 0;
                  const cost = props.buildingCost(building);
                  return (
                    <button key={building.key} onClick={() => props.upgradeBuilding(building)}>
                      <span>{building.icon}</span>
                      <div><b>{building.name}</b><small>LEVEL {level}</small></div>
                      <em>${cost.toLocaleString()}</em>
                    </button>
                  );
                })}
              </div>'''
new = '''              <p><b>MINING SUPPLY DEPOT</b> · Gear can only be purchased while you are physically inside your own city.</p>
              <div className="df-city-buildings">
                {[
                  { key: "drill", icon: "⛏", name: drillToolName(props.game.drill), detail: "Mining tool · power " + (props.drillDamage || props.game.drill) },
                  { key: "cargoMax", icon: "🛒", name: "Heavy Haul Cart", detail: props.game.cargoMax + " ore capacity" },
                  { key: "armor", icon: "🛡", name: "Reinforced Mining Suit", detail: props.game.maxHp + " protection" },
                  { key: "blaster", icon: "⚔", name: "Steel Mining Sword", detail: "Sword level " + props.game.blaster },
                ].map((item) => {
                  const cost = props.gearCost ? props.gearCost(item.key) : 0;
                  return (
                    <button key={item.key} onClick={() => props.upgradeGear && props.upgradeGear(item.key)}>
                      <span>{item.icon}</span>
                      <div><b>{item.name}</b><small>{item.detail}</small></div>
                      <em>${cost.toLocaleString()}</em>
                    </button>
                  );
                })}
              </div>'''
if old in s: s = s.replace(old, new, 1)
p.write_text(s)
print('patched WorldCityOverlay.js', len(s))
