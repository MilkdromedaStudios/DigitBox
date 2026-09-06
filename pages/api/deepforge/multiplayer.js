export const config = { runtime: "edge" };

const CITY_STYLES = ["industrial", "frontier", "steel"];
const CITY_UPGRADE_KEYS = ["refinery", "workshop", "academy", "walls"];
const OWNER_CITY_LEVEL = 1000;
const OWNER_PROPERTY_VALUE = 9000000000000000;

function isPermanentOwner(userLike) {
  return String(userLike && (userLike.display_name || userLike.ownerName || "") || "").toLowerCase() === "numberstring";
}

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

function cleanCityName(value, fallback) {
  const name = String(value || "").trim().replace(/\s+/g, " ").slice(0, 28);
  return name || String(fallback || "Mining Town").slice(0, 28);
}

function cleanCityStyle(value) {
  const style = String(value || "").toLowerCase();
  return CITY_STYLES.includes(style) ? style : "industrial";
}

async function ensureCityColumns(DB) {
  const columns = await DB.prepare("PRAGMA table_info(player_cities)").all();
  const existing = new Set((columns.results || []).map((row) => row.name));
  const required = [
    ["city_name", "TEXT NOT NULL DEFAULT 'Mining Town'"],
    ["city_level", "INTEGER NOT NULL DEFAULT 1"],
    ["city_style", "TEXT NOT NULL DEFAULT 'industrial'"],
    ["refinery_level", "INTEGER NOT NULL DEFAULT 0"],
    ["workshop_level", "INTEGER NOT NULL DEFAULT 0"],
    ["academy_level", "INTEGER NOT NULL DEFAULT 0"],
    ["walls_level", "INTEGER NOT NULL DEFAULT 0"],
  ];
  for (const [name, sqlType] of required) {
    if (existing.has(name)) continue;
    await DB.prepare("ALTER TABLE player_cities ADD COLUMN " + name + " " + sqlType).run().catch(() => {});
  }
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
  await ensureCityColumns(DB);
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

async function getCity(DB, userId) {
  return DB.prepare(
    "SELECT user_id, city_slot, city_name, city_level, city_style, refinery_level, workshop_level, academy_level, walls_level, created_at " +
    "FROM player_cities WHERE user_id = ?1"
  ).bind(userId).first();
}

async function createCity(DB, user, name, style) {
  const existing = await getCity(DB, user.id);
  if (existing) return existing;

  const ownerSlot = String(user.display_name || "").toLowerCase() === "numberstring" ? 0 : null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    let slot = ownerSlot;
    if (slot === null) {
      const next = await DB.prepare(
        "SELECT COALESCE(MAX(city_slot), 0) + 1 AS next_slot FROM player_cities WHERE city_slot >= 1"
      ).first();
      slot = Math.max(1, Number(next && next.next_slot) || 1);
    }
    try {
      const ownerFortress = isPermanentOwner(user);
      await DB.prepare(
        "INSERT INTO player_cities " +
        "(user_id, city_slot, city_name, city_level, city_style, refinery_level, workshop_level, academy_level, walls_level, created_at) " +
        "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"
      ).bind(
        user.id,
        slot,
        cleanCityName(name, (user.display_name || "Miner") + " City"),
        ownerFortress ? OWNER_CITY_LEVEL : 1,
        ownerFortress ? "steel" : cleanCityStyle(style),
        ownerFortress ? OWNER_CITY_LEVEL : 0,
        ownerFortress ? OWNER_CITY_LEVEL : 0,
        ownerFortress ? OWNER_CITY_LEVEL : 0,
        ownerFortress ? OWNER_CITY_LEVEL : 0,
        Date.now()
      ).run();
      return await getCity(DB, user.id);
    } catch (_) {
      const row = await getCity(DB, user.id);
      if (row) return row;
      if (ownerSlot !== null) {
        const occupied = await DB.prepare("SELECT user_id FROM player_cities WHERE city_slot = 0").first();
        if (occupied && occupied.user_id !== user.id) {
          await DB.prepare(
            "UPDATE player_cities SET city_slot = (SELECT COALESCE(MAX(city_slot),0)+1 FROM player_cities) WHERE user_id = ?1"
          ).bind(occupied.user_id).run().catch(() => {});
        }
      }
    }
  }
  throw new Error("Could not found your city.");
}

async function enforceOwnerFortress(DB, user, city) {
  if (!city || !isPermanentOwner(user)) return city;
  const alreadyMaxed =
    Number(city.city_level) >= OWNER_CITY_LEVEL &&
    Number(city.refinery_level) >= OWNER_CITY_LEVEL &&
    Number(city.workshop_level) >= OWNER_CITY_LEVEL &&
    Number(city.academy_level) >= OWNER_CITY_LEVEL &&
    Number(city.walls_level) >= OWNER_CITY_LEVEL &&
    String(city.city_style || "").toLowerCase() === "steel";
  if (!alreadyMaxed) {
    await DB.prepare(
      "UPDATE player_cities SET city_level=?2, city_style='steel', refinery_level=?2, workshop_level=?2, academy_level=?2, walls_level=?2 WHERE user_id=?1"
    ).bind(user.id, OWNER_CITY_LEVEL).run();
    return await getCity(DB, user.id);
  }
  return city;
}

function upgradesFromRow(row) {
  return {
    refinery: Math.max(0, Number(row && row.refinery_level) || 0),
    workshop: Math.max(0, Number(row && row.workshop_level) || 0),
    academy: Math.max(0, Number(row && row.academy_level) || 0),
    walls: Math.max(0, Number(row && row.walls_level) || 0),
  };
}

async function mergeCityUpgrades(DB, city, rawUpgrades) {
  if (!city || !rawUpgrades || typeof rawUpgrades !== "object") return city;
  const current = upgradesFromRow(city);
  const next = {};
  CITY_UPGRADE_KEYS.forEach((key) => {
    next[key] = Math.max(current[key], Math.round(clamp(rawUpgrades[key], 0, 1000)));
  });
  const derivedLevel = 1 + Math.floor((next.refinery + next.workshop + next.academy + next.walls) / 4);
  const cityLevel = Math.max(1, Number(city.city_level) || 1, derivedLevel);
  await DB.prepare(
    "UPDATE player_cities SET city_level=?2, refinery_level=?3, workshop_level=?4, academy_level=?5, walls_level=?6 WHERE user_id=?1"
  ).bind(city.user_id, cityLevel, next.refinery, next.workshop, next.academy, next.walls).run();
  return await getCity(DB, city.user_id);
}

function cityPayload(row, presence, onlineAfter) {
  const updatedAt = Number(presence && presence.updated_at) || 0;
  const ownerFortress = isPermanentOwner(row);
  const upgrades = ownerFortress
    ? { refinery: OWNER_CITY_LEVEL, workshop: OWNER_CITY_LEVEL, academy: OWNER_CITY_LEVEL, walls: OWNER_CITY_LEVEL }
    : upgradesFromRow(row);
  return {
    ownerId: row.user_id,
    ownerName: row.display_name || "Miner",
    slot: Number(row.city_slot) || 0,
    x: cityWorldX(row.city_slot || 0),
    name: row.city_name || ((row.display_name || "Miner") + " City"),
    level: ownerFortress ? OWNER_CITY_LEVEL : Math.max(1, Number(row.city_level) || 1),
    style: ownerFortress ? "steel" : cleanCityStyle(row.city_style),
    upgrades,
    ownerFortress,
    infiniteArmor: ownerFortress,
    turrets: ownerFortress ? 4 : 0,
    propertyValue: ownerFortress ? OWNER_PROPERTY_VALUE : Math.max(0, Number(presence && presence.company_value) || 0),
    propertyValueInfinite: ownerFortress,
    companyValue: ownerFortress ? OWNER_PROPERTY_VALUE : Number(presence && presence.company_value) || 0,
    trophies: Number(presence && presence.trophies) || 0,
    online: updatedAt >= onlineAfter,
  };
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
    "SELECT c.user_id, c.city_slot, c.city_name, c.city_level, c.city_style, " +
    "c.refinery_level, c.workshop_level, c.academy_level, c.walls_level, c.created_at, u.display_name, " +
    "COALESCE(p.company_value, 0) AS company_value, COALESCE(p.trophies, 0) AS trophies, COALESCE(p.updated_at, 0) AS updated_at " +
    "FROM player_cities c JOIN users u ON u.id = c.user_id " +
    "LEFT JOIN player_presence p ON p.user_id = c.user_id " +
    "ORDER BY c.city_slot ASC LIMIT 100"
  ).all();

  const players = (playerResult.results || []).map((row) => ({
    id: row.user_id,
    name: row.display_name || "Miner",
    x: Number(row.x) || 0,
    y: Number(row.y) || 0,
    cityX: row.city_slot === null || row.city_slot === undefined ? null : cityWorldX(row.city_slot),
    companyValue: Number(row.company_value) || 0,
    trophies: Number(row.trophies) || 0,
    updatedAt: Number(row.updated_at) || 0,
  }));

  const cities = (cityResult.results || []).map((row) => cityPayload(row, row, onlineAfter));
  const liveMine = myCity ? cities.find((city) => city.ownerId === user.id) : null;

  return {
    ok: true,
    serverTime: now,
    me: {
      id: user.id,
      name: user.display_name || "Miner",
      hasCity: Boolean(myCity),
      cityX: myCity ? cityWorldX(myCity.city_slot) : null,
      citySlot: myCity ? Number(myCity.city_slot) || 0 : null,
      city: liveMine || null,
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
    let myCity = await getCity(DB, user.id);
    myCity = await enforceOwnerFortress(DB, user, myCity);

    if (request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const action = String(body.action || "presence");

      if (action === "createCity") {
        myCity = await createCity(DB, user, body.name, body.style);
        myCity = await enforceOwnerFortress(DB, user, myCity);
        return json(await worldSnapshot(DB, user, myCity));
      }

      if (action === "cityProfile") {
        if (!myCity) return json({ error: "Create your city first." }, 409);
        const name = cleanCityName(body.name, myCity.city_name);
        const style = isPermanentOwner(user) ? "steel" : cleanCityStyle(body.style || myCity.city_style);
        await DB.prepare("UPDATE player_cities SET city_name=?2, city_style=?3 WHERE user_id=?1")
          .bind(user.id, name, style).run();
        myCity = await getCity(DB, user.id);
        myCity = await enforceOwnerFortress(DB, user, myCity);
        return json(await worldSnapshot(DB, user, myCity));
      }

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

      if (myCity && body.buildings) myCity = await mergeCityUpgrades(DB, myCity, body.buildings);
      myCity = await enforceOwnerFortress(DB, user, myCity);
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
