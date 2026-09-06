from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"Missing patch anchor: {label}")
    return text.replace(old, new, 1)


# ---------- InfiniteWorld: aim, digging, city rendering, remote players ----------
path = Path("components/deepforge/InfiniteWorld.js")
s = path.read_text()

helper = r'''
function resolveDrillTarget(player, aim, radius, changes) {
  let ax = Number(aim && aim.x) || 0;
  let ay = Number(aim && aim.y) || 0;
  let magnitude = Math.sqrt(ax * ax + ay * ay);
  if (magnitude < 0.08) {
    ax = 0;
    ay = 1;
    magnitude = 1;
  }
  ax /= magnitude;
  ay /= magnitude;

  const start = PLAYER_RADIUS + 0.08;
  const maxDistance = 1.18 + radius * 0.9;
  let hitDistance = null;
  for (let distance = start; distance <= maxDistance; distance += 0.08) {
    if (isSolidAt(player.x + ax * distance, player.y + ay * distance, changes)) {
      hitDistance = distance;
      break;
    }
  }

  if (hitDistance === null) {
    return {
      x: player.x + ax * maxDistance,
      y: player.y + ay * maxDistance,
      ax,
      ay,
      hit: false,
    };
  }

  const centerDistance = Math.min(maxDistance, hitDistance + Math.min(0.38, radius * 0.42));
  return {
    x: player.x + ax * centerDistance,
    y: player.y + ay * centerDistance,
    ax,
    ay,
    hit: true,
  };
}

function drawWorldCity(ctx, city, cameraX, cameraY, ppu, width, height, light) {
  const centerX = Number(city && city.x);
  if (!Number.isFinite(centerX)) return;
  const centerScreenX = worldToScreenX(centerX, cameraX, ppu, width);
  if (centerScreenX < -520 || centerScreenX > width + 520) return;

  ctx.save();
  ctx.globalAlpha = 0.78 + light * 0.2;
  ctx.strokeStyle = "rgba(68,62,54,.9)";
  ctx.lineWidth = Math.max(4, ppu * 0.12);
  ctx.beginPath();
  let first = true;
  for (let wx = centerX - 7.5; wx <= centerX + 7.5; wx += 0.35) {
    const sx = worldToScreenX(wx, cameraX, ppu, width);
    const sy = worldToScreenY(surfaceHeight(wx) - 0.02, cameraY, ppu, height);
    if (first) { ctx.moveTo(sx, sy); first = false; }
    else ctx.lineTo(sx, sy);
  }
  ctx.stroke();

  const buildings = [
    { dx: -5.2, w: 1.8, h: 2.7 },
    { dx: -2.5, w: 2.2, h: 3.8 },
    { dx: 0.3, w: 2.4, h: 4.7 },
    { dx: 3.2, w: 2.0, h: 3.3 },
    { dx: 5.6, w: 1.5, h: 2.4 },
  ];

  buildings.forEach((building, index) => {
    const wx = centerX + building.dx;
    const ground = surfaceHeight(wx);
    const sx = worldToScreenX(wx, cameraX, ppu, width);
    const sy = worldToScreenY(ground, cameraY, ppu, height);
    const bw = building.w * ppu;
    const bh = building.h * ppu;
    ctx.fillStyle = index === 2 ? "#5a5042" : index % 2 ? "#6b5a47" : "#51483d";
    ctx.fillRect(sx - bw / 2, sy - bh, bw, bh);
    ctx.fillStyle = "#342f2a";
    ctx.fillRect(sx - bw * 0.57, sy - bh - ppu * 0.18, bw * 1.14, ppu * 0.2);
    ctx.fillStyle = city.online ? "rgba(255,219,126,.72)" : "rgba(150,164,166,.36)";
    const windowSize = Math.max(2, ppu * 0.12);
    for (let wy = sy - bh + ppu * 0.45; wy < sy - ppu * 0.35; wy += ppu * 0.55) {
      ctx.fillRect(sx - bw * 0.24, wy, windowSize, windowSize);
      ctx.fillRect(sx + bw * 0.13, wy, windowSize, windowSize);
    }
  });

  const signY = worldToScreenY(surfaceHeight(centerX) - 5.8, cameraY, ppu, height);
  const label = String(city.ownerName || "MINER").toUpperCase() + " CITY";
  ctx.font = "700 11px ui-sans-serif, system-ui, sans-serif";
  const textWidth = ctx.measureText(label).width;
  ctx.fillStyle = "rgba(17,22,22,.84)";
  ctx.fillRect(centerScreenX - textWidth / 2 - 9, signY - 14, textWidth + 18, 23);
  ctx.strokeStyle = city.online ? "rgba(91,217,143,.65)" : "rgba(173,157,122,.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(centerScreenX - textWidth / 2 - 9, signY - 14, textWidth + 18, 23);
  ctx.fillStyle = "#e5dcc7";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, centerScreenX, signY - 2);
  ctx.restore();
}

function drawRemoteMiner(ctx, remote, cameraX, cameraY, ppu, width, height, light, sunAngle, changes) {
  if (!remote || !Number.isFinite(Number(remote.x)) || !Number.isFinite(Number(remote.y))) return;
  const rx = Number(remote.x);
  const ry = Number(remote.y);
  const depth = ry - surfaceHeight(rx);
  if (depth > 1.2 && isSolidAt(rx, ry, changes)) return;
  const sx = worldToScreenX(rx, cameraX, ppu, width);
  const sy = worldToScreenY(ry, cameraY, ppu, height);
  if (sx < -80 || sx > width + 80 || sy < -100 || sy > height + 100) return;

  ctx.save();
  ctx.globalAlpha = 0.9;
  drawMiner(ctx, sx, sy, 1, false, ppu * 0.9, light, sunAngle);
  const label = String(remote.name || "Miner").slice(0, 22);
  ctx.font = "700 10px ui-sans-serif, system-ui, sans-serif";
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = "rgba(10,17,19,.82)";
  ctx.fillRect(sx - tw / 2 - 6, sy - 58, tw + 12, 18);
  ctx.fillStyle = "#bfe8d0";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, sx, sy - 49);
  ctx.restore();
}
'''
s = replace_once(s, "\nexport default function InfiniteWorld(props) {", "\n" + helper + "\nexport default function InfiniteWorld(props) {", "world helper insertion")

s = replace_once(
    s,
    "  const drillRadiusRef = useRef(props.drillRadius || 0.78);",
    "  const drillRadiusRef = useRef(props.drillRadius || 0.78);\n  const mouseAimRef = useRef(false);\n  const playerScreenRef = useRef({ x: 0, y: 0 });\n  const citiesRef = useRef(Array.isArray(props.cities) ? props.cities : []);\n  const remotePlayersRef = useRef(Array.isArray(props.remotePlayers) ? props.remotePlayers : []);\n  const myUserIdRef = useRef(props.myUserId || \"\");",
    "world refs",
)

s = replace_once(
    s,
    "  useEffect(() => { drillRadiusRef.current = props.drillRadius || 0.78; }, [props.drillRadius]);",
    "  useEffect(() => { drillRadiusRef.current = props.drillRadius || 0.78; }, [props.drillRadius]);\n  useEffect(() => { citiesRef.current = Array.isArray(props.cities) ? props.cities : []; }, [props.cities]);\n  useEffect(() => { remotePlayersRef.current = Array.isArray(props.remotePlayers) ? props.remotePlayers : []; }, [props.remotePlayers]);\n  useEffect(() => { myUserIdRef.current = props.myUserId || \"\"; }, [props.myUserId]);",
    "world prop refs",
)

s = replace_once(
    s,
    "    facingRef.current = 1;\n    lastReportRef.current = 0;",
    "    facingRef.current = 1;\n    mouseAimRef.current = false;\n    lastReportRef.current = 0;",
    "world reset aim",
)

old_fire = r'''    let aim = aimRef.current;
    const liveMove = moveRef.current;
    const liveMagnitude = Math.sqrt(liveMove.x * liveMove.x + liveMove.y * liveMove.y);
    const surfaceDepth = p.y - surfaceHeight(p.x);
    if (surfaceDepth < 0.9 && liveMagnitude < 0.2) {
      aim = { x: 0, y: 1 };
    }
    const magnitude = Math.sqrt(aim.x * aim.x + aim.y * aim.y);
    if (magnitude < 0.2) aim = { x: 0, y: 1 };
    const normalized = Math.sqrt(aim.x * aim.x + aim.y * aim.y) || 1;
    const ax = aim.x / normalized;
    const ay = aim.y / normalized;
    const radius = drillRadiusRef.current;
    const distance = 0.86 + radius * 0.38;

    drillCbRef.current({
      x: p.x + ax * distance,
      y: p.y + ay * distance,
      radius,
      aimX: ax,
      aimY: ay,
    });'''
new_fire = r'''    let aim = aimRef.current;
    const liveMove = moveRef.current;
    const liveMagnitude = Math.sqrt(liveMove.x * liveMove.x + liveMove.y * liveMove.y);
    const surfaceDepth = p.y - surfaceHeight(p.x);
    if (!mouseAimRef.current && surfaceDepth < 0.9 && liveMagnitude < 0.2) {
      aim = { x: 0, y: 1 };
    }
    const radius = drillRadiusRef.current;
    const target = resolveDrillTarget(p, aim, radius, changesRef.current);
    if (!target.hit) return;

    drillCbRef.current({
      x: target.x,
      y: target.y,
      radius,
      aimX: target.ax,
      aimY: target.ay,
    });'''
s = replace_once(s, old_fire, new_fire, "raycast drill")

s = replace_once(
    s,
    "        aimRef.current = { x: inputX, y: inputY };",
    "        if (!mouseAimRef.current) aimRef.current = { x: inputX, y: inputY };",
    "keyboard no longer steals mouse aim",
)

old_horizontal = r'''        const nx = p.x + v.x * dt;
        if (!collides(nx, p.y, changes)) {
          p.x = nx;
        } else {
          v.x = 0;
        }'''
new_horizontal = r'''        const nx = p.x + v.x * dt;
        if (!collides(nx, p.y, changes)) {
          p.x = nx;
        } else {
          let stepped = false;
          if (Math.abs(v.x) > 0.08 && depth < 1.35) {
            for (let step = 0.1; step <= 0.6; step += 0.1) {
              if (!collides(p.x, p.y - step, changes) && !collides(nx, p.y - step, changes)) {
                p.y -= step;
                p.x = nx;
                stepped = true;
                break;
              }
            }
          }
          if (!stepped) v.x = 0;
        }'''
s = replace_once(s, old_horizontal, new_horizontal, "surface step climbing")

city_insert = r'''      for (const city of citiesRef.current) {
        drawWorldCity(ctx, city, cameraX, cameraY, ppu, width, height, day.light);
      }
      for (const remote of remotePlayersRef.current) {
        if (remote.id !== myUserIdRef.current) {
          drawRemoteMiner(ctx, remote, cameraX, cameraY, ppu, width, height, day.light, day.angle, changesNow);
        }
      }

'''
s = replace_once(s, "      const playerScreenX = width / 2;", city_insert + "      const playerScreenX = width / 2;", "city and remote player drawing")

s = replace_once(
    s,
    "      const playerScreenY = worldToScreenY(p.y, cameraY, ppu, height);",
    "      const playerScreenY = worldToScreenY(p.y, cameraY, ppu, height);\n      playerScreenRef.current = { x: playerScreenX, y: playerScreenY };",
    "player screen tracking",
)

old_preview = r'''      let previewAim = aimRef.current;
      const previewMoveMagnitude = Math.sqrt(moveRef.current.x * moveRef.current.x + moveRef.current.y * moveRef.current.y);
      if (depth < 0.9 && previewMoveMagnitude < 0.2) previewAim = { x: 0, y: 1 };
      const previewMag = Math.sqrt(previewAim.x * previewAim.x + previewAim.y * previewAim.y) || 1;
      const pax = previewAim.x / previewMag;
      const pay = previewAim.y / previewMag;
      const previewDistance = 0.86 + drillRadiusRef.current * 0.38;
      const reticleX = playerScreenX + pax * previewDistance * ppu;
      const reticleY = playerScreenY + pay * previewDistance * ppu;
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = depth < 1 ? "rgba(255,248,218,.58)" : "rgba(255,224,155,.46)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(reticleX, reticleY, drillRadiusRef.current * ppu, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();'''
new_preview = r'''      let previewAim = aimRef.current;
      const previewMoveMagnitude = Math.sqrt(moveRef.current.x * moveRef.current.x + moveRef.current.y * moveRef.current.y);
      if (!mouseAimRef.current && depth < 0.9 && previewMoveMagnitude < 0.2) previewAim = { x: 0, y: 1 };
      const previewTarget = resolveDrillTarget(p, previewAim, drillRadiusRef.current, changesNow);
      const reticleX = worldToScreenX(previewTarget.x, cameraX, ppu, width);
      const reticleY = worldToScreenY(previewTarget.y, cameraY, ppu, height);
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = previewTarget.hit
        ? (depth < 1 ? "rgba(255,248,218,.68)" : "rgba(255,224,155,.58)")
        : "rgba(164,177,177,.27)";
      ctx.lineWidth = previewTarget.hit ? 1.7 : 1.2;
      ctx.beginPath();
      ctx.arc(reticleX, reticleY, drillRadiusRef.current * ppu, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();'''
s = replace_once(s, old_preview, new_preview, "raycast reticle")

s = replace_once(s, "    drillTimerRef.current = setInterval(fireDrill, 260);", "    drillTimerRef.current = setInterval(fireDrill, 180);", "smoother hold dig")

old_start = r'''  function startStick(event) {
    if (props.paused) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const rect = viewportRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    pointerRef.current = { id: event.pointerId, x, y };
    moveRef.current = { x: 0, y: 0 };
    setJoystick({ visible: true, x, y, dx: 0, dy: 0 });
    if (event.currentTarget.setPointerCapture) event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function moveStick(event) {
    const active = pointerRef.current;
    if (!active || active.id !== event.pointerId) return;'''
new_start = r'''  function setMouseAim(event) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const playerScreen = playerScreenRef.current;
    const dx = event.clientX - rect.left - playerScreen.x;
    const dy = event.clientY - rect.top - playerScreen.y;
    const magnitude = Math.sqrt(dx * dx + dy * dy);
    if (magnitude > 5) {
      aimRef.current = { x: dx / magnitude, y: dy / magnitude };
      mouseAimRef.current = true;
    }
  }

  function startStick(event) {
    if (props.paused) return;
    if (event.pointerType === "mouse") {
      if (event.button !== 0) return;
      setMouseAim(event);
      event.preventDefault();
      return;
    }
    const rect = viewportRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    pointerRef.current = { id: event.pointerId, x, y };
    moveRef.current = { x: 0, y: 0 };
    setJoystick({ visible: true, x, y, dx: 0, dy: 0 });
    if (event.currentTarget.setPointerCapture) event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function moveStick(event) {
    if (event.pointerType === "mouse") {
      setMouseAim(event);
      return;
    }
    const active = pointerRef.current;
    if (!active || active.id !== event.pointerId) return;'''
s = replace_once(s, old_start, new_start, "separate mouse aim from movement")

s = replace_once(
    s,
    '        <div className="df-world-tip">Drag to move · hold DIG · free SURFACE rescue appears underground</div>',
    '        <div className="df-world-tip">WASD moves · mouse aims · hold DIG or Space · touch: drag to move</div>',
    "world controls tip",
)

path.write_text(s)


# ---------- BetaGameV2: D1 presence, physical cities, no Town tab ----------
path = Path("components/deepforge/BetaGameV2.js")
s = path.read_text()

s = replace_once(
    s,
    'import InfiniteWorld from "./InfiniteWorld";',
    'import InfiniteWorld from "./InfiniteWorld";\nimport WorldCityOverlay from "./WorldCityOverlay";',
    "city overlay import",
)
s = replace_once(
    s,
    'import { checkCloudBackend, cloudEnabled, cloudLogin, cloudLogout, cloudSignup, getOrCreatePlayerId, loadCloudAuth, loadCloudSave, saveCloudSave, syncClanProfile } from "./cloudSync";',
    'import { checkCloudBackend, cloudEnabled, cloudLogin, cloudLogout, cloudSignup, getOrCreatePlayerId, loadCloudAuth, loadCloudSave, saveCloudSave, syncClanProfile } from "./cloudSync";\nimport { leaveMultiplayerWorld, syncMultiplayerPresence } from "./multiplayer";',
    "multiplayer import",
)

s = replace_once(
    s,
    "        resetKey={props.resetKey}\n      />",
    "        resetKey={props.resetKey}\n        cities={props.cities}\n        remotePlayers={props.remotePlayers}\n        myUserId={props.myUserId}\n      />\n\n      <WorldCityOverlay\n        player={props.player}\n        cities={props.cities}\n        players={props.remotePlayers}\n        myCity={props.myCity}\n        waypoint={props.waypoint}\n        onWaypoint={props.onWaypoint}\n        game={props.game}\n        buildingCost={props.buildingCost}\n        upgradeBuilding={props.upgradeBuilding}\n      />",
    "world multiplayer props and city overlay",
)

s = replace_once(
    s,
    '  const [cloudStatus, setCloudStatus] = useState(cloudEnabled() ? "D1 connecting" : "D1-ready · local save");\n  const playerIdRef = useRef(null);\n  const lastCloudSaveRef = useRef(0);',
    '  const [cloudStatus, setCloudStatus] = useState(cloudEnabled() ? "D1 connecting" : "D1-ready · local save");\n  const [multiplayer, setMultiplayer] = useState({ players: [], cities: [], me: null });\n  const [cityWaypoint, setCityWaypoint] = useState(null);\n  const playerIdRef = useRef(null);\n  const lastCloudSaveRef = useRef(0);\n  const multiplayerLiveRef = useRef({ player: DEFAULT_PLAYER, companyValue: 0, trophies: 0 });',
    "multiplayer state",
)

s = replace_once(
    s,
    "  const warPower = Math.round((raidPower + game.armor * 12 + companyValue * 0.012) * (1 + (researchTech.tactics || 0) * 0.12));",
    "  const warPower = Math.round((raidPower + game.armor * 12 + companyValue * 0.012) * (1 + (researchTech.tactics || 0) * 0.12));\n  multiplayerLiveRef.current = { player, companyValue, trophies: game.trophies };\n  const myCity = multiplayer.me\n    ? (multiplayer.cities.find(function (city) { return city.ownerId === multiplayer.me.id; }) || { ownerId: multiplayer.me.id, ownerName: multiplayer.me.name, x: multiplayer.me.cityX, online: true })\n    : null;",
    "multiplayer live values",
)

multiplayer_effect = r'''
  useEffect(function () {
    if (!authUser || !authUser.id) {
      setMultiplayer({ players: [], cities: [], me: null });
      setCityWaypoint(null);
      return undefined;
    }

    let stopped = false;
    let timer = null;
    async function tick() {
      const live = multiplayerLiveRef.current;
      try {
        const data = await syncMultiplayerPresence({
          x: live.player.x,
          y: live.player.y,
          companyValue: live.companyValue,
          trophies: live.trophies,
        });
        if (stopped) return;
        const next = {
          players: Array.isArray(data.players) ? data.players : [],
          cities: Array.isArray(data.cities) ? data.cities : [],
          me: data.me || null,
        };
        setMultiplayer(next);
        setCityWaypoint(function (current) {
          const own = next.me ? next.cities.find(function (city) { return city.ownerId === next.me.id; }) : null;
          if (!current) return own || null;
          return next.cities.find(function (city) { return city.ownerId === current.ownerId; }) || own || null;
        });
      } catch (_) {
        if (!stopped) setMultiplayer(function (current) { return { ...current, players: [] }; });
      }
    }

    tick();
    timer = setInterval(tick, 1000);
    return function () {
      stopped = true;
      if (timer) clearInterval(timer);
    };
  }, [authUser ? authUser.id : ""]);
'''
s = replace_once(
    s,
    "  useEffect(function () {\n    let cancelled = false;\n    const playerId = getOrCreatePlayerId();",
    multiplayer_effect + "\n  useEffect(function () {\n    let cancelled = false;\n    const playerId = getOrCreatePlayerId();",
    "multiplayer presence effect",
)

s = replace_once(
    s,
    "    try {\n      await cloudLogout();",
    "    try {\n      await leaveMultiplayerWorld().catch(function () {});\n      await cloudLogout();",
    "logout multiplayer presence",
)

s = replace_once(
    s,
    '{[["world","⛏ Mine"],["empire","🏚 Town"],["clan","👥 Clans"],["league","⚔ Clan Wars"],["research","🔬 Research"]].map(function (item) {',
    '{[["world","⛏ World"],["clan","👥 Clans"],["league","⚔ Clan Wars"],["research","🔬 Research"]].map(function (item) {',
    "remove town tab",
)

old_world_render = '        {tab === "world" && <WorldScreen game={game} player={player} worldChanges={worldChanges} onPosition={setPlayer} onDrill={drill} paused={Boolean(challenge)} resetKey={resetKey} drillDamage={drillDamage} drillRadius={drillRadius} sellCargo={sellCargo} gearCost={gearCost} upgradeGear={upgradeGear} />}\n        {tab === "empire" && <EmpireScreen game={game} companyValue={companyValue} cityDefense={cityDefense} buildingCost={buildingCost} upgradeBuilding={upgradeBuilding} />}'
new_world_render = '        {tab === "world" && <WorldScreen game={game} player={player} worldChanges={worldChanges} onPosition={setPlayer} onDrill={drill} paused={Boolean(challenge)} resetKey={resetKey} drillDamage={drillDamage} drillRadius={drillRadius} sellCargo={sellCargo} gearCost={gearCost} upgradeGear={upgradeGear} cities={multiplayer.cities} remotePlayers={multiplayer.players} myUserId={authUser && authUser.id} myCity={myCity} waypoint={cityWaypoint} onWaypoint={setCityWaypoint} buildingCost={buildingCost} upgradeBuilding={upgradeBuilding} />}'
s = replace_once(s, old_world_render, new_world_render, "physical world city render")

s = replace_once(
    s,
    '<footer className="df2-footer"><span>{cloudStatus}</span><span>{player.x.toFixed(1)}, {player.y.toFixed(1)}</span><button onClick={reset}>Reset</button></footer>',
    '<footer className="df2-footer"><span>{cloudStatus}</span><span>{authUser ? multiplayer.players.length + " online · " : ""}{player.x.toFixed(1)}, {player.y.toFixed(1)}</span><button onClick={reset}>Reset</button></footer>',
    "multiplayer footer",
)

path.write_text(s)
