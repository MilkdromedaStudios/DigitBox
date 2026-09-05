export const CHUNK_SIZE = 16;

export const RESOURCE_TYPES = {
  coal: {
    name: "Coal", icon: "●", value: 6, hp: 1, material: "coal",
    hostDark: "#242321", hostMid: "#363431", hostLight: "#56524c",
    mineral: "#0e0f0f", mineral2: "#292c2b", highlight: "#90948f",
  },
  copper: {
    name: "Copper", icon: "Cu", value: 11, hp: 2, material: "copper",
    hostDark: "#403b35", hostMid: "#62584e", hostLight: "#87796b",
    mineral: "#a94f2f", mineral2: "#d27a47", highlight: "#6c9a70",
  },
  iron: {
    name: "Iron", icon: "Fe", value: 17, hp: 3, material: "iron",
    hostDark: "#3c3733", hostMid: "#5d5049", hostLight: "#7a6960",
    mineral: "#6d2d25", mineral2: "#a34d37", highlight: "#2e2c2a",
  },
  silver: {
    name: "Silver", icon: "Ag", value: 28, hp: 4, material: "silver",
    hostDark: "#363b3b", hostMid: "#555b5a", hostLight: "#7d8482",
    mineral: "#7f8989", mineral2: "#bdc7c5", highlight: "#f3f6f1",
  },
  crystal: {
    name: "Quartz", icon: "Qz", value: 52, hp: 5, material: "quartz",
    hostDark: "#665f58", hostMid: "#898078", hostLight: "#afa59b",
    mineral: "#cfc8bd", mineral2: "#ece7dd", highlight: "#fffdf7",
  },
  relic: {
    name: "Gold", icon: "Au", value: 110, hp: 7, material: "gold",
    hostDark: "#494640", hostMid: "#6b675f", hostLight: "#948e82",
    mineral: "#a97424", mineral2: "#d5a747", highlight: "#ffeaa3",
  },
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
  return { x: Math.floor(x / CHUNK_SIZE), y: Math.floor(y / CHUNK_SIZE) };
}

export function getWorldTile(x, y) {
  const broad = coarse(x, y, 10, 3);
  const geology = coarse(x, y, 7, 8);
  const moisture = coarse(x, y, 13, 18);
  const detail = hash(x, y, 12);

  // Mining terrain is intentionally mostly soil/dirt.
  let biome = "dirt";
  if (broad < 0.045) biome = "water";
  else if (broad < 0.085) biome = "sand";
  else if (geology > 0.92) biome = "stone";
  else if (moisture > 0.88 && detail > 0.5) biome = "grass";
  else if (moisture < 0.11 && detail > 0.62) biome = "dry";
  else if (geology > 0.82 && detail > 0.68) biome = "gravel";

  let resourceType = null;
  const ore = hash(x, y, 31);
  const vein = coarse(x, y, 4, 44);
  const rare = hash(x, y, 54);
  const rocky = biome === "stone" || biome === "gravel" || geology > 0.72;

  if (biome !== "water") {
    if (rare > 0.9978 && rocky) resourceType = "relic";
    else if (rocky && rare > 0.992) resourceType = "crystal";
    else if (rocky && vein > 0.76 && ore > 0.93) resourceType = "silver";
    else if (rocky && vein > 0.6 && ore > 0.875) resourceType = "iron";
    else if (vein > 0.64 && ore > 0.9) resourceType = "copper";
    else if (ore > 0.935) resourceType = "coal";
  }

  return {
    biome,
    shade: hash(x, y, 91),
    speckle: hash(x, y, 107),
    pebble: hash(x, y, 121),
    resourceType,
    resource: resourceType ? RESOURCE_TYPES[resourceType] : null,
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
        best = {
          x: tx, y: ty, key, distance,
          resource: tile.resource, resourceType: tile.resourceType,
          change: change || null,
        };
      }
    }
  }
  return best;
}
