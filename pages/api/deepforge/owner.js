export const config = {
  runtime: "edge",
};

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

async function ensureOwnerTable(DB) {
  await DB.prepare(
    "CREATE TABLE IF NOT EXISTS deepforge_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)"
  ).run();
}

async function repairNumberstringOwner(DB) {
  await ensureOwnerTable(DB);
  const canonical = await DB.prepare(
    "SELECT id FROM users WHERE lower(display_name) = 'numberstring' ORDER BY created_at ASC LIMIT 1"
  ).first();

  if (!canonical) return "";

  await DB.prepare(
    "INSERT INTO deepforge_config (key, value) VALUES ('owner_user_id', ?1) " +
    "ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).bind(canonical.id).run();

  return String(canonical.id);
}

async function ownerStatus(DB, user) {
  const ownerId = await repairNumberstringOwner(DB);
  return Boolean(user && ownerId && ownerId === user.id);
}

export default async function handler(request) {
  const DB = findDb(process.env);
  if (!DB) return json({ error: "D1 database is unavailable." }, 503);
  if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);

  const user = await authenticatedUser(request, DB);
  if (!user) return json({ owner: false, authenticated: false }, 200);
  const owner = await ownerStatus(DB, user);

  return json({
    authenticated: true,
    owner,
    username: user.display_name,
    ownerLabel: owner ? "DEEPFORGE OWNER" : null,
  });
}
