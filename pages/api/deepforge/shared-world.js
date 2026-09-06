export const config = { runtime: "edge" };

const HOUR_MS = 60 * 60 * 1000;
const CHUNK_SIZE = 24;
const MAX_DIG_RADIUS = 1.25;
const CITY_PROTECTED_RADIUS = 9;
const MAX_BATCH_DIGS = 10;
const MAX_WORLD_CUTS = 18000;

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return bytesToHex(new Uint8Array(digest));
}

function findBindings(rawEnv) {
  let DB = rawEnv && rawEnv.DB && typeof rawEnv.DB.prepare === "function" ? rawEnv.DB : null;
  let BUCKET = rawEnv && rawEnv.BUCKET && typeof rawEnv.BUCKET.get === "function" ? rawEnv.BUCKET : null;
  for (const value of Object.values(rawEnv || {})) {
    if (!DB && value && typeof value.prepare === "function" && typeof value.batch === "function") DB = value;
    if (!BUCKET && value && typeof value.get === "function" && typeof value.put === "function" && typeof value.delete === "function" && typeof value.prepare !== "function") BUCKET = value;
  }
  return { DB, BUCKET };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    },
  });
}

async function authenticatedUser(request, DB) {
  if (!DB) return null;
  const auth = request.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const tokenHash = await sha256Hex(match[1]);
  return DB.prepare(
    "SELECT u.id, u.display_name FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?1 AND s.expires_at > ?2"
  ).bind(tokenHash, Date.now()).first();
}

function hourMeta(now = Date.now()) {
  const hourKey = Math.floor(now / HOUR_MS);
  return {
    hourKey,
    resetAt: (hourKey + 1) * HOUR_MS,
    serverTime: now,
    key: "world/hour-" + hourKey + ".json",
  };
}

function blankWorld() {
  return { cuts: {}, mined: {} };
}

function normalizeWorld(raw) {
  if (!raw || typeof raw !== "object") return blankWorld();
  return {
    cuts: raw.cuts && typeof raw.cuts === "object" && !Array.isArray(raw.cuts) ? raw.cuts : {},
    mined: raw.mined && typeof raw.mined === "object" && !Array.isArray(raw.mined) ? raw.mined : {},
  };
}

async function loadWorld(BUCKET, key) {
  const object = await BUCKET.get(key);
  if (!object) return blankWorld();
  try {
    return normalizeWorld(JSON.parse(await object.text()));
  } catch (_) {
    return blankWorld();
  }
}

function chunkKey(cx, cy) {
  return cx + ":" + cy;
}

function addSquareCut(world, dig) {
  const x = Number(dig.x);
  const y = Number(dig.y);
  const r = Number(dig.r);
  const minCx = Math.floor((x - r) / CHUNK_SIZE);
  const maxCx = Math.floor((x + r) / CHUNK_SIZE);
  const minCy = Math.floor((y - r) / CHUNK_SIZE);
  const maxCy = Math.floor((y + r) / CHUNK_SIZE);
  for (let cy = minCy; cy <= maxCy; cy += 1) {
    for (let cx = minCx; cx <= maxCx; cx += 1) {
      const key = chunkKey(cx, cy);
      const list = Array.isArray(world.cuts[key]) ? world.cuts[key].slice() : [];
      list.push({ x: Number(x.toFixed(3)), y: Number(y.toFixed(3)), r: Number(r.toFixed(3)), shape: "square" });
      world.cuts[key] = list.slice(-220);
    }
  }
}

function cutCount(world) {
  let total = 0;
  for (const list of Object.values(world.cuts || {})) total += Array.isArray(list) ? list.length : 0;
  return total;
}

function validDig(raw) {
  const x = Number(raw && raw.x);
  const y = Number(raw && raw.y);
  const requested = Number(raw && (raw.r ?? raw.radius));
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(requested)) return null;
  if (Math.abs(x) > 1000000 || y < -1000 || y > 1000000) return null;
  const r = Math.max(0.2, Math.min(MAX_DIG_RADIUS, requested));
  return { x, y, r, shape: "square" };
}

function cityWorldX(slot) {
  return 32 + Number(slot) * 48;
}

async function protectedByCity(DB, x) {
  if (!DB) return false;
  await DB.prepare(
    "CREATE TABLE IF NOT EXISTS player_cities (user_id TEXT PRIMARY KEY, city_slot INTEGER NOT NULL UNIQUE, created_at INTEGER NOT NULL)"
  ).run();
  const rows = await DB.prepare("SELECT city_slot FROM player_cities ORDER BY city_slot ASC LIMIT 250").all();
  return (rows.results || []).some((row) => Math.abs(x - cityWorldX(row.city_slot)) <= CITY_PROTECTED_RADIUS);
}

export default async function handler(request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: json({}).headers });
  const { DB, BUCKET } = findBindings(process.env);
  const meta = hourMeta();

  if (!BUCKET) {
    return json({
      error: "Cloudflare R2 bucket binding is not available.",
      r2: false,
      hourKey: meta.hourKey,
      resetAt: meta.resetAt,
      serverTime: meta.serverTime,
      maxDigRadius: MAX_DIG_RADIUS,
      cityProtectedRadius: CITY_PROTECTED_RADIUS,
    }, 503);
  }

  if (request.method === "GET") {
    const worldChanges = await loadWorld(BUCKET, meta.key);
    return json({
      ok: true,
      r2: true,
      worldChanges,
      hourKey: meta.hourKey,
      resetAt: meta.resetAt,
      serverTime: meta.serverTime,
      maxDigRadius: MAX_DIG_RADIUS,
      cityProtectedRadius: CITY_PROTECTED_RADIUS,
    });
  }

  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (!DB) return json({ error: "Cloudflare D1 is not available." }, 503);
  const user = await authenticatedUser(request, DB);
  if (!user) return json({ error: "Log in before changing the shared world." }, 401);

  const body = await request.json().catch(() => ({}));
  const rawDigs = Array.isArray(body.digs) ? body.digs.slice(0, MAX_BATCH_DIGS) : [body];
  const digs = rawDigs.map(validDig).filter(Boolean);
  if (!digs.length) return json({ error: "No valid dig operations." }, 400);

  for (const dig of digs) {
    if (await protectedByCity(DB, dig.x)) {
      return json({ error: "City ground is protected. Walk outside the city limits to mine.", protectedCity: true }, 409);
    }
  }

  const world = await loadWorld(BUCKET, meta.key);
  if (cutCount(world) >= MAX_WORLD_CUTS) {
    return json({ error: "This hourly map has reached its excavation safety limit. It will reset automatically.", resetAt: meta.resetAt }, 429);
  }

  for (const dig of digs) addSquareCut(world, dig);
  await BUCKET.put(meta.key, JSON.stringify(world), {
    httpMetadata: { contentType: "application/json", cacheControl: "no-store" },
    customMetadata: { hourKey: String(meta.hourKey), updatedAt: String(Date.now()), updatedBy: String(user.id) },
  });

  return json({
    ok: true,
    r2: true,
    accepted: digs.length,
    hourKey: meta.hourKey,
    resetAt: meta.resetAt,
    serverTime: Date.now(),
    maxDigRadius: MAX_DIG_RADIUS,
    cityProtectedRadius: CITY_PROTECTED_RADIUS,
  });
}
