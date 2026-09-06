from pathlib import Path

path = Path("components/deepforge/InfiniteWorld.js")
text = path.read_text()

old_collision = '''function collides(x, y, changes) {
  const samples = [
    [0, 0],
    [-PLAYER_RADIUS, 0],
    [PLAYER_RADIUS, 0],
    [0, -PLAYER_RADIUS * 0.95],
    [0, PLAYER_RADIUS],
    [-PLAYER_RADIUS * 0.72, PLAYER_RADIUS * 0.72],
    [PLAYER_RADIUS * 0.72, PLAYER_RADIUS * 0.72],
  ];
  const terrainHit = samples.some(([ox, oy]) => isSolidAt(x + ox, y + oy, changes));
  if (terrainHit) return true;
  return Boolean(surfaceBridgeAt(x, y + PLAYER_RADIUS, changes));
}'''

new_collision = '''function collides(x, y, changes) {
  const samples = [
    [0, 0],
    [-PLAYER_RADIUS, 0],
    [PLAYER_RADIUS, 0],
    [0, -PLAYER_RADIUS * 0.95],
    [0, PLAYER_RADIUS],
    [-PLAYER_RADIUS * 0.72, PLAYER_RADIUS * 0.72],
    [PLAYER_RADIUS * 0.72, PLAYER_RADIUS * 0.72],
  ];
  // Bridges are not solid terrain. They only catch a miner who is falling
  // onto the deck from above; this keeps the tunnel underneath fully open.
  return samples.some(([ox, oy]) => isSolidAt(x + ox, y + oy, changes));
}

function bridgeDeckAtX(x, changes) {
  const bridges = visibleSurfaceBridges(changes, x - 0.5, x + 0.5);
  for (const bridge of bridges) {
    if (Math.abs(x - bridge.x) <= bridge.halfSpan) return bridge;
  }
  return null;
}

function bridgeLandingAt(x, fromY, toY, changes, dropThrough) {
  if (dropThrough || toY <= fromY) return null;
  const bridge = bridgeDeckAtX(x, changes);
  if (!bridge) return null;
  const fromFoot = fromY + PLAYER_RADIUS;
  const toFoot = toY + PLAYER_RADIUS;
  // Only land when crossing the deck from ABOVE. Approaching from below is
  // intentionally ignored so jumping/walking through the tunnel still works.
  if (fromFoot <= bridge.y + 0.05 && toFoot >= bridge.y - 0.05) return bridge;
  return null;
}'''

old_vertical = '''        const ny = p.y + v.y * dt;
        if (!collides(p.x, ny, changes)) {
          p.y = ny;
          groundedRef.current = false;
        } else {
          if (v.y > 0) groundedRef.current = true;
          v.y = 0;
        }'''

new_vertical = '''        const ny = p.y + v.y * dt;
        // S / Down Arrow / downward joystick input intentionally drops through
        // a bridge instead of landing on it.
        const dropThroughBridge = inputY > 0.42;
        const bridgeLanding = v.y > 0
          ? bridgeLandingAt(p.x, p.y, ny, changes, dropThroughBridge)
          : null;
        if (bridgeLanding) {
          p.y = bridgeLanding.y - PLAYER_RADIUS;
          groundedRef.current = true;
          v.y = 0;
        } else if (!collides(p.x, ny, changes)) {
          p.y = ny;
          groundedRef.current = false;
        } else {
          if (v.y > 0) groundedRef.current = true;
          v.y = 0;
        }'''

if old_collision not in text:
    raise SystemExit("collision block not found; refusing unsafe patch")
if old_vertical not in text:
    raise SystemExit("vertical movement block not found; refusing unsafe patch")

text = text.replace(old_collision, new_collision, 1)
text = text.replace(old_vertical, new_vertical, 1)
path.write_text(text)
