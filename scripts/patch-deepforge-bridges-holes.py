from pathlib import Path

p = Path('components/deepforge/InfiniteWorld.js')
s = p.read_text()

# 1. Make cave interiors dramatically darker.
s = s.replace('caveGrad.addColorStop(0, "rgba(59,47,37,.72)");\n      caveGrad.addColorStop(1, "rgba(19,20,19,.98)");',
'''caveGrad.addColorStop(0, "rgba(4,4,5,.98)");
      caveGrad.addColorStop(0.35, "rgba(1,2,3,.995)");
      caveGrad.addColorStop(1, "rgba(0,0,0,1)");''')

# 2. Add bridge helpers before collides.
anchor = 'function collides(x, y, changes) {'
helpers = r'''function surfaceBridgeAt(x, y, changes) {
  const nearby = cutsNear(normalizeWorldChanges(changes), x - 5.5, y - 4, x + 5.5, y + 4);
  for (const cut of nearby) {
    const radius = Number(cut.r) || 0;
    if (radius < 1.25) continue;
    const surface = surfaceHeight(cut.x);
    // Only bridge holes that actually break through or come very close to the surface.
    if (Math.abs(Number(cut.y) - surface) > radius + 0.9) continue;
    const halfSpan = Math.max(1.8, Math.min(7.5, radius * 1.35));
    if (Math.abs(x - Number(cut.x)) > halfSpan) continue;
    const deckY = surface - 0.18;
    if (y >= deckY - 0.08 && y <= deckY + 0.24) {
      return { x: Number(cut.x), y: deckY, halfSpan, radius };
    }
  }
  return null;
}

function visibleSurfaceBridges(changes, minX, maxX) {
  const cuts = cutsNear(normalizeWorldChanges(changes), minX - 8, -30, maxX + 8, 40);
  const bridges = [];
  const used = [];
  for (const cut of cuts) {
    const radius = Number(cut.r) || 0;
    if (radius < 1.25) continue;
    const cx = Number(cut.x);
    const cy = Number(cut.y);
    const surface = surfaceHeight(cx);
    if (Math.abs(cy - surface) > radius + 0.9) continue;
    if (used.some((x) => Math.abs(x - cx) < 2.2)) continue;
    used.push(cx);
    bridges.push({ x: cx, y: surface - 0.18, halfSpan: Math.max(1.8, Math.min(7.5, radius * 1.35)) });
  }
  return bridges;
}

function drawSurfaceBridge(ctx, bridge, cameraX, cameraY, ppu, width, height) {
  const left = worldToScreenX(bridge.x - bridge.halfSpan, cameraX, ppu, width);
  const right = worldToScreenX(bridge.x + bridge.halfSpan, cameraX, ppu, width);
  const y = worldToScreenY(bridge.y, cameraY, ppu, height);
  const plankW = Math.max(7, ppu * 0.32);
  ctx.save();
  ctx.strokeStyle = "rgba(30,20,13,.95)";
  ctx.lineWidth = Math.max(3, ppu * 0.08);
  ctx.beginPath();
  ctx.moveTo(left, y + 5); ctx.lineTo(right, y + 5);
  ctx.moveTo(left, y - 5); ctx.lineTo(right, y - 5);
  ctx.stroke();
  for (let x = left; x <= right; x += plankW) {
    ctx.fillStyle = "#6f4b2d";
    ctx.fillRect(x, y - 7, Math.min(plankW - 1, right - x), 13);
    ctx.strokeStyle = "rgba(32,20,12,.75)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y - 7, Math.min(plankW - 1, right - x), 13);
  }
  ctx.strokeStyle = "#3b2a1b";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(left, y - 17); ctx.lineTo(right, y - 17);
  ctx.stroke();
  for (let x = left; x <= right; x += ppu * 1.4) {
    ctx.beginPath(); ctx.moveTo(x, y - 17); ctx.lineTo(x, y - 6); ctx.stroke();
  }
  ctx.restore();
}

'''
if anchor in s and 'function surfaceBridgeAt(' not in s:
    s = s.replace(anchor, helpers + anchor)

# 3. Make bridges physical collision floors.
old = '''  return samples.some(([ox, oy]) => isSolidAt(x + ox, y + oy, changes));
}'''
new = '''  const terrainHit = samples.some(([ox, oy]) => isSolidAt(x + ox, y + oy, changes));
  if (terrainHit) return true;
  // Procedural timber bridges become real walkable collision surfaces over large surface holes.
  return Boolean(surfaceBridgeAt(x, y + PLAYER_RADIUS, changes));
}'''
if old in s:
    s = s.replace(old, new, 1)

# 4. Add fresh cut animation ref beside drill timer ref.
needle = 'const drillTimerRef = useRef(null);'
if needle in s and 'freshCutsRef' not in s:
    s = s.replace(needle, needle + '\n  const freshCutsRef = useRef([]);')

# 5. Record each drill target for visible growth animation. Insert before onDig callback payload.
needle2 = '''    if (drillCbRef.current) {
      drillCbRef.current({'''
if needle2 in s and 'freshCutsRef.current.push' not in s:
    s = s.replace(needle2, '''    freshCutsRef.current.push({ x: target.x, y: target.y, r: radius, born: performance.now() });
    if (freshCutsRef.current.length > 18) freshCutsRef.current.splice(0, freshCutsRef.current.length - 18);
    if (drillCbRef.current) {
      drillCbRef.current({''')

# 6. Animate destination-out cut radius for freshly-created matching cuts.
oldcut = '''        const radius = cut.r * ppu;
        groundCtx.beginPath();
        groundCtx.arc(sx, sy, radius, 0, Math.PI * 2);'''
newcut = '''        let radius = cut.r * ppu;
        const fresh = freshCutsRef.current.find((f) => Math.abs(f.x - cut.x) < 0.12 && Math.abs(f.y - cut.y) < 0.12);
        if (fresh) {
          const age = now - fresh.born;
          const growth = clamp(age / 320, 0.12, 1);
          radius *= 1 - Math.pow(1 - growth, 3);
        }
        groundCtx.beginPath();
        groundCtx.arc(sx, sy, radius, 0, Math.PI * 2);'''
if oldcut in s:
    s = s.replace(oldcut, newcut, 1)

# 7. Strong dark interior/rim and excavation pulse.
oldrim = '''        rim.addColorStop(0, "rgba(0,0,0,0)");
        rim.addColorStop(0.82, "rgba(18,14,11,.12)");
        rim.addColorStop(1, "rgba(18,14,11,0)");'''
newrim = '''        rim.addColorStop(0, "rgba(0,0,0,.92)");
        rim.addColorStop(0.68, "rgba(0,0,0,.72)");
        rim.addColorStop(0.9, "rgba(9,6,4,.34)");
        rim.addColorStop(1, "rgba(0,0,0,0)");'''
if oldrim in s:
    s = s.replace(oldrim, newrim)

# 8. Draw bridges after hole rims and before cities.
city_anchor = '''      for (const city of citiesRef.current) {'''
bridge_draw = '''      // Auto-build timber bridges over large surface excavations so travel routes remain passable.
      for (const bridge of visibleSurfaceBridges(changesNow, minWorldX, maxWorldX)) {
        drawSurfaceBridge(ctx, bridge, cameraX, cameraY, ppu, width, height);
      }

'''
if city_anchor in s and 'Auto-build timber bridges' not in s:
    s = s.replace(city_anchor, bridge_draw + city_anchor, 1)

# 9. Remove stale animation entries in frame.
frame_anchor = '''      const changes = changesRef.current;
      const p = playerRef.current;'''
if frame_anchor in s and 'freshCutsRef.current = freshCutsRef.current.filter' not in s:
    s = s.replace(frame_anchor, '''      const changes = changesRef.current;
      freshCutsRef.current = freshCutsRef.current.filter((cut) => now - cut.born < 900);
      const p = playerRef.current;''')

p.write_text(s)
print('patched InfiniteWorld.js', len(s))
