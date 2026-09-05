export const config = {
  runtime: "edge",
};

const SHAPES = ["shield", "round", "hex", "diamond", "badge"];
const PATTERNS = ["solid", "split", "stripe", "chevron", "rings"];
const SYMBOLS = ["⛏", "◆", "★", "⚡", "⛰", "👑"];

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function findDb(env) {
  if (env && env.DB && typeof env.DB.prepare === "function") return env.DB;
  for (const value of Object.values(env || {})) {
    if (value && typeof value.prepare === "function" && typeof value.batch === "function") return value;
  }
  return null;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function authenticatedUser(request, DB) {
  const auth = request.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const tokenHash = await sha256Hex(match[1]);
  return DB.prepare(
    "SELECT u.id, u.email, u.display_name FROM auth_sessions s " +
    "JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?1 AND s.expires_at > ?2"
  ).bind(tokenHash, Date.now()).first();
}

async function ensureTables(DB) {
  await DB.batch([
    DB.prepare("CREATE TABLE IF NOT EXISTS deepforge_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)"),
    DB.prepare(
      "CREATE TABLE IF NOT EXISTS clan_designs (" +
      "clan_id TEXT PRIMARY KEY, shape TEXT NOT NULL, pattern TEXT NOT NULL, " +
      "primary_color TEXT NOT NULL, secondary_color TEXT NOT NULL, symbol TEXT NOT NULL, updated_at INTEGER NOT NULL)"
    ),
  ]);
}

async function isSiteOwner(DB, user) {
  if (!user) return false;
  let row = await DB.prepare("SELECT value FROM deepforge_config WHERE key = 'owner_user_id'").first();
  if (!row && user.display_name === "Numberstring") {
    await DB.prepare(
      "INSERT OR IGNORE INTO deepforge_config (key, value) VALUES ('owner_user_id', ?1)"
    ).bind(user.id).run();
    row = await DB.prepare("SELECT value FROM deepforge_config WHERE key = 'owner_user_id'").first();
  }
  return Boolean(row && row.value === user.id);
}

function cleanColor(value, fallback) {
  const color = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color.toUpperCase() : fallback;
}

function serialize(row) {
  return {
    clanId: row.clan_id,
    shape: SHAPES.includes(row.shape) ? row.shape : "shield",
    pattern: PATTERNS.includes(row.pattern) ? row.pattern : "split",
    primary: cleanColor(row.primary_color, "#C99A4C"),
    secondary: cleanColor(row.secondary_color, "#403326"),
    symbol: SYMBOLS.includes(row.symbol) ? row.symbol : "⛏",
    updatedAt: Number(row.updated_at) || 0,
  };
}

export default async function handler(request) {
  const DB = findDb(process.env);
  if (!DB) return json({ error: "D1 database is unavailable." }, 503);
  await ensureTables(DB);

  if (request.method === "GET") {
    const clanId = String(new URL(request.url).searchParams.get("clanId") || "");
    if (clanId) {
      const row = await DB.prepare("SELECT * FROM clan_designs WHERE clan_id = ?1").bind(clanId).first();
      return json({ design: row ? serialize(row) : null });
    }
    const rows = await DB.prepare("SELECT * FROM clan_designs ORDER BY updated_at DESC LIMIT 100").all();
    const designs = {};
    for (const row of rows.results || []) designs[row.clan_id] = serialize(row);
    return json({ designs });
  }

  if (request.method !== "PUT") return json({ error: "Method not allowed." }, 405);

  const user = await authenticatedUser(request, DB);
  if (!user) return json({ error: "Log in before editing a clan design." }, 401);
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: "Invalid JSON." }, 400);

  const clanId = String(body.clanId || "");
  const clan = await DB.prepare("SELECT id, owner_id FROM clans WHERE id = ?1").bind(clanId).first();
  if (!clan) return json({ error: "Clan not found." }, 404);

  const owner = await isSiteOwner(DB, user);
  if (clan.owner_id !== user.id && !owner) {
    return json({ error: "Only the clan owner or Numberstring can edit this design." }, 403);
  }

  const design = body.design || {};
  const shape = SHAPES.includes(design.shape) ? design.shape : "shield";
  const pattern = PATTERNS.includes(design.pattern) ? design.pattern : "split";
  const primary = cleanColor(design.primary, "#C99A4C");
  const secondary = cleanColor(design.secondary, "#403326");
  const symbol = SYMBOLS.includes(design.symbol) ? design.symbol : "⛏";
  const updatedAt = Date.now();

  await DB.prepare(
    "INSERT INTO clan_designs (clan_id, shape, pattern, primary_color, secondary_color, symbol, updated_at) " +
    "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) " +
    "ON CONFLICT(clan_id) DO UPDATE SET shape=excluded.shape, pattern=excluded.pattern, " +
    "primary_color=excluded.primary_color, secondary_color=excluded.secondary_color, " +
    "symbol=excluded.symbol, updated_at=excluded.updated_at"
  ).bind(clanId, shape, pattern, primary, secondary, symbol, updatedAt).run();

  return json({ ok: true, design: { clanId, shape, pattern, primary, secondary, symbol, updatedAt }, owner });
}
