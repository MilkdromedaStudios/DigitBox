from pathlib import Path

# --- world geometry ---
p = Path('components/deepforge/world.js')
s = p.read_text()

old = '''      list.push({
        x: Number(circle.x.toFixed(3)),
        y: Number(circle.y.toFixed(3)),
        r: Number(circle.r.toFixed(3)),
      });'''
new = '''      list.push({
        x: Number(circle.x.toFixed(3)),
        y: Number(circle.y.toFixed(3)),
        r: Number(circle.r.toFixed(3)),
        shape: circle.shape === "square" ? "square" : "circle",
      });'''
if old in s:
    s = s.replace(old, new, 1)

s = s.replace('const id = cut.x + "," + cut.y + "," + cut.r;', 'const id = cut.x + "," + cut.y + "," + cut.r + "," + (cut.shape || "circle");')

old = '''        const dx = x - cut.x;
        const dy = y - cut.y;
        if (dx * dx + dy * dy <= cut.r * cut.r) return true;'''
new = '''        const dx = x - cut.x;
        const dy = y - cut.y;
        if (cut.shape === "square") {
          if (Math.abs(dx) <= cut.r && Math.abs(dy) <= cut.r) return true;
        } else if (dx * dx + dy * dy <= cut.r * cut.r) {
          return true;
        }'''
if old in s:
    s = s.replace(old, new, 1)

p.write_text(s)

# --- actual dig request uses square geometry ---
p = Path('components/deepforge/BetaGameV2.js')
s = p.read_text()
old = '''    const circle = {
      x: Number(excavation.x),
      y: Number(excavation.y),
      r: radius,
    };'''
new = '''    const circle = {
      x: Number(excavation.x),
      y: Number(excavation.y),
      r: radius,
      shape: "square",
    };'''
if old in s:
    s = s.replace(old, new, 1)
p.write_text(s)

# --- renderer/input ---
p = Path('components/deepforge/InfiniteWorld.js')
s = p.read_text()

# E is the primary PC dig key; Space remains as a compatibility shortcut.
s = s.replace('''      if (event.code === "Space" && !event.repeat) {
        event.preventDefault();
        fireDrill();
      }''', '''      if ((event.code === "KeyE" || event.code === "Space") && !event.repeat) {
        event.preventDefault();
        fireDrill();
      }''', 1)

# Ensure the growth animation actually records the new excavation.
needle = '''    const target = resolveDrillTarget(p, aim, radius, changesRef.current);
    if (!target.hit) return;

    drillCbRef.current({'''
replacement = '''    const target = resolveDrillTarget(p, aim, radius, changesRef.current);
    if (!target.hit) return;

    freshCutsRef.current.push({ x: target.x, y: target.y, r: radius, shape: "square", born: performance.now() });
    if (freshCutsRef.current.length > 18) freshCutsRef.current.splice(0, freshCutsRef.current.length - 18);

    drillCbRef.current({'''
if needle in s and 'freshCutsRef.current.push({ x: target.x' not in s:
    s = s.replace(needle, replacement, 1)

# Send shape metadata with the dig event too.
s = s.replace('''      radius,
      aimX: target.ax,
      aimY: target.ay,''', '''      radius,
      shape: "square",
      aimX: target.ax,
      aimY: target.ay,''', 1)

# Square excavation rendering, preserving old circular cuts.
old = '''        groundCtx.beginPath();
        groundCtx.arc(sx, sy, radius, 0, Math.PI * 2);
        groundCtx.fill();'''
new = '''        if (cut.shape === "square") {
          groundCtx.fillRect(sx - radius, sy - radius, radius * 2, radius * 2);
        } else {
          groundCtx.beginPath();
          groundCtx.arc(sx, sy, radius, 0, Math.PI * 2);
          groundCtx.fill();
        }'''
if old in s:
    s = s.replace(old, new, 1)

# Clip all dark excavation-rim effects below the actual terrain surface.
start = '''      // Excavation rims receive soft occlusion shadows rather than block outlines.
      for (const cut of visibleCuts) {'''
if start in s and 'Clip every black excavation effect' not in s:
    s = s.replace(start, '''      // Clip every black excavation effect below the terrain surface so sky/grass never gets black overlays.
      ctx.save();
      surfacePath(ctx, minWorldX, maxWorldX, cameraX, cameraY, ppu, width, height, 0.02);
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();
      ctx.clip();

      // Excavation rims are intentionally very dark underground.
      for (const cut of visibleCuts) {''', 1)

# Replace rim loop body with square-aware shading.
old = '''        const radius = cut.r * ppu;
        const rim = ctx.createRadialGradient(sx, sy, radius * 0.76, sx, sy, radius * 1.08);
        rim.addColorStop(0, "rgba(0,0,0,.92)");
        rim.addColorStop(0.68, "rgba(0,0,0,.72)");
        rim.addColorStop(0.9, "rgba(9,6,4,.34)");
        rim.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = rim;
        ctx.beginPath();
        ctx.arc(sx, sy, radius * 1.1, 0, Math.PI * 2);
        ctx.fill();
      }

      // Auto-build timber bridges'''
new = '''        const radius = cut.r * ppu;
        if (cut.shape === "square") {
          ctx.save();
          ctx.fillStyle = "rgba(0,0,0,.78)";
          ctx.shadowColor = "rgba(0,0,0,.98)";
          ctx.shadowBlur = Math.max(8, radius * 0.28);
          ctx.fillRect(sx - radius * 1.05, sy - radius * 1.05, radius * 2.1, radius * 2.1);
          ctx.restore();
        } else {
          const rim = ctx.createRadialGradient(sx, sy, radius * 0.76, sx, sy, radius * 1.08);
          rim.addColorStop(0, "rgba(0,0,0,.92)");
          rim.addColorStop(0.68, "rgba(0,0,0,.72)");
          rim.addColorStop(0.9, "rgba(9,6,4,.34)");
          rim.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = rim;
          ctx.beginPath();
          ctx.arc(sx, sy, radius * 1.1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      // Auto-build timber bridges'''
if old in s:
    s = s.replace(old, new, 1)

# Square dig reticle.
old = '''      ctx.beginPath();
      ctx.arc(reticleX, reticleY, drillRadiusRef.current * ppu, 0, Math.PI * 2);
      ctx.stroke();'''
new = '''      const reticleRadius = drillRadiusRef.current * ppu;
      ctx.strokeRect(reticleX - reticleRadius, reticleY - reticleRadius, reticleRadius * 2, reticleRadius * 2);'''
if old in s:
    s = s.replace(old, new, 1)

p.write_text(s)
print('square dig patch applied')
