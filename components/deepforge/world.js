export const CHUNK_SIZE = 16;

export const RESOURCE_TYPES = {
  coal: { name: "Coal", icon: "●", value: 6, hp: 1, color: "#26313a" },
  copper: { name: "Copper", icon: "Cu", value: 11, hp: 2, color: "#c66f3c" },
  iron: { name: "Iron", icon: "Fe", value: 17, hp: 3, color: "#a7b5c0" },
  silver: { name: "Silver", icon: "Ag", value: 28, hp: 4, color: "#dcecff" },
  crystal: { name: "Crystal", icon: "✦", value: 52, hp: 5, color: "#5de7ff" },
  relic: { name: "Relic", icon: "⬢", value: 110, hp: 7, color: "#ffd45f" },
};

function hash(x, y, salt) {
  const n = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function coarse(x, y, size, salt) {
  return hash(Math.floor(x / size), Math.floor(y / size), salt);
}

export function tileKey(x, y) {
  return x + ":" + y;
}

export function chunkFor(x, y) {
  return {
    x: Math.floor(x / CHUNK_SIZE),
    y: Math.floor(y / CHUNK_SIZE),
  };
}

export function getWorldTile(x, y) {
  const climate = coarse(x, y, 9, 3);
  const height = coarse(x, y, 6, 8);
  const detail = hash(x, y, 12);

  let biome = "grass";
  if (climate < 0.12) biome = "water";
  else if (climate < 0.26) biome = "sand";
  else if (climate > 0.88) biome = "snow";
  else if (height > 0.82) biome = "volcanic";
  else if (height > 0.62) biome = "stone";
  else if (detail > 0.68) biome = "forest";

  let resource = null;
  const ore = hash(x, y, 31);
  const rare = hash(x, y, 54);

  if (biome !== "water") {
    if (rare > 0.994) resource = RESOURCE_TYPES.relic;
    else if ((biome === "volcanic" || biome === "snow") && ore > 0.94) resource = RESOURCE_TYPES.crystal;
    else if ((biome === "stone" || biome === "snow") && ore > 0.90) resource = RESOURCE_TYPES.silver;
    else if ((biome === "stone" || biome === "volcanic") && ore > 0.84) resource = RESOURCE_TYPES.iron;
    else if ((biome === "sand" || biome === "grass") && ore > 0.88) resource = RESOURCE_TYPES.copper;
    else if (ore > 0.86) resource = RESOURCE_TYPES.coal;
  }

  return {
    biome,
    shade: hash(x, y, 91),
    deco: hash(x, y, 107),
    resource,
  };
}

export function nearestResource(x, y, worldChanges, radius) {
  const r = radius || 1.65;
  let best = null;
  const minX = Math.floor(x - r) - 1;
  const maxX = Math.ceil(x + r) + 1;
  const minY = Math.floor(y - r) - 1;
  const maxY = Math.ceil(y + r) + 1;

  for (let ty = minY; ty <= maxY; ty += 1) {
    for (let tx = minX; tx <= maxX; tx += 1) {
      const key = tileKey(tx, ty);
      const change = worldChanges && worldChanges[key];
      if (change && change.mined) continue;

      const tile = getWorldTile(tx, ty);
      if (!tile.resource) continue;

      const dx = tx + 0.5 - x;
      const dy = ty + 0.5 - y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= r && (!best || distance < best.distance)) {
        best = { x: tx, y: ty, key, distance, resource: tile.resource, change: change || null };
      }
    }
  }

  return best;
}
