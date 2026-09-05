export const config = { runtime: "edge" };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function findBindings(env) {
  let DB = env && env.DB ? env.DB : null;
  let BUCKET = env && env.BUCKET ? env.BUCKET : null;
  for (const value of Object.values(env || {})) {
    if (!DB && value && typeof value.prepare === "function" && typeof value.batch === "function") DB = value;
    if (!BUCKET && value && typeof value.get === "function" && typeof value.put === "function" && typeof value.delete === "function" && typeof value.prepare !== "function") BUCKET = value;
  }
  return { DB, BUCKET };
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function authUser(request, DB) {
  const auth = request.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const tokenHash = await sha256Hex(match[1]);
  return DB.prepare(
    "SELECT u.id, u.email, u.display_name FROM auth_sessions s JOIN users u ON u.id = s.user_id " +
    "WHERE s.token_hash = ?1 AND s.expires_at > ?2"
  ).bind(tokenHash, Date.now()).first();
}

async function ensureAdminTables(DB) {
  await DB.batch([
    DB.prepare("CREATE TABLE IF NOT EXISTS deepforge_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)"),
    DB.prepare("CREATE TABLE IF NOT EXISTS clan_designs (clan_id TEXT PRIMARY KEY, shape TEXT NOT NULL, pattern TEXT NOT NULL, primary_color TEXT NOT NULL, secondary_color TEXT NOT NULL, symbol TEXT NOT NULL, updated_at INTEGER NOT NULL)"),
  ]);
}

async function ownerId(DB) {
  const row = await DB.prepare("SELECT value FROM deepforge_config WHERE key = 'owner_user_id'").first();
  return row ? String(row.value) : "";
}

async function requireOwner(request, DB) {
  await ensureAdminTables(DB);
  const user = await authUser(request, DB);
  if (!user) return { error: "Log in required.", status: 401 };
  let id = await ownerId(DB);
  if (!id && user.display_name === "Numberstring") {
    await DB.prepare("INSERT OR IGNORE INTO deepforge_config (key, value) VALUES ('owner_user_id', ?1)").bind(user.id).run();
    id = await ownerId(DB);
  }
  if (id !== user.id) return { error: "Numberstring owner access required.", status: 403 };
  return { user };
}

async function deleteClan(DB, BUCKET, clanId) {
  await DB.batch([
    DB.prepare("DELETE FROM clan_members WHERE clan_id = ?1").bind(clanId),
    DB.prepare("DELETE FROM clan_designs WHERE clan_id = ?1").bind(clanId),
    DB.prepare("DELETE FROM clans WHERE id = ?1").bind(clanId),
  ]);
  if (BUCKET) await BUCKET.delete("clans/" + clanId + "/emblem").catch(() => {});
}

async function removeUserFromClan(DB, BUCKET, userId) {
  const membership = await DB.prepare(
    "SELECT cm.clan_id, cm.role FROM clan_members cm WHERE cm.player_id = ?1"
  ).bind(userId).first();
  if (!membership) return;

  if (membership.role === "owner") {
    const replacement = await DB.prepare(
      "SELECT player_id FROM clan_members WHERE clan_id = ?1 AND player_id != ?2 ORDER BY joined_at ASC LIMIT 1"
    ).bind(membership.clan_id, userId).first();
    if (replacement) {
      await DB.batch([
        DB.prepare("UPDATE clan_members SET role = 'owner' WHERE clan_id = ?1 AND player_id = ?2").bind(membership.clan_id, replacement.player_id),
        DB.prepare("UPDATE clans SET owner_id = ?1 WHERE id = ?2").bind(replacement.player_id, membership.clan_id),
        DB.prepare("DELETE FROM clan_members WHERE clan_id = ?1 AND player_id = ?2").bind(membership.clan_id, userId),
      ]);
    } else {
      await deleteClan(DB, BUCKET, membership.clan_id);
    }
  } else {
    await DB.prepare("DELETE FROM clan_members WHERE clan_id = ?1 AND player_id = ?2").bind(membership.clan_id, userId).run();
  }
}

export default async function handler(request) {
  const { DB, BUCKET } = findBindings(process.env);
  if (!DB) return json({ error: "D1 unavailable." }, 503);
  const admin = await requireOwner(request, DB);
  if (admin.error) return json({ error: admin.error }, admin.status);

  if (request.method === "GET") {
    const users = await DB.prepare(
      "SELECT id, email, display_name, created_at FROM users ORDER BY created_at DESC LIMIT 200"
    ).all();
    const clans = await DB.prepare(
      "SELECT c.id, c.name, c.tag, c.owner_id, c.created_at, COUNT(cm.player_id) AS member_count " +
      "FROM clans c LEFT JOIN clan_members cm ON cm.clan_id = c.id GROUP BY c.id ORDER BY c.created_at DESC LIMIT 200"
    ).all();
    const permanentOwnerId = await ownerId(DB);
    return json({
      ownerId: permanentOwnerId,
      users: (users.results || []).map((row) => ({ id: row.id, email: row.email, displayName: row.display_name, createdAt: Number(row.created_at) || 0, permanent: row.id === permanentOwnerId })),
      clans: (clans.results || []).map((row) => ({ id: row.id, name: row.name, tag: row.tag, ownerId: row.owner_id, memberCount: Number(row.member_count) || 0, createdAt: Number(row.created_at) || 0 })),
    });
  }

  if (request.method !== "DELETE") return json({ error: "Method not allowed." }, 405);
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: "Invalid JSON." }, 400);

  if (body.type === "clan") {
    const clanId = String(body.id || "");
    const clan = await DB.prepare("SELECT id FROM clans WHERE id = ?1").bind(clanId).first();
    if (!clan) return json({ error: "Clan not found." }, 404);
    await deleteClan(DB, BUCKET, clanId);
    return json({ ok: true, deleted: "clan", id: clanId });
  }

  if (body.type === "user") {
    const userId = String(body.id || "");
    const permanentOwnerId = await ownerId(DB);
    if (userId === permanentOwnerId) return json({ error: "Numberstring is permanent and cannot be deleted." }, 403);
    const user = await DB.prepare("SELECT id FROM users WHERE id = ?1").bind(userId).first();
    if (!user) return json({ error: "Account not found." }, 404);
    await removeUserFromClan(DB, BUCKET, userId);
    await DB.batch([
      DB.prepare("DELETE FROM auth_sessions WHERE user_id = ?1").bind(userId),
      DB.prepare("DELETE FROM player_saves WHERE player_id = ?1").bind(userId),
      DB.prepare("DELETE FROM users WHERE id = ?1").bind(userId),
    ]);
    return json({ ok: true, deleted: "user", id: userId });
  }

  return json({ error: "Unknown delete type." }, 400);
}
