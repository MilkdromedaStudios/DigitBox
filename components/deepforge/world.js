export const CHUNK_SIZE = 24;

export const RESOURCE_TYPES = {
  coal: {
    name: "Coal", icon: "●", value: 6, hp: 1, material: "coal",
    hostDark: "#252421", hostMid: "#3a3732", hostLight: "#5a554d",
    mineral: "#0e0f0f", mineral2: "#2b2d2b", highlight: "#a0a39e",
  },
  copper: {
    name: "Copper", icon: "Cu", value: 12, hp: 2, material: "copper",
    hostDark: "#444039", hostMid: "#655b50", hostLight: "#8a7a68",
    mineral: "#aa5130", mineral2: "#d37b48", highlight: "#72a477",
  },
  iron: {
    name: "Iron", icon: "Fe", value: 18, hp: 3, material: "iron",
    hostDark: "#403934", hostMid: "#605149", hostLight: "#7d6a5e",
    mineral: "#6f3026", mineral2: "#a44d37", highlight: "#302d2a",
  },
  silver: {
    name: "Silver", icon: "Ag", value: 30, hp: 4, material: "silver",
    hostDark: "#383d3d", hostMid: "#575e5d", hostLight: "#818886",
    mineral: "#879191", mineral2: "#c0cac8", highlight: "#f5f7f3",
  },
  quartz: {
    name: "Quartz", icon: "Qz", value: 50, hp: 5, material: "quartz",
    hostDark: "#69625a", hostMid: "#8d847a", hostLight: "#b2a89d",
    mineral: "#d2cbc0", mineral2: "#ede8df", highlight: "#fffef9",
  },
  gold: {
    name: "Gold", icon: "Au", value: 120, hp: 7, material: "gold",
    hostDark: "#4c4942", hostMid: "#6d685f", hostLight: "#969083",
    mineral: "#a87525", mineral2: "#d6a94a", highlight: "#ffeda7",
  },
};

export function noise(x, y, salt) {
  const n = Math.sin(x * 127.1 + y * 311.7 + salt * 91.73) * 43758.5453123;
  return n - Math.floor(n);
}

function smoothNoise1D(x, scale, salt) {
  const q = x / scale;
  const i = Math.floor(q);
  const f = q - i;
  const a = noise(i, salt, 17 + salt);
  const b = noise(i + 1, salt, 17 + salt);
  const t = f * f * (3 - 2 * f);
  return a + (b - a) * t;
}

export function surfaceHeight(x) {
  const broad = (smoothNoise1D(x, 18, 3) - 0.5) * 5.2;
  const medium = (smoothNoise1D(x, 7, 8) - 0.5) * 2.2;
  const fine = Math.sin(x * 0.23) * 0.55;
  return 3.8 + broad + medium + fine;
}

export function chunkFor(x, y) {
  return {
    x: Math.floor(x / CHUNK_SIZE),
    y: Math.floor(y / CHUNK_SIZE),
  };
}

export function chunkKey(cx, cy) {
  return cx + ":" + cy;
}

export function emptyWorldChanges() {
  return { cuts: {}, mined: {} };
}

export function normalizeWorldChanges(raw) {
  if (!raw || typeof raw !== "object") return emptyWorldChanges();

  if (raw.cuts && !Array.isArray(raw.cuts)) {
    return {
      cuts: raw.cuts || {},
      mined: raw.mined || {},
    };
  }

  // Migration from early tile beta saves: old block changes are intentionally
  // discarded because the continuous terrain model has no block coordinates.
  return emptyWorldChanges();
}

export function addDigCircle(changes, circle) {
  const current = normalizeWorldChanges(changes);
  const nextCuts = { ...current.cuts };
  const minCx = Math.floor((circle.x - circle.r) / CHUNK_SIZE);
  const maxCx = Math.floor((circle.x + circle.r) / CHUNK_SIZE);
  const minCy = Math.floor((circle.y - circle.r) / CHUNK_SIZE);
  const maxCy = Math.floor((circle.y + circle.r) / CHUNK_SIZE);

  for (let cy = minCy; cy <= maxCy; cy += 1) {
    for (let cx = minCx; cx <= maxCx; cx += 1) {
      const key = chunkKey(cx, cy);
      const list = nextCuts[key] ? nextCuts[key].slice() : [];
      list.push({
        x: Number(circle.x.toFixed(3)),
        y: Number(circle.y.toFixed(3)),
        r: Number(circle.r.toFixed(3)),
      });
      // Bound a single chunk's history. Overlapping cuts still render as one
      // organic tunnel, while this prevents a pathological save from exploding.
      nextCuts[key] = list.slice(-180);
    }
  }

  return { cuts: nextCuts, mined: current.mined };
}

export function cutsNear(changes, minX, minY, maxX, maxY) {
  const current = normalizeWorldChanges(changes);
  const result = [];
  const seen = new Set();
  const minCx = Math.floor(minX / CHUNK_SIZE);
  const maxCx = Math.floor(maxX / CHUNK_SIZE);
  const minCy = Math.floor(minY / CHUNK_SIZE);
  const maxCy = Math.floor(maxY / CHUNK_SIZE);

  for (let cy = minCy; cy <= maxCy; cy += 1) {
    for (let cx = minCx; cx <= maxCx; cx += 1) {
      const list = current.cuts[chunkKey(cx, cy)] || [];
      for (const cut of list) {
        const id = cut.x + "," + cut.y + "," + cut.r;
        if (!seen.has(id)) {
          seen.add(id);
          result.push(cut);
        }
      }
    }
  }
  return result;
}

function isInsideCut(x, y, changes) {
  const current = normalizeWorldChanges(changes);
  const c = chunkFor(x, y);

  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      const list = current.cuts[chunkKey(c.x + ox, c.y + oy)] || [];
      for (const cut of list) {
        const dx = x - cut.x;
        const dy = y - cut.y;
        if (dx * dx + dy * dy <= cut.r * cut.r) return true;
      }
    }
  }
  return false;
}

export function isSolidAt(x, y, changes) {
  if (y < surfaceHeight(x)) return false;
  return !isInsideCut(x, y, changes);
}

export function groundMaterialAt(x, y) {
  const depth = y - surfaceHeight(x);
  if (depth < 0) return "air";
  if (depth < 0.28) return "grass";
  if (depth < 5.6) return "topsoil";
  if (depth < 13) return "dirt";
  if (depth < 22) return noise(x * 0.16, y * 0.16, 12) > 0.63 ? "gravel" : "hardDirt";
  return "stone";
}

function oreTypeFor(depth, cellX, cellY) {
  const roll = noise(cellX, cellY, 44);
  const rare = noise(cellX, cellY, 83);

  if (depth > 28 && rare > 0.985) return "gold";
  if (depth > 20 && rare > 0.958) return "quartz";
  if (depth > 18 && roll > 0.91) return "silver";
  if (depth > 12 && roll > 0.82) return "iron";
  if (depth > 7 && roll > 0.78) return "copper";
  if (depth > 4 && roll > 0.79) return "coal";
  return null;
}

export function oreDepositForCell(cellX, cellY) {
  const cellSize = 4.8;
  const x = (cellX + 0.5) * cellSize + (noise(cellX, cellY, 5) - 0.5) * 2.4;
  const y = (cellY + 0.5) * cellSize + (noise(cellX, cellY, 6) - 0.5) * 2.4;
  const depth = y - surfaceHeight(x);
  if (depth < 3.8) return null;

  const type = oreTypeFor(depth, cellX, cellY);
  if (!type) return null;

  return {
    id: cellX + ":" + cellY,
    x,
    y,
    rx: 0.58 + noise(cellX, cellY, 10) * 0.72,
    ry: 0.42 + noise(cellX, cellY, 11) * 0.54,
    angle: (noise(cellX, cellY, 12) - 0.5) * 1.3,
    type,
    resource: RESOURCE_TYPES[type],
    depth,
    seedX: cellX,
    seedY: cellY,
  };
}

export function oreDepositsNear(minX, minY, maxX, maxY) {
  const cellSize = 4.8;
  const result = [];
  const minCx = Math.floor(minX / cellSize) - 1;
  const maxCx = Math.floor(maxX / cellSize) + 1;
  const minCy = Math.floor(minY / cellSize) - 1;
  const maxCy = Math.floor(maxY / cellSize) + 1;

  for (let cy = minCy; cy <= maxCy; cy += 1) {
    for (let cx = minCx; cx <= maxCx; cx += 1) {
      const deposit = oreDepositForCell(cx, cy);
      if (
        deposit &&
        deposit.x + deposit.rx >= minX &&
        deposit.x - deposit.rx <= maxX &&
        deposit.y + deposit.ry >= minY &&
        deposit.y - deposit.ry <= maxY
      ) {
        result.push(deposit);
      }
    }
  }
  return result;
}

export function depositsHitByCircle(x, y, radius, changes) {
  const current = normalizeWorldChanges(changes);
  const deposits = oreDepositsNear(x - radius - 2, y - radius - 2, x + radius + 2, y + radius + 2);
  return deposits
    .filter((deposit) => !current.mined[deposit.id])
    .filter((deposit) => {
      const dx = deposit.x - x;
      const dy = deposit.y - y;
      const reach = radius + Math.max(deposit.rx, deposit.ry) * 0.7;
      return dx * dx + dy * dy <= reach * reach;
    })
    .sort((a, b) => {
      const da = (a.x - x) ** 2 + (a.y - y) ** 2;
      const db = (b.x - x) ** 2 + (b.y - y) ** 2;
      return da - db;
    });
}

export function markDepositMined(changes, depositId) {
  const current = normalizeWorldChanges(changes);
  return {
    cuts: current.cuts,
    mined: { ...current.mined, [depositId]: true },
  };
}
