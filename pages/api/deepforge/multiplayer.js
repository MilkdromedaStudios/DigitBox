export const config = { runtime: "edge" };

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return bytesToHex(new Uint8Array(digest));
}

function findDb(rawEnv) {
  if (rawEnv && rawEnv.DB && typeof rawEnv.DB.prepare === "function") return rawEnv.DB;
  for (const value of Object.values(rawEnv || {})) {
    if (value && typeof value.prepare === "function" && typeof value.batch === "function") return value;
  }
  return null;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    },
  });
}

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

async function ensureSchema(DB) {
  await DB.batch([
    DB.prepare(
      "CREATE TABLE IF NOT EXISTS player_cities (" +
      "user_id TEXT PRIMARY KEY, city_slot INTEGER NOT NULL UNIQUE, created_at INTEGER NOT NULL)"
    ),
    DB.prepare(
      "CREATE TABLE IF NOT EXISTS player_presence (" +
      "user_id TEXT PRIMARY KEY, x REAL NOT NULL, y REAL NOT NULL, " +
      "company_value INTEGER NOT NULL DEFAULT 0, trophies INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)"
    ),
    DB.prepare("CREATE INDEX IF NOT EXISTS idx_player_presence_updated ON player_presence(updated_at)"),
  ]);
}

async function authenticatedUser(request, DB) {
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const tokenHash = await sha256Hex(match[1]);
  return DB.prepare(
    "SELECT u.id, u.email, u.display_name FROM auth_sessions s " +
    "JOIN users u ON u.id = s.user_id " +
    "WHERE s.token_hash = ?1 AND s.expires_at > ?2"
  ).bind(tokenHash, Date.now()).first();
}

function cityWorldX(slot) {
  return 32 + Number(slot) * 48;
}

async function ensureCity(DB, user) {
  let row = await DB.prepare(
    "SELECT user_id, city_slot FROM player_cities WHERE user_id = ?1"
  ).bind(user.id).first();
  if (row) return row;

  const ownerSlot = String(user.display_name || "").toLowerCase() === "numberstring" ? 0 : null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    let slot = ownerSlot;
    if (slot === null) {
      const next = await DB.prepare(
        "SELECT COALESCE(MAX(city_slot), 0) + 1 AS next_slot FROM player_cities WHERE city_slot >= 1"
      ).first();
      slot = Math.max(1, Number(next && next.next_slot) || 1);
    }
    try {
      await DB.prepare(
        "INSERT INTO player_cities (user_id, city_slot, created_at) VALUES (?1, ?2, ?3)"
      ).bind(user.id, slot, Date.now()).run();
      return { user_id: user.id, city_slot: slot };
    } catch (_) {
      row = await DB.prepare(
        "SELECT user_id, city_slot FROM player_cities WHERE user_id = ?1"
      ).bind(user.id).first();
      if (row) return row;
      if (ownerSlot !== null) {
        const occupied = await DB.prepare("SELECT user_id FROM player_cities WHERE city_slot = 0").first();
        if (occupied && occupied.user_id !== user.id) {
          await DB.prepare("UPDATE player_cities SET city_slot = (SELECT COALESCE(MAX(city_slot),0)+1 FROM player_cities) WHERE user_id = ?1")
            .bind(occupied.user_id).run().catch(() => {});
        }
      }
    }
  }
  throw new Error("Could not assign a city location.");
}

async function worldSnapshot(DB, user, myCity) {
  const now = Date.now();
  const onlineAfter = now - 16000;
  const playerResult = await DB.prepare(
    "SELECT p.user_id, u.display_name, p.x, p.y, p.company_value, p.trophies, p.updated_at, c.city_slot " +
    "FROM player_presence p JOIN users u ON u.id = p.user_id " +
    "LEFT JOIN player_cities c ON c.user_id = p.user_id " +
    "WHERE p.updated_at >= ?1 ORDER BY p.updated_at DESC LIMIT 80"
  ).bind(onlineAfter).all();

  const cityResult = await DB.prepare(
    "SELECT c.user_id, c.city_slot, u.display_name, " +
    "COALESCE(p.company_value, 0) AS company_value, COALESCE(p.trophies, 0) AS trophies, " +
    "COALESCE(p.updated_at, 0) AS updated_at " +
    "FROM player_cities c JOIN users u ON u.id = c.user_id " +
    "LEFT JOIN player_presence p ON p.user_id = c.user_id " +
    "ORDER BY c.city_slot ASC LIMIT 100"
  ).all();

  const players = (playerResult.results || []).map((row) => ({
    id: row.user_id,
    name: row.display_name || "Miner",
    x: Number(row.x) || 0,
    y: Number(row.y) || 0,
    cityX: cityWorldX(row.city_slot || 0),
    companyValue: Number(row.company_value) || 0,
    trophies: Number(row.trophies) || 0,
    updatedAt: Number(row.updated_at) || 0,
  }));

  const cities = (cityResult.results || []).map((row) => ({
    ownerId: row.user_id,
    ownerName: row.display_name || "Miner",
    slot: Number(row.city_slot) || 0,
    x: cityWorldX(row.city_slot || 0),
    companyValue: Number(row.company_value) || 0,
    trophies: Number(row.trophies) || 0,
    online: Number(row.updated_at) >= onlineAfter,
  }));

  return {
    ok: true,
    serverTime: now,
    me: {
      id: user.id,
      name: user.display_name || "Miner",
      cityX: cityWorldX(myCity.city_slot),
      citySlot: Number(myCity.city_slot) || 0,
    },
    players,
    cities,
  };
}

export default async function handler(request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: json({}).headers });
  const DB = findDb(process.env);
  if (!DB) return json({ error: "Cloudflare D1 is not available." }, 503);

  try {
    await ensureSchema(DB);
    const user = await authenticatedUser(request, DB);
    if (!user) return json({ error: "Log in to use multiplayer." }, 401);
    const myCity = await ensureCity(DB, user);

    if (request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const x = clamp(body.x, -1000000, 1000000);
      const y = clamp(body.y, -1000, 1000000);
      const companyValue = Math.round(clamp(body.companyValue, 0, 9000000000000000));
      const trophies = Math.round(clamp(body.trophies, 0, 9000000000000000));
      const now = Date.now();
      await DB.prepare(
        "INSERT INTO player_presence (user_id, x, y, company_value, trophies, updated_at) " +
        "VALUES (?1, ?2, ?3, ?4, ?5, ?6) " +
        "ON CONFLICT(user_id) DO UPDATE SET x=excluded.x, y=excluded.y, company_value=excluded.company_value, " +
        "trophies=excluded.trophies, updated_at=excluded.updated_at"
      ).bind(user.id, x, y, companyValue, trophies, now).run();
      return json(await worldSnapshot(DB, user, myCity));
    }

    if (request.method === "DELETE") {
      await DB.prepare("DELETE FROM player_presence WHERE user_id = ?1").bind(user.id).run();
      return json({ ok: true, offline: true });
    }

    if (request.method === "GET") return json(await worldSnapshot(DB, user, myCity));
    return json({ error: "Method not allowed." }, 405);
  } catch (error) {
    return json({ error: error && error.message ? error.message : String(error) }, 500);
  }
}
