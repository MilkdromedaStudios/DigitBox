export const config = { runtime: "edge" };

const CITY_GRANTS = {
  cityLevel: "city_level",
  refinery: "refinery_level",
  workshop: "workshop_level",
  academy: "academy_level",
  walls: "walls_level",
};

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

async function ensureAdminTables(DB) {
  await DB.batch([
    DB.prepare("CREATE TABLE IF NOT EXISTS deepforge_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)"),
    DB.prepare("CREATE TABLE IF NOT EXISTS clan_designs (clan_id TEXT PRIMARY KEY, shape TEXT NOT NULL, pattern TEXT NOT NULL, primary_color TEXT NOT NULL, secondary_color TEXT NOT NULL, symbol TEXT NOT NULL, updated_at INTEGER NOT NULL)"),
    DB.prepare("CREATE TABLE IF NOT EXISTS player_cities (user_id TEXT PRIMARY KEY, city_slot INTEGER NOT NULL UNIQUE, created_at INTEGER NOT NULL)"),
    DB.prepare("CREATE TABLE IF NOT EXISTS player_presence (user_id TEXT PRIMARY KEY, x REAL NOT NULL, y REAL NOT NULL, company_value INTEGER NOT NULL DEFAULT 0, trophies INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)"),
    DB.prepare(
      "CREATE TABLE IF NOT EXISTS clan_join_requests (" +
      "clan_id TEXT NOT NULL, player_id TEXT NOT NULL, company_value INTEGER NOT NULL DEFAULT 0, " +
      "trophies INTEGER NOT NULL DEFAULT 0, requested_at INTEGER NOT NULL, PRIMARY KEY (clan_id, player_id))"
    ),
  ]);
  await ensureCityColumns(DB);
}

async function repairOwnerId(DB) {
  await ensureAdminTables(DB);
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

async function ownerId(DB) {
  return repairOwnerId(DB);
}

async function canonicalAdminClan(DB, permanentOwnerId) {
  if (!permanentOwnerId) return null;
  return DB.prepare(
    "SELECT id, name, tag, owner_id, invite_code, created_at FROM clans " +
    "WHERE owner_id=?1 AND lower(name)='admin' ORDER BY created_at ASC LIMIT 1"
  ).bind(permanentOwnerId).first();
}

async function requireAdmin(request, DB) {
  await ensureAdminTables(DB);
  const user = await authUser(request, DB);
  if (!user) return { error: "Log in required.", status: 401 };

  const permanentOwnerId = await repairOwnerId(DB);
  if (!permanentOwnerId) return { error: "Permanent owner is not configured.", status: 503 };

  if (user.id === permanentOwnerId && String(user.display_name || "").toLowerCase() === "numberstring") {
    return { user, permanentOwner: true, delegatedAdmin: false, ownerId: permanentOwnerId };
  }

  const adminClan = await canonicalAdminClan(DB, permanentOwnerId);
  if (!adminClan) return { error: "Admin access required.", status: 403 };

  const membership = await DB.prepare(
    "SELECT player_id FROM clan_members WHERE clan_id=?1 AND player_id=?2 LIMIT 1"
  ).bind(adminClan.id, user.id).first();

  if (!membership) return { error: "Admin access required.", status: 403 };
  return { user, permanentOwner: false, delegatedAdmin: true, ownerId: permanentOwnerId, adminClan };
}

async function deleteClan(DB, BUCKET, clanId) {
  await DB.batch([
    DB.prepare("DELETE FROM clan_join_requests WHERE clan_id = ?1").bind(clanId),
    DB.prepare("DELETE FROM clan_members WHERE clan_id = ?1").bind(clanId),
    DB.prepare("DELETE FROM clan_designs WHERE clan_id = ?1").bind(clanId),
    DB.prepare("DELETE FROM clans WHERE id = ?1").bind(clanId),
  ]);
  if (BUCKET) await BUCKET.delete("clans/" + clanId + "/emblem").catch(() => {});
}

async function removeUserFromClan(DB, BUCKET, userId) {
  await DB.prepare("DELETE FROM clan_join_requests WHERE player_id=?1").bind(userId).run().catch(() => {});
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

function cityInfo(row) {
  if (!row || row.city_slot === null || row.city_slot === undefined) return null;
  const ownerFortress = String(row.display_name || "").toLowerCase() === "numberstring";
  return {
    slot: Number(row.city_slot) || 0,
    name: row.city_name || "Mining Town",
    level: ownerFortress ? 1000 : Math.max(1, Number(row.city_level) || 1),
    style: ownerFortress ? "steel" : row.city_style || "industrial",
    ownerFortress,
    infiniteArmor: ownerFortress,
    propertyValueInfinite: ownerFortress,
    turrets: ownerFortress ? 4 : 0,
    upgrades: ownerFortress ? {
      refinery: 1000,
      workshop: 1000,
      academy: 1000,
      walls: 1000,
    } : {
      refinery: Math.max(0, Number(row.refinery_level) || 0),
      workshop: Math.max(0, Number(row.workshop_level) || 0),
      academy: Math.max(0, Number(row.academy_level) || 0),
      walls: Math.max(0, Number(row.walls_level) || 0),
    },
  };
}

async function adminClanAccessData(DB, permanentOwnerId) {
  const clan = await canonicalAdminClan(DB, permanentOwnerId);
  if (!clan) return { clan: null, requests: [], members: [] };

  const requests = await DB.prepare(
    "SELECT r.player_id, r.company_value, r.trophies, r.requested_at, u.display_name, u.email " +
    "FROM clan_join_requests r JOIN users u ON u.id=r.player_id " +
    "WHERE r.clan_id=?1 ORDER BY r.requested_at ASC"
  ).bind(clan.id).all();

  const members = await DB.prepare(
    "SELECT cm.player_id, cm.role, cm.joined_at, u.display_name, u.email " +
    "FROM clan_members cm JOIN users u ON u.id=cm.player_id " +
    "WHERE cm.clan_id=?1 ORDER BY cm.role='owner' DESC, cm.joined_at ASC"
  ).bind(clan.id).all();

  return {
    clan: {
      id: clan.id,
      name: clan.name,
      tag: clan.tag,
      ownerId: clan.owner_id,
      inviteCode: clan.invite_code,
      createdAt: Number(clan.created_at) || 0,
    },
    requests: (requests.results || []).map((row) => ({
      playerId: row.player_id,
      displayName: row.display_name,
      email: row.email,
      companyValue: Number(row.company_value) || 0,
      trophies: Number(row.trophies) || 0,
      requestedAt: Number(row.requested_at) || 0,
    })),
    members: (members.results || []).map((row) => ({
      playerId: row.player_id,
      displayName: row.display_name,
      email: row.email,
      role: row.role,
      joinedAt: Number(row.joined_at) || 0,
      permanentOwner: row.player_id === permanentOwnerId,
    })),
  };
}

export default async function handler(request) {
  const { DB, BUCKET } = findBindings(process.env);
  if (!DB) return json({ error: "D1 unavailable." }, 503);
  const admin = await requireAdmin(request, DB);
  if (admin.error) return json({ error: admin.error }, admin.status);

  if (request.method === "GET") {
    const users = await DB.prepare(
      "SELECT u.id, u.email, u.display_name, u.created_at, " +
      "c.city_slot, c.city_name, c.city_level, c.city_style, c.refinery_level, c.workshop_level, c.academy_level, c.walls_level " +
      "FROM users u LEFT JOIN player_cities c ON c.user_id = u.id ORDER BY u.created_at DESC LIMIT 200"
    ).all();
    const clans = await DB.prepare(
      "SELECT c.id, c.name, c.tag, c.owner_id, c.created_at, COUNT(cm.player_id) AS member_count " +
      "FROM clans c LEFT JOIN clan_members cm ON cm.clan_id = c.id GROUP BY c.id ORDER BY c.created_at DESC LIMIT 200"
    ).all();
    const access = await adminClanAccessData(DB, admin.ownerId);
    return json({
      ownerId: admin.ownerId,
      accessRole: admin.permanentOwner ? "owner" : "admin",
      permanentOwner: admin.permanentOwner,
      delegatedAdmin: admin.delegatedAdmin,
      adminClan: access.clan,
      adminClanRequests: access.requests,
      adminClanMembers: access.members,
      users: (users.results || []).map((row) => ({
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        createdAt: Number(row.created_at) || 0,
        permanent: row.id === admin.ownerId,
        city: cityInfo(row),
      })),
      clans: (clans.results || []).map((row) => ({
        id: row.id,
        name: row.name,
        tag: row.tag,
        ownerId: row.owner_id,
        memberCount: Number(row.member_count) || 0,
        createdAt: Number(row.created_at) || 0,
        adminClan: Boolean(access.clan && row.id === access.clan.id),
      })),
    });
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => null);
    if (!body) return json({ error: "Invalid JSON." }, 400);

    if (body.type === "adminClanRequest") {
      if (!admin.permanentOwner) return json({ error: "Only Numberstring can approve Admin access.", status: 403 }, 403);
      const access = await adminClanAccessData(DB, admin.ownerId);
      if (!access.clan) return json({ error: "Numberstring's Admin clan does not exist yet." }, 409);

      const playerId = String(body.playerId || "");
      const action = String(body.action || "");
      const pending = await DB.prepare(
        "SELECT clan_id, player_id, company_value, trophies, requested_at FROM clan_join_requests " +
        "WHERE clan_id=?1 AND player_id=?2"
      ).bind(access.clan.id, playerId).first();
      if (!pending) return json({ error: "That request is no longer pending." }, 404);

      if (action === "reject") {
        await DB.prepare("DELETE FROM clan_join_requests WHERE clan_id=?1 AND player_id=?2")
          .bind(access.clan.id, playerId).run();
        return json({ ok: true, action: "rejected", playerId });
      }
      if (action !== "approve") return json({ error: "Unknown request action." }, 400);

      const membership = await DB.prepare(
        "SELECT clan_id FROM clan_members WHERE player_id=?1"
      ).bind(playerId).first();
      if (membership && membership.clan_id !== access.clan.id) {
        return json({ error: "That player joined another clan and must leave it first." }, 409);
      }

      if (!membership) {
        const count = await DB.prepare(
          "SELECT COUNT(*) AS count FROM clan_members WHERE clan_id=?1"
        ).bind(access.clan.id).first();
        if (Number(count && count.count) >= 30) return json({ error: "Admin clan is full." }, 409);

        await DB.prepare(
          "INSERT INTO clan_members (clan_id, player_id, role, company_value, trophies, joined_at) " +
          "VALUES (?1, ?2, 'member', ?3, ?4, ?5)"
        ).bind(
          access.clan.id,
          playerId,
          Math.max(0, Number(pending.company_value) || 0),
          Math.max(0, Number(pending.trophies) || 0),
          Date.now()
        ).run();
      }

      await DB.prepare("DELETE FROM clan_join_requests WHERE clan_id=?1 AND player_id=?2")
        .bind(access.clan.id, playerId).run();
      return json({ ok: true, action: "approved", playerId });
    }

    if (body.type === "adminClanRemove") {
      if (!admin.permanentOwner) return json({ error: "Only Numberstring can revoke Admin access." }, 403);
      const access = await adminClanAccessData(DB, admin.ownerId);
      if (!access.clan) return json({ error: "Admin clan not found." }, 404);
      const playerId = String(body.playerId || "");
      if (!playerId || playerId === admin.ownerId) return json({ error: "The permanent owner cannot be removed." }, 403);
      await DB.prepare("DELETE FROM clan_members WHERE clan_id=?1 AND player_id=?2")
        .bind(access.clan.id, playerId).run();
      return json({ ok: true, removed: playerId });
    }

    if (body.type === "cityGrant") {
      const userId = String(body.userId || "");
      const key = String(body.key || "");
      const column = CITY_GRANTS[key];
      if (!column) return json({ error: "Unknown city upgrade." }, 400);
      const amount = Math.max(1, Math.min(100, Math.round(Number(body.amount) || 1)));
      const city = await DB.prepare(
        "SELECT c.user_id, u.display_name FROM player_cities c JOIN users u ON u.id=c.user_id WHERE c.user_id = ?1"
      ).bind(userId).first();
      if (!city) return json({ error: "That account has not created a city yet." }, 409);
      if (String(city.display_name || "").toLowerCase() === "numberstring") {
        await DB.prepare(
          "UPDATE player_cities SET city_level=1000, city_style='steel', refinery_level=1000, workshop_level=1000, academy_level=1000, walls_level=1000 WHERE user_id=?1"
        ).bind(userId).run();
        return json({ ok: true, ownerFortress: true, userId });
      }
      await DB.prepare(
        "UPDATE player_cities SET " + column + " = MIN(1000, " + column + " + ?2) WHERE user_id = ?1"
      ).bind(userId, amount).run();
      return json({ ok: true, granted: key, amount, userId });
    }

    if (body.type === "citySetLevel") {
      const userId = String(body.userId || "");
      const level = Math.max(1, Math.min(1000, Math.round(Number(body.level) || 1)));
      const city = await DB.prepare(
        "SELECT c.user_id, u.display_name FROM player_cities c JOIN users u ON u.id=c.user_id WHERE c.user_id = ?1"
      ).bind(userId).first();
      if (!city) return json({ error: "That account has not created a city yet." }, 409);
      if (String(city.display_name || "").toLowerCase() === "numberstring") {
        await DB.prepare(
          "UPDATE player_cities SET city_level=1000, city_style='steel', refinery_level=1000, workshop_level=1000, academy_level=1000, walls_level=1000 WHERE user_id=?1"
        ).bind(userId).run();
        return json({ ok: true, ownerFortress: true, level: 1000, userId });
      }
      await DB.prepare("UPDATE player_cities SET city_level = ?2 WHERE user_id = ?1").bind(userId, level).run();
      return json({ ok: true, level, userId });
    }

    return json({ error: "Unknown admin action." }, 400);
  }

  if (request.method !== "DELETE") return json({ error: "Method not allowed." }, 405);
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: "Invalid JSON." }, 400);

  if (body.type === "clan") {
    const clanId = String(body.id || "");
    const clan = await DB.prepare("SELECT id, owner_id, name FROM clans WHERE id = ?1").bind(clanId).first();
    if (!clan) return json({ error: "Clan not found." }, 404);
    const access = await adminClanAccessData(DB, admin.ownerId);
    if (access.clan && clan.id === access.clan.id && !admin.permanentOwner) {
      return json({ error: "Delegated admins cannot delete the Admin clan." }, 403);
    }
    await deleteClan(DB, BUCKET, clanId);
    return json({ ok: true, deleted: "clan", id: clanId });
  }

  if (body.type === "user") {
    const userId = String(body.id || "");
    if (userId === admin.ownerId) return json({ error: "Numberstring is permanent and cannot be deleted." }, 403);
    const user = await DB.prepare("SELECT id FROM users WHERE id = ?1").bind(userId).first();
    if (!user) return json({ error: "Account not found." }, 404);
    await removeUserFromClan(DB, BUCKET, userId);
    await DB.batch([
      DB.prepare("DELETE FROM auth_sessions WHERE user_id = ?1").bind(userId),
      DB.prepare("DELETE FROM player_saves WHERE player_id = ?1").bind(userId),
      DB.prepare("DELETE FROM player_presence WHERE user_id = ?1").bind(userId),
      DB.prepare("DELETE FROM player_cities WHERE user_id = ?1").bind(userId),
      DB.prepare("DELETE FROM users WHERE id = ?1").bind(userId),
    ]);
    return json({ ok: true, deleted: "user", id: userId });
  }

  return json({ error: "Unknown delete type." }, 400);
}
