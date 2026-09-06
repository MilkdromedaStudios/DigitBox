from pathlib import Path

# ---- BetaGameV2 combat integration ----
p = Path('components/deepforge/BetaGameV2.js')
s = p.read_text()

s = s.replace('import { loadSharedWorld, submitSharedDigs } from "./sharedWorld";\n', 'import { loadSharedWorld, submitSharedDigs } from "./sharedWorld";\nimport { attackPlayer, loadCombatStatus, takeZombieDamage } from "./combat";\n')

s = s.replace('''  const [sharedWorldMeta, setSharedWorldMeta] = useState({ r2: false, resetAt: 0, hourKey: null, maxDigRadius: MAX_SHARED_DIG_RADIUS, cityProtectedRadius: CITY_PROTECTED_RADIUS, error: "" });
  const playerIdRef = useRef(null);''', '''  const [sharedWorldMeta, setSharedWorldMeta] = useState({ r2: false, resetAt: 0, hourKey: null, maxDigRadius: MAX_SHARED_DIG_RADIUS, cityProtectedRadius: CITY_PROTECTED_RADIUS, error: "" });
  const [combatStatus, setCombatStatus] = useState({ hp: 100, maxHp: 100, swordDamage: 14, clanId: "", defeated: false });
  const playerIdRef = useRef(null);''', 1)

s = s.replace('''  const sharedHourRef = useRef(null);
''', '''  const sharedHourRef = useRef(null);
  const defeatHandledRef = useRef(false);
  const zombieDamageBusyRef = useRef(false);
  const myCityXRef = useRef(0);
''', 1)

anchor = '''  const leaderboard = useMemo(function () {'''
if anchor in s and 'myCityXRef.current' not in s:
    s = s.replace(anchor, '''  myCityXRef.current = myCity ? Number(myCity.x) || 0 : 0;

''' + anchor, 1)

# Combat status polling, inserted before account progression loader.
anchor = '''  useEffect(function () {
    if (!loaded || !authUser || !authUser.id) return undefined;'''
combat_effect = '''  useEffect(function () {
    if (!authUser || !authUser.id) {
      setCombatStatus({ hp: 100, maxHp: 100, swordDamage: 14, clanId: "", defeated: false });
      defeatHandledRef.current = false;
      return undefined;
    }
    let stopped = false;
    async function tickCombat() {
      try {
        const data = await loadCombatStatus();
        if (stopped) return;
        setCombatStatus(data);
        setGame(function (current) {
          if (current.hp === Number(data.hp) && current.maxHp === Number(data.maxHp)) return current;
          return { ...current, hp: Number(data.hp), maxHp: Number(data.maxHp) };
        });
        if (data.defeated && !defeatHandledRef.current) {
          defeatHandledRef.current = true;
          const x = myCityXRef.current;
          setPlayer({ x: x, y: surfaceHeight(x) - 0.42 });
          setResetKey(function (value) { return value + 1; });
          setNotice("You were defeated. Respawning at your city…");
        }
        if (!data.defeated && Number(data.hp) > 0) defeatHandledRef.current = false;
      } catch (_) {}
    }
    tickCombat();
    const timer = setInterval(tickCombat, 900);
    return function () { stopped = true; clearInterval(timer); };
  }, [authUser ? authUser.id : ""]);

'''
if anchor in s and combat_effect not in s:
    s = s.replace(anchor, combat_effect + anchor, 1)

# Add combat handlers before sellCargo.
anchor = '''  function sellCargo() {'''
handlers = '''  async function handlePlayerAttack(targetId) {
    if (!authUser || !authUser.id) { setNotice("Log in before fighting other players."); return; }
    try {
      const result = await attackPlayer(targetId);
      setNotice(result.defeated ? "Player defeated! ⚔" : "Sword hit for " + result.damage + " damage · " + result.targetHp + "/" + result.targetMaxHp + " HP");
    } catch (error) {
      setNotice(error && error.message ? error.message : "PvP attack failed.");
    }
  }

  async function handleZombieDamage(amount) {
    if (!authUser || !authUser.id || zombieDamageBusyRef.current) return;
    zombieDamageBusyRef.current = true;
    try {
      const result = await takeZombieDamage(amount);
      setCombatStatus(function (current) { return { ...current, hp: Number(result.hp), maxHp: Number(result.maxHp), defeated: Boolean(result.defeated) }; });
      setGame(function (current) { return { ...current, hp: Number(result.hp), maxHp: Number(result.maxHp) }; });
    } catch (_) {
    } finally {
      zombieDamageBusyRef.current = false;
    }
  }

  function handleZombieKill() {
    setGame(function (current) { return { ...current, coins: current.coins + 25 }; });
    setNotice("Zombie defeated · +$25 bounty.");
  }

'''
if anchor in s and 'async function handlePlayerAttack' not in s:
    s = s.replace(anchor, handlers + anchor, 1)

# Pass combat props into InfiniteWorld.
needle = '''        myUserId={props.myUserId}
      />'''
replacement = '''        myUserId={props.myUserId}
        playerHp={props.playerHp}
        playerMaxHp={props.playerMaxHp}
        swordDamage={props.swordDamage}
        onPlayerAttack={props.onPlayerAttack}
        onZombieDamage={props.onZombieDamage}
        onZombieKill={props.onZombieKill}
      />'''
if needle in s: s = s.replace(needle, replacement, 1)

oldcall = '''resetAt={sharedWorldMeta.resetAt} sharedR2={sharedWorldMeta.r2} />}'''
newcall = '''resetAt={sharedWorldMeta.resetAt} sharedR2={sharedWorldMeta.r2} playerHp={combatStatus.hp} playerMaxHp={combatStatus.maxHp} swordDamage={combatStatus.swordDamage || Math.min(60, 10 + game.blaster * 4)} onPlayerAttack={handlePlayerAttack} onZombieDamage={handleZombieDamage} onZombieKill={handleZombieKill} />}'''
if oldcall in s: s = s.replace(oldcall, newcall, 1)

p.write_text(s)
print('patched BetaGameV2 combat', len(s))

# ---- InfiniteWorld zombies, sword, held E ----
p = Path('components/deepforge/InfiniteWorld.js')
s = p.read_text()

helper_anchor = '''export default function InfiniteWorld(props) {'''
helper = r'''function drawZombie(ctx, zombie, cameraX, cameraY, ppu, width, height, light) {
  const sx = worldToScreenX(zombie.x, cameraX, ppu, width);
  const sy = worldToScreenY(zombie.y, cameraY, ppu, height);
  if (sx < -70 || sx > width + 70 || sy < -80 || sy > height + 80) return;
  const scale = clamp(ppu / 48, 0.82, 1.18);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(scale, scale);
  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.beginPath(); ctx.ellipse(0, 20, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = light < 0.35 ? "#436a45" : "#5b7f55";
  ctx.fillRect(-10, -6, 20, 22);
  ctx.fillStyle = "#6f8f63";
  ctx.beginPath(); ctx.arc(0, -14, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ff5148";
  ctx.fillRect(-5, -17, 3, 2); ctx.fillRect(3, -17, 3, 2);
  ctx.strokeStyle = "#4c382f"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-18, 8); ctx.moveTo(9, 0); ctx.lineTo(18, 8); ctx.stroke();
  ctx.strokeStyle = "#313638";
  ctx.beginPath(); ctx.moveTo(-5, 15); ctx.lineTo(-8, 24); ctx.moveTo(5, 15); ctx.lineTo(8, 24); ctx.stroke();
  const ratio = clamp(zombie.hp / zombie.maxHp, 0, 1);
  ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillRect(-15, -31, 30, 4);
  ctx.fillStyle = ratio > 0.5 ? "#63d17d" : "#d66b58"; ctx.fillRect(-15, -31, 30 * ratio, 4);
  ctx.restore();
}

'''
if helper_anchor in s and 'function drawZombie(' not in s:
    s = s.replace(helper_anchor, helper + helper_anchor, 1)

s = s.replace('''  const myUserIdRef = useRef(props.myUserId || "");
''', '''  const myUserIdRef = useRef(props.myUserId || "");
  const playerAttackCbRef = useRef(props.onPlayerAttack);
  const zombieDamageCbRef = useRef(props.onZombieDamage);
  const zombieKillCbRef = useRef(props.onZombieKill);
  const swordDamageRef = useRef(Number(props.swordDamage) || 14);
  const zombiesRef = useRef([]);
  const lastZombieSpawnRef = useRef(0);
  const lastZombieBiteRef = useRef(0);
  const swordSwingRef = useRef(0);
''', 1)

s = s.replace('''  useEffect(() => { myUserIdRef.current = props.myUserId || ""; }, [props.myUserId]);
''', '''  useEffect(() => { myUserIdRef.current = props.myUserId || ""; }, [props.myUserId]);
  useEffect(() => { playerAttackCbRef.current = props.onPlayerAttack; }, [props.onPlayerAttack]);
  useEffect(() => { zombieDamageCbRef.current = props.onZombieDamage; }, [props.onZombieDamage]);
  useEffect(() => { zombieKillCbRef.current = props.onZombieKill; }, [props.onZombieKill]);
  useEffect(() => { swordDamageRef.current = Number(props.swordDamage) || 14; }, [props.swordDamage]);
''', 1)

old_input = '''  useEffect(() => {
    function down(event) {
      keysRef.current[event.key.toLowerCase()] = true;
      if ((event.code === "KeyE" || event.code === "Space") && !event.repeat) {
        event.preventDefault();
        fireDrill();
      }
    }
    function up(event) {
      keysRef.current[event.key.toLowerCase()] = false;
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  function fireDrill() {'''
new_input = '''  useEffect(() => {
    function down(event) {
      keysRef.current[event.key.toLowerCase()] = true;
      if (event.code === "KeyE" && !event.repeat) {
        event.preventDefault();
        fireDrill();
        if (!drillTimerRef.current) drillTimerRef.current = setInterval(fireDrill, 180);
      } else if (event.code === "Space" && !event.repeat) {
        event.preventDefault();
        fireDrill();
      } else if (event.code === "KeyF" && !event.repeat) {
        event.preventDefault();
        swingSword();
      }
    }
    function up(event) {
      keysRef.current[event.key.toLowerCase()] = false;
      if (event.code === "KeyE" && drillTimerRef.current) {
        clearInterval(drillTimerRef.current);
        drillTimerRef.current = null;
      }
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  function swingSword(event) {
    if (event) { event.stopPropagation(); event.preventDefault(); }
    if (pausedRef.current) return;
    swordSwingRef.current = performance.now();
    const p = playerRef.current;
    let bestZombie = null;
    let bestZombieDistance = Infinity;
    for (const zombie of zombiesRef.current) {
      const dx = zombie.x - p.x;
      const dy = zombie.y - p.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= 2.35 && distance < bestZombieDistance) { bestZombie = zombie; bestZombieDistance = distance; }
    }
    if (bestZombie) {
      bestZombie.hp -= Math.max(1, Number(swordDamageRef.current) || 14);
      if (bestZombie.hp <= 0) {
        zombiesRef.current = zombiesRef.current.filter((zombie) => zombie.id !== bestZombie.id);
        if (zombieKillCbRef.current) zombieKillCbRef.current(bestZombie);
      }
      return;
    }
    let bestPlayer = null;
    let bestDistance = Infinity;
    for (const remote of remotePlayersRef.current) {
      if (!remote || remote.id === myUserIdRef.current) continue;
      const dx = Number(remote.x) - p.x;
      const dy = Number(remote.y) - p.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= 2.45 && distance < bestDistance) { bestPlayer = remote; bestDistance = distance; }
    }
    if (bestPlayer && playerAttackCbRef.current) playerAttackCbRef.current(bestPlayer.id);
  }

  function fireDrill() {'''
if old_input in s:
    s = s.replace(old_input, new_input, 1)

# Night zombie update immediately after sky state exists.
anchor = '''      const day = drawSky(ctx, width, height, cameraX, now);
'''
zombie_update = '''      const day = drawSky(ctx, width, height, cameraX, now);

      // Night survival: surface zombies spawn around the active miner and chase them until sunrise.
      const nearSurface = depth < 1.4;
      if (day.light < 0.27 && nearSurface && !pausedRef.current) {
        if (now - lastZombieSpawnRef.current > 2400 && zombiesRef.current.length < 6) {
          lastZombieSpawnRef.current = now;
          const side = visualNoise(Math.floor(now / 2400), Math.floor(p.x), 1201) > 0.5 ? 1 : -1;
          let zx = p.x + side * (6.5 + visualNoise(Math.floor(now / 1700), 0, 1202) * 5.5);
          let attempts = 0;
          while (citiesRef.current.some((city) => Math.abs(Number(city.x) - zx) < 9) && attempts < 4) { zx += side * 5; attempts += 1; }
          zombiesRef.current.push({ id: "z_" + now + "_" + Math.random().toString(36).slice(2, 7), x: zx, y: surfaceHeight(zx) - 0.38, hp: 35, maxHp: 35 });
        }
        for (const zombie of zombiesRef.current) {
          const direction = p.x < zombie.x ? -1 : 1;
          zombie.x += direction * 1.15 * dt;
          zombie.y = surfaceHeight(zombie.x) - 0.38;
          const dx = zombie.x - p.x;
          const dy = zombie.y - p.y;
          if (Math.sqrt(dx * dx + dy * dy) < 0.72 && now - lastZombieBiteRef.current > 950) {
            lastZombieBiteRef.current = now;
            if (zombieDamageCbRef.current) zombieDamageCbRef.current(7);
          }
        }
      } else if (day.light > 0.42) {
        zombiesRef.current = [];
      }
'''
if anchor in s and 'Night survival: surface zombies' not in s:
    s = s.replace(anchor, zombie_update, 1)

# Draw zombies before remote players.
anchor = '''      for (const remote of remotePlayersRef.current) {'''
zd = '''      for (const zombie of zombiesRef.current) {
        drawZombie(ctx, zombie, cameraX, cameraY, ppu, width, height, day.light);
      }

'''
if anchor in s and 'drawZombie(ctx, zombie' not in s.split(anchor)[0][-500:]:
    s = s.replace(anchor, zd + anchor, 1)

# Sword swing visual after local miner.
needle = '''      drawMiner(ctx, playerScreenX, playerScreenY, facingRef.current, moving, ppu, day.light, day.angle);

      drawLighting'''
replacement = '''      drawMiner(ctx, playerScreenX, playerScreenY, facingRef.current, moving, ppu, day.light, day.angle);
      if (now - swordSwingRef.current < 230) {
        const progress = clamp((now - swordSwingRef.current) / 230, 0, 1);
        ctx.save();
        ctx.strokeStyle = "rgba(225,235,238," + (0.9 - progress * 0.5) + ")";
        ctx.lineWidth = 4;
        ctx.beginPath();
        const direction = facingRef.current < 0 ? -1 : 1;
        ctx.arc(playerScreenX, playerScreenY - 8, 32, direction < 0 ? Math.PI * 0.75 : -Math.PI * 0.25, direction < 0 ? Math.PI * 1.35 : Math.PI * 0.35);
        ctx.stroke();
        ctx.restore();
      }

      drawLighting'''
if needle in s: s = s.replace(needle, replacement, 1)

# HUD HP.
s = s.replace('''        <small>{hud.time}</small>
      </div>''', '''        <small>{hud.time} · HP {Math.max(0, Math.round(Number(props.playerHp) || 0))}/{Math.max(1, Math.round(Number(props.playerMaxHp) || 100))}</small>
      </div>''', 1)

# Add sword button and update controls text.
needle = '''        <div className="df-world-tip">WASD moves · mouse aims · hold DIG or Space · touch: drag to move</div>'''
replacement = '''        <button
          onPointerDown={swingSword}
          aria-label="Swing sword"
          style={{position:"absolute",right:92,bottom:14,zIndex:8,minWidth:66,height:48,border:"1px solid rgba(225,235,238,.22)",borderRadius:12,background:"rgba(24,30,32,.9)",color:"#e6ecee",fontWeight:900,cursor:"pointer",touchAction:"none"}}
        >
          <span style={{display:"block",fontSize:18}}>⚔</span>
          <b style={{fontSize:9}}>SWORD</b>
        </button>

        <div className="df-world-tip">WASD moves · mouse aims · hold E or DIG · F sword · touch: drag to move</div>'''
if needle in s: s = s.replace(needle, replacement, 1)
s = s.replace('aria-label="Excavate circular terrain"', 'aria-label="Excavate square terrain"')

p.write_text(s)
print('patched InfiniteWorld combat', len(s))

# ---- Lock user_ saves to authenticated account in Edge adapter ----
p = Path('pages/api/deepforge/[[...path]].js')
s = p.read_text()
anchor = '''    const forwarded = new Request(incoming.toString(), request);
    return deepforgeWorker.fetch(forwarded, env);'''
secure = '''    if (incoming.pathname.startsWith("/v1/save/user_") && (request.method === "GET" || request.method === "PUT")) {
      await ensureSchema(request, env, incoming);
      const row = await authenticatedUser(request, env);
      if (!row) return json({ error: "Log in to access account progression." }, 401);
      const requestedUserId = decodeURIComponent(incoming.pathname.slice("/v1/save/".length));
      if (requestedUserId !== row.id) return json({ error: "You cannot access another player's progression." }, 403);
    }

    const forwarded = new Request(incoming.toString(), request);
    return deepforgeWorker.fetch(forwarded, env);'''
if anchor in s and 'You cannot access another player' not in s:
    s = s.replace(anchor, secure, 1)
p.write_text(s)
print('patched Edge account save lock', len(s))
