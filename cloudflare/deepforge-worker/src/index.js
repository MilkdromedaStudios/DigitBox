import { accountRole, authRateLimit, bearerToken, getOwnerId, passwordHash, randomHex, readAuthBody, sha256Hex, verifyPassword } from "../../../lib/accountSecurity.js";

function cors(env) {
  return {
    "Access-Control-Allow-Origin": env.__requestOrigin || env.ALLOWED_ORIGIN || "https://digitbox.dev",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
}

function normalizeBindings(env, request) {
  let db = env && env.DB ? env.DB : null;
  let bucket = env && env.BUCKET ? env.BUCKET : null;

  if (env) {
    for (const value of Object.values(env)) {
      if (!db && value && typeof value.prepare === "function" && typeof value.batch === "function" && typeof value.fetch !== "function") {
        db = value;
      }
      if (
        !bucket &&
        value &&
        typeof value.get === "function" &&
        typeof value.put === "function" &&
        typeof value.delete === "function" &&
        typeof value.head === "function" &&
        typeof value.prepare !== "function"
      ) {
        bucket = value;
      }
    }
  }

  const origin = request && request.headers ? request.headers.get("Origin") : "";
  const allowedOrigin =
    origin &&
    (
      origin === "https://digitbox.dev" ||
      origin === "https://www.digitbox.dev" ||
      /^https:\/\/[a-z0-9-]+\.digitbox\.pages\.dev$/i.test(origin) ||
      origin === "https://digitbox.pages.dev"
    )
      ? origin
      : "";

  return {
    ...(env || {}),
    DB: db,
    BUCKET: bucket,
    OWNER_USER_ID: env?.OWNER_USER_ID,
    ADMIN_USER_IDS: env?.ADMIN_USER_IDS,
    __requestOrigin: allowedOrigin,
  };
}

function json(body, status, env) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { ...cors(env), "Content-Type": "application/json" },
  });
}

function rateLimited(seconds, env) {
  const response = json({ error: "Too many attempts. Please try again later." }, 429, env);
  response.headers.set("Retry-After", String(seconds));
  return response;
}

function validPlayerId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{8,96}$/.test(value);
}

const schemaPromises = new WeakMap();

async function ensureSchema(env) {
  if (!env.DB) throw new Error("D1 binding DB is missing.");

  if (!schemaPromises.has(env.DB)) {
    const ready = (async () => {
      // Stage 1: tables first. This must finish before SQLite is asked to
      // prepare indexes that reference those tables.
      await env.DB.batch([
        env.DB.prepare("CREATE TABLE IF NOT EXISTS deepforge_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)"),
        env.DB.prepare("CREATE TABLE IF NOT EXISTS clan_designs (clan_id TEXT PRIMARY KEY, shape TEXT NOT NULL, pattern TEXT NOT NULL, primary_color TEXT NOT NULL, secondary_color TEXT NOT NULL, symbol TEXT NOT NULL, updated_at INTEGER NOT NULL)"),
        env.DB.prepare("CREATE TABLE IF NOT EXISTS player_cities (user_id TEXT PRIMARY KEY, city_slot INTEGER NOT NULL UNIQUE, created_at INTEGER NOT NULL)"),
        env.DB.prepare("CREATE TABLE IF NOT EXISTS player_presence (user_id TEXT PRIMARY KEY, x REAL NOT NULL, y REAL NOT NULL, company_value INTEGER NOT NULL DEFAULT 0, trophies INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)"),
        env.DB.prepare("CREATE TABLE IF NOT EXISTS auth_rate_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, reset_at INTEGER NOT NULL)"),
        env.DB.prepare(
          "CREATE TABLE IF NOT EXISTS users (" +
          "id TEXT PRIMARY KEY, " +
          "email TEXT NOT NULL UNIQUE COLLATE NOCASE, " +
          "display_name TEXT NOT NULL, " +
          "password_hash TEXT NOT NULL, " +
          "password_salt TEXT NOT NULL, " +
          "created_at INTEGER NOT NULL)"
        ),
        env.DB.prepare(
          "CREATE TABLE IF NOT EXISTS auth_sessions (" +
          "token_hash TEXT PRIMARY KEY, " +
          "user_id TEXT NOT NULL, " +
          "created_at INTEGER NOT NULL, " +
          "expires_at INTEGER NOT NULL, " +
          "FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)"
        ),
        env.DB.prepare(
          "CREATE TABLE IF NOT EXISTS player_saves (" +
          "player_id TEXT PRIMARY KEY, " +
          "data TEXT NOT NULL, " +
          "updated_at INTEGER NOT NULL)"
        ),
        env.DB.prepare(
          "CREATE TABLE IF NOT EXISTS clans (" +
          "id TEXT PRIMARY KEY, " +
          "name TEXT NOT NULL UNIQUE COLLATE NOCASE, " +
          "tag TEXT NOT NULL, " +
          "invite_code TEXT NOT NULL UNIQUE, " +
          "owner_id TEXT NOT NULL, " +
          "created_at INTEGER NOT NULL)"
        ),
        env.DB.prepare(
          "CREATE TABLE IF NOT EXISTS clan_members (" +
          "clan_id TEXT NOT NULL, " +
          "player_id TEXT NOT NULL UNIQUE, " +
          "role TEXT NOT NULL CHECK (role IN ('owner', 'member')), " +
          "company_value INTEGER NOT NULL DEFAULT 0, " +
          "trophies INTEGER NOT NULL DEFAULT 0, " +
          "joined_at INTEGER NOT NULL, " +
          "PRIMARY KEY (clan_id, player_id), " +
          "FOREIGN KEY (clan_id) REFERENCES clans(id) ON DELETE CASCADE)"
        ),
        env.DB.prepare(
          "CREATE TABLE IF NOT EXISTS clan_join_requests (" +
          "clan_id TEXT NOT NULL, " +
          "player_id TEXT NOT NULL, " +
          "company_value INTEGER NOT NULL DEFAULT 0, " +
          "trophies INTEGER NOT NULL DEFAULT 0, " +
          "requested_at INTEGER NOT NULL, " +
          "PRIMARY KEY (clan_id, player_id), " +
          "FOREIGN KEY (clan_id) REFERENCES clans(id) ON DELETE CASCADE)"
        )
      ]);

      // Stage 2: indexes only after every referenced table exists.
      await env.DB.batch([
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_reset ON auth_rate_limits(reset_at)"),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id)"),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at)"),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_player_saves_updated_at ON player_saves(updated_at)"),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_clan_members_clan ON clan_members(clan_id)"),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_clan_rank_value ON clan_members(company_value DESC)"),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_clan_join_requests_player ON clan_join_requests(player_id)")
      ]);
    })().catch((error) => {
      schemaPromises.delete(env.DB);
      throw error;
    });
    schemaPromises.set(env.DB, ready);
  }

  return schemaPromises.get(env.DB);
}

function cleanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function cleanEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name || row.email.split("@")[0],
  };
}

async function createSession(env, userId) {
  const token = randomHex(32);
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  const { admin } = await accountRole(env, userId);
  const expiresAt = now + (admin ? 8 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000);
  await env.DB.prepare(
    "INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)"
  ).bind(tokenHash, userId, now, expiresAt).run();
  return { token, expiresAt };
}

async function authenticatedD1User(request, env) {
  const token = bearerToken(request);
  if (!token) return { error: "Sign in to DigitBox first.", status: 401 };

  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  const row = await env.DB.prepare(
    "SELECT u.id, u.email, u.display_name, s.expires_at " +
    "FROM auth_sessions s JOIN users u ON u.id = s.user_id " +
    "WHERE s.token_hash = ?1 AND s.expires_at > ?2"
  ).bind(tokenHash, now).first();

  if (!row) return { error: "Your login session is invalid or expired.", status: 401 };
  return { user: publicUser(row), tokenHash };
}

function inviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}

function clanId() {
  return "clan_" + crypto.randomUUID().replace(/-/g, "").slice(0, 20);
}

function validClanId(value) {
  return typeof value === "string" && /^clan_[a-zA-Z0-9_-]{8,64}$/.test(value);
}

function clanEmblemKey(value) {
  return "clans/" + value + "/emblem";
}

async function deleteClan(env, clanId) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM clan_members WHERE clan_id = ?1").bind(clanId),
    env.DB.prepare("DELETE FROM clan_designs WHERE clan_id = ?1").bind(clanId),
    env.DB.prepare("DELETE FROM clans WHERE id = ?1").bind(clanId),
  ]);
  if (env.BUCKET) await env.BUCKET.delete("clans/" + clanId + "/emblem").catch(() => {});
}
async function removeMembership(env, userId) {
  const membership = await env.DB.prepare("SELECT clan_id, role FROM clan_members WHERE player_id = ?1").bind(userId).first();
  if (!membership) return;
  if (membership.role === "owner") {
    const replacement = await env.DB.prepare("SELECT player_id FROM clan_members WHERE clan_id = ?1 AND player_id != ?2 ORDER BY joined_at ASC LIMIT 1").bind(membership.clan_id, userId).first();
    if (replacement) {
      await env.DB.batch([
        env.DB.prepare("UPDATE clan_members SET role = 'owner' WHERE clan_id = ?1 AND player_id = ?2").bind(membership.clan_id, replacement.player_id),
        env.DB.prepare("UPDATE clans SET owner_id = ?1 WHERE id = ?2").bind(replacement.player_id, membership.clan_id),
        env.DB.prepare("DELETE FROM clan_members WHERE clan_id = ?1 AND player_id = ?2").bind(membership.clan_id, userId),
      ]);
    } else {
      await deleteClan(env, membership.clan_id);
    }
  } else {
    await env.DB.prepare("DELETE FROM clan_members WHERE clan_id = ?1 AND player_id = ?2").bind(membership.clan_id, userId).run();
  }
}

async function canonicalAdminClan(env) {
  const ownerId = await getOwnerId(env);
  if (!ownerId) return null;
  return env.DB.prepare(
    "SELECT id, name, tag, owner_id FROM clans WHERE owner_id=?1 AND lower(name)='admin' ORDER BY created_at ASC LIMIT 1"
  ).bind(ownerId).first();
}

async function requireClanOwner(request, env, clanIdValue) {
  const authResult = await authenticatedD1User(request, env);
  if (authResult.error) return authResult;

  const clan = await env.DB.prepare(
    "SELECT id, owner_id FROM clans WHERE id = ?1"
  ).bind(clanIdValue).first();

  if (!clan) return { error: "Clan not found.", status: 404 };
  if (clan.owner_id !== authResult.user.id) {
    return { error: "Only the clan owner can change the emblem.", status: 403 };
  }

  return { user: authResult.user, clan };
}

async function clanSnapshot(env, playerId) {
  const adminClan = await canonicalAdminClan(env);
  const pendingResult = validPlayerId(playerId)
    ? await env.DB.prepare(
        "SELECT clan_id, requested_at FROM clan_join_requests WHERE player_id=?1"
      ).bind(playerId).all()
    : { results: [] };
  const pendingByClan = new Map((pendingResult.results || []).map((row) => [String(row.clan_id), Number(row.requested_at) || 0]));

  const membership = validPlayerId(playerId)
    ? await env.DB.prepare(
        "SELECT c.id, c.name, c.tag, c.invite_code, c.owner_id, c.created_at, cm.role " +
        "FROM clan_members cm JOIN clans c ON c.id = cm.clan_id WHERE cm.player_id = ?1"
      ).bind(playerId).first()
    : null;

  let myClan = null;
  if (membership) {
    const membersResult = await env.DB.prepare(
      "SELECT player_id, role, company_value, trophies, joined_at " +
      "FROM clan_members WHERE clan_id = ?1 ORDER BY role = 'owner' DESC, company_value DESC, joined_at ASC"
    ).bind(membership.id).all();

    const members = (membersResult.results || []).map((row) => ({
      playerId: row.player_id,
      role: row.role,
      companyValue: Number(row.company_value) || 0,
      trophies: Number(row.trophies) || 0,
      joinedAt: Number(row.joined_at) || 0,
    }));

    myClan = {
      id: membership.id,
      name: membership.name,
      tag: membership.tag,
      inviteCode: membership.invite_code,
      ownerId: membership.owner_id,
      role: membership.role,
      createdAt: Number(membership.created_at) || 0,
      members,
      memberCount: members.length,
      companyValue: members.reduce((sum, member) => sum + member.companyValue, 0),
      trophies: members.reduce((sum, member) => sum + member.trophies, 0),
      adminClan: Boolean(adminClan && membership.id === adminClan.id),
    };
  }

  const listResult = await env.DB.prepare(
    "SELECT c.id, c.name, c.tag, c.owner_id, c.created_at, " +
    "COUNT(cm.player_id) AS member_count, " +
    "COALESCE(SUM(cm.company_value), 0) AS company_value, " +
    "COALESCE(SUM(cm.trophies), 0) AS trophies " +
    "FROM clans c LEFT JOIN clan_members cm ON cm.clan_id = c.id " +
    "GROUP BY c.id, c.name, c.tag, c.created_at " +
    "ORDER BY company_value DESC, trophies DESC, member_count DESC LIMIT 30"
  ).all();

  return {
    myClan,
    clans: (listResult.results || []).map((row) => ({
      id: row.id,
      name: row.name,
      tag: row.tag,
      createdAt: Number(row.created_at) || 0,
      memberCount: Number(row.member_count) || 0,
      companyValue: Number(row.company_value) || 0,
      trophies: Number(row.trophies) || 0,
      requestOnly: Boolean(adminClan && row.id === adminClan.id),
      adminClan: Boolean(adminClan && row.id === adminClan.id),
      requestPending: pendingByClan.has(String(row.id)),
      requestedAt: pendingByClan.get(String(row.id)) || 0,
    })),
    joinRequests: Array.from(pendingByClan, ([clanId, requestedAt]) => ({ clanId, requestedAt })),
  };
}

export default {
  async fetch(request, env) {
    env = normalizeBindings(env, request);
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/v1/")) {
      if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
        return env.ASSETS.fetch(request);
      }
      return json({ error: "Not found" }, 404, env);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(env) });
    }

    try {
      await ensureSchema(env);
    } catch (error) {
      return json({
        error: "DEEPFORGE database initialization failed.",
      }, 500, env);
    }

    if (url.pathname === "/v1/health" && request.method === "GET") {
      // A public health check must never create users, sessions or bucket objects.
      const probe = await env.DB.prepare("SELECT 1 AS ok").first();
      return json({ ok: Boolean(probe?.ok), d1: true, r2: Boolean(env.BUCKET), apiVersion: 8, project: "digitbox" }, 200, env);
    }

    if (url.pathname === "/v1/auth/signup" && request.method === "POST") {
      const body = await readAuthBody(request);
      if (!body || typeof body.email !== "string" || typeof body.password !== "string") {
        return json({ error: "Invalid login details." }, 400, env);
      }

      const email = cleanEmail(body.email);
      const password = String(body.password || "");
      const displayName = (cleanName(body.displayName) || email.split("@")[0]).slice(0, 24);
      if (displayName.toLowerCase() === "numberstring") return json({ error: "That username is reserved." }, 409, env);

      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 160) {
        return json({ error: "Enter a valid email address." }, 400, env);
      }
      if (password.length < 12 || password.length > 128) {
        return json({ error: "Password must be 12–128 characters." }, 400, env);
      }

      const retryAfter = await authRateLimit(request, env, "signup", email);
      if (retryAfter) return rateLimited(retryAfter, env);

      const exists = await env.DB.prepare("SELECT id FROM users WHERE email = ?1").bind(email).first();
      if (exists) return json({ error: "An account with that email already exists." }, 409, env);

      const salt = randomHex(16);
      const hash = await passwordHash(password, salt);
      const user = {
        id: "user_" + crypto.randomUUID().replace(/-/g, ""),
        email,
        displayName: displayName || email.split("@")[0].slice(0, 24),
      };
      const now = Date.now();

      await env.DB.prepare(
        "INSERT INTO users (id, email, display_name, password_hash, password_salt, created_at) " +
        "VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
      ).bind(user.id, user.email, user.displayName, hash, salt, now).run();

      const session = await createSession(env, user.id);
      return json({ user: { ...user, owner: false, admin: false }, token: session.token, expiresAt: session.expiresAt }, 201, env);
    }

    if (url.pathname === "/v1/auth/login" && request.method === "POST") {
      const body = await readAuthBody(request);
      if (!body || typeof body.email !== "string" || typeof body.password !== "string") {
        return json({ error: "Invalid login details." }, 400, env);
      }

      const email = cleanEmail(body.email);
      const password = String(body.password || "");
      if (!email || email.length > 160 || !password || password.length > 128) return json({ error: "Email or password is incorrect." }, 401, env);
      const retryAfter = await authRateLimit(request, env, "login", email);
      if (retryAfter) return rateLimited(retryAfter, env);

      const row = await env.DB.prepare(
        "SELECT id, email, display_name, password_hash, password_salt FROM users WHERE email = ?1"
      ).bind(email).first();

      // Do password work for unknown emails too; never skip rate limits.
      const valid = row
        ? await verifyPassword(password, row.password_salt, row.password_hash)
        : (await passwordHash(password, "00000000000000000000000000000000"), false);
      if (!valid) {
        return json({ error: "Email or password is incorrect." }, 401, env);
      }

      if (!row.password_hash.startsWith("pbkdf2-sha256$")) {
        const salt = randomHex(16);
        const hash = await passwordHash(password, salt);
        await env.DB.prepare("UPDATE users SET password_hash = ?1, password_salt = ?2 WHERE id = ?3 AND password_hash = ?4")
          .bind(hash, salt, row.id, row.password_hash).run();
      }
      await env.DB.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?1").bind(Date.now()).run();
      const session = await createSession(env, row.id);
      return json({ user: { ...publicUser(row), ...(await accountRole(env, row.id)) }, token: session.token, expiresAt: session.expiresAt }, 200, env);
    }

    if (url.pathname === "/v1/auth/me" && request.method === "GET") {
      const authResult = await authenticatedD1User(request, env);
      if (authResult.error) return json({ error: authResult.error }, authResult.status, env);

      const role = await accountRole(env, authResult.user.id);
      return json({ user: { ...authResult.user, ...role, accessRole: role.owner ? "owner" : role.admin ? "admin" : "user" } }, 200, env);
    }

    if (url.pathname === "/v1/auth/logout" && request.method === "POST") {
      const authResult = await authenticatedD1User(request, env);
      if (!authResult.error) {
        await env.DB.prepare("DELETE FROM auth_sessions WHERE token_hash = ?1").bind(authResult.tokenHash).run();
      }
      return json({ ok: true }, 200, env);
    }

    if (url.pathname === "/v1/auth/password" && request.method === "POST") {
      const authResult = await authenticatedD1User(request, env);
      if (authResult.error) return json({ error: authResult.error }, authResult.status, env);

      const body = await readAuthBody(request);
      const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
      const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
      if (!currentPassword || currentPassword.length > 128 || newPassword.length < 12 || newPassword.length > 128) {
        return json({ error: "Enter your current password and a new password of 12–128 characters." }, 400, env);
      }

      const retryAfter = await authRateLimit(request, env, "password-change", authResult.user.email);
      if (retryAfter) return rateLimited(retryAfter, env);

      const row = await env.DB.prepare(
        "SELECT password_hash, password_salt FROM users WHERE id = ?1"
      ).bind(authResult.user.id).first();
      if (!row || !(await verifyPassword(currentPassword, row.password_salt, row.password_hash))) {
        return json({ error: "Your current password is incorrect." }, 401, env);
      }

      const salt = randomHex(16);
      const hash = await passwordHash(newPassword, salt);
      const updated = await env.DB.prepare(
        "UPDATE users SET password_hash = ?1, password_salt = ?2 WHERE id = ?3 AND password_hash = ?4"
      ).bind(hash, salt, authResult.user.id, row.password_hash).run();
      if (updated?.meta?.changes === 0) {
        return json({ error: "Your password changed in another request. Sign in again and retry." }, 409, env);
      }

      // Keep this session active, but invalidate every other device/session.
      await env.DB.prepare(
        "DELETE FROM auth_sessions WHERE user_id = ?1 AND token_hash != ?2"
      ).bind(authResult.user.id, authResult.tokenHash).run();
      return json({ ok: true }, 200, env);
    }

    if (url.pathname === "/v1/auth/account" && request.method === "DELETE") {
      const authResult = await authenticatedD1User(request, env);
      if (authResult.error) return json({ error: authResult.error }, authResult.status, env);

      if ((await accountRole(env, authResult.user.id)).owner) {
        return json({ error: "The owner account cannot be deleted through this API." }, 403, env);
      }

      const body = await readAuthBody(request);
      const password = typeof body?.password === "string" ? body.password : "";
      if (!password || password.length > 128) {
        return json({ error: "Enter your current password to confirm account deletion." }, 400, env);
      }

      const retryAfter = await authRateLimit(request, env, "account-delete", authResult.user.email);
      if (retryAfter) return rateLimited(retryAfter, env);

      const row = await env.DB.prepare(
        "SELECT password_hash, password_salt FROM users WHERE id = ?1"
      ).bind(authResult.user.id).first();
      if (!row || !(await verifyPassword(password, row.password_salt, row.password_hash))) {
        return json({ error: "Your current password is incorrect." }, 401, env);
      }

      await removeMembership(env, authResult.user.id);
      await env.DB.batch([
        env.DB.prepare("DELETE FROM auth_sessions WHERE user_id = ?1").bind(authResult.user.id),
        env.DB.prepare("DELETE FROM player_saves WHERE player_id = ?1").bind(authResult.user.id),
        env.DB.prepare("DELETE FROM player_presence WHERE user_id = ?1").bind(authResult.user.id),
        env.DB.prepare("DELETE FROM player_cities WHERE user_id = ?1").bind(authResult.user.id),
        env.DB.prepare("DELETE FROM clan_join_requests WHERE player_id = ?1").bind(authResult.user.id),
        env.DB.prepare("DELETE FROM users WHERE id = ?1").bind(authResult.user.id),
      ]);
      return json({ ok: true, deleted: true }, 200, env);
    }

    if (url.pathname.startsWith("/v1/save/")) {
      const playerId = decodeURIComponent(url.pathname.slice("/v1/save/".length));
      if (!validPlayerId(playerId)) return json({ error: "Invalid player id" }, 400, env);
      const authResult = await authenticatedD1User(request, env);
      if (authResult.error) return json({ error: authResult.error }, authResult.status, env);
      if (playerId !== authResult.user.id) return json({ error: "You cannot access another player's progression." }, 403, env);

      if (request.method === "GET") {
        const row = await env.DB.prepare(
          "SELECT data, updated_at FROM player_saves WHERE player_id = ?1"
        ).bind(playerId).first();
        if (!row) return json({ error: "Not found" }, 404, env);
        let data = null;
        try {
          data = JSON.parse(row.data);
        } catch (_) {
          return json({ error: "Corrupt save" }, 500, env);
        }
        return json({ data, updatedAt: row.updated_at }, 200, env);
      }

      if (request.method === "PUT") {
        const length = Number(request.headers.get("content-length") || 0);
        if (length > 1000000) return json({ error: "Save too large" }, 413, env);

        let data;
        try {
          data = await request.json();
        } catch (_) {
          return json({ error: "Invalid JSON" }, 400, env);
        }
        if (!data || typeof data !== "object") return json({ error: "Invalid save" }, 400, env);

        const serialized = JSON.stringify(data);
        if (serialized.length > 1000000) return json({ error: "Save too large" }, 413, env);
        const updatedAt = Number(data.updatedAt) || Date.now();

        await env.DB.prepare(
          "INSERT INTO player_saves (player_id, data, updated_at) VALUES (?1, ?2, ?3) " +
          "ON CONFLICT(player_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at " +
          "WHERE excluded.updated_at >= player_saves.updated_at"
        ).bind(playerId, serialized, updatedAt).run();

        return json({ ok: true, updatedAt }, 200, env);
      }

      return json({ error: "Method not allowed" }, 405, env);
    }

    const clanEmblemMatch = url.pathname.match(/^\/v1\/clans\/([^/]+)\/emblem$/);
    if (clanEmblemMatch) {
      const requestedClanId = decodeURIComponent(clanEmblemMatch[1]);
      if (!validClanId(requestedClanId)) {
        return json({ error: "Invalid clan id." }, 400, env);
      }

      if (!env.BUCKET) {
        return json({ error: "R2 binding BUCKET is not connected." }, 503, env);
      }

      const key = clanEmblemKey(requestedClanId);

      if (request.method === "GET") {
        const object = await env.BUCKET.get(key);
        if (!object) return json({ error: "Clan emblem not found." }, 404, env);

        const headers = new Headers(cors(env));
        object.writeHttpMetadata(headers);
        headers.set("etag", object.httpEtag);
        headers.set("Cache-Control", "public, max-age=60");
        return new Response(object.body, { status: 200, headers });
      }

      if (request.method === "PUT") {
        const owner = await requireClanOwner(request, env, requestedClanId);
        if (owner.error) return json({ error: owner.error }, owner.status, env);

        const type = String(request.headers.get("content-type") || "")
          .toLowerCase()
          .split(";")[0]
          .trim();
        const allowed = ["image/png", "image/jpeg", "image/webp"];
        if (!allowed.includes(type)) {
          return json({ error: "Use a PNG, JPG, or WebP image." }, 415, env);
        }

        const declaredLength = Number(request.headers.get("content-length") || 0);
        if (declaredLength > 2 * 1024 * 1024) {
          return json({ error: "Clan emblem must be 2 MB or smaller." }, 413, env);
        }

        const bytes = await request.arrayBuffer();
        if (!bytes.byteLength || bytes.byteLength > 2 * 1024 * 1024) {
          return json({ error: "Clan emblem must be between 1 byte and 2 MB." }, 413, env);
        }

        await env.BUCKET.put(key, bytes, {
          httpMetadata: {
            contentType: type,
            cacheControl: "public, max-age=60",
          },
          customMetadata: {
            clanId: requestedClanId,
            ownerId: owner.user.id,
            uploadedAt: String(Date.now()),
          },
        });

        return json({
          ok: true,
          emblemUrl: "/v1/clans/" + encodeURIComponent(requestedClanId) + "/emblem",
        }, 200, env);
      }

      if (request.method === "DELETE") {
        const owner = await requireClanOwner(request, env, requestedClanId);
        if (owner.error) return json({ error: owner.error }, owner.status, env);
        await env.BUCKET.delete(key);
        return json({ ok: true }, 200, env);
      }

      return json({ error: "Method not allowed" }, 405, env);
    }

    if (url.pathname === "/v1/clans" && request.method === "GET") {
      const requestedId = url.searchParams.get("playerId");
      if (!requestedId) return json(await clanSnapshot(env, null), 200, env);
      const authResult = await authenticatedD1User(request, env);
      if (authResult.error) return json({ error: authResult.error }, authResult.status, env);
      if (requestedId !== authResult.user.id) return json({ error: "You cannot access another player's clan details." }, 403, env);
      return json(await clanSnapshot(env, authResult.user.id), 200, env);
    }

    if (url.pathname === "/v1/clans" && request.method === "POST") {
      const authResult = await authenticatedD1User(request, env);
      if (authResult.error) return json({ error: authResult.error }, authResult.status, env);

      let body;
      try {
        body = await request.json();
      } catch (_) {
        return json({ error: "Invalid JSON" }, 400, env);
      }

      const playerId = authResult.user.id;
      const name = cleanName(body.name);
      const tag = cleanName(body.tag).toUpperCase();

      if (!validPlayerId(playerId)) return json({ error: "Invalid player id" }, 400, env);
      if (name.length < 3 || name.length > 24) return json({ error: "Clan name must be 3–24 characters." }, 400, env);
      if (!/^[A-Z0-9]{2,5}$/.test(tag)) return json({ error: "Clan tag must be 2–5 letters/numbers." }, 400, env);

      const existing = await env.DB.prepare(
        "SELECT clan_id FROM clan_members WHERE player_id = ?1"
      ).bind(playerId).first();
      if (existing) return json({ error: "Leave your current clan before creating another." }, 409, env);

      const duplicate = await env.DB.prepare(
        "SELECT id FROM clans WHERE lower(name) = lower(?1)"
      ).bind(name).first();
      if (duplicate) return json({ error: "That clan name is already taken." }, 409, env);

      const id = clanId();
      const code = inviteCode();
      const now = Date.now();
      const companyValue = Math.max(0, Math.floor(Number(body.companyValue) || 0));
      const trophies = Math.max(0, Math.floor(Number(body.trophies) || 0));

      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO clans (id, name, tag, invite_code, owner_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
        ).bind(id, name, tag, code, playerId, now),
        env.DB.prepare(
          "INSERT INTO clan_members (clan_id, player_id, role, company_value, trophies, joined_at) VALUES (?1, ?2, 'owner', ?3, ?4, ?5)"
        ).bind(id, playerId, companyValue, trophies, now),
      ]);

      return json(await clanSnapshot(env, playerId), 201, env);
    }

    if (url.pathname === "/v1/clans/join" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch (_) {
        return json({ error: "Invalid JSON" }, 400, env);
      }

      const authResult = await authenticatedD1User(request, env);
      if (authResult.error) return json({ error: authResult.error }, authResult.status, env);
      const playerId = authResult.user.id;
      if (body.playerId && body.playerId !== playerId) return json({ error: "Account mismatch." }, 403, env);
      if (!validPlayerId(playerId)) return json({ error: "Invalid player id" }, 400, env);

      const existing = await env.DB.prepare(
        "SELECT clan_id FROM clan_members WHERE player_id = ?1"
      ).bind(playerId).first();
      if (existing) return json({ error: "You are already in a clan." }, 409, env);

      let clan = null;
      if (body.clanId) {
        clan = await env.DB.prepare(
          "SELECT id, name, owner_id FROM clans WHERE id = ?1"
        ).bind(String(body.clanId)).first();
      } else {
        const code = cleanName(body.code).toUpperCase();
        if (!/^[A-Z0-9]{6}$/.test(code)) return json({ error: "Enter a valid 6-character invite code." }, 400, env);
        clan = await env.DB.prepare(
          "SELECT id, name, owner_id FROM clans WHERE invite_code = ?1"
        ).bind(code).first();
      }

      if (!clan) return json({ error: "Clan not found." }, 404, env);

      const canonicalOwnerId = await getOwnerId(env);
      const isAdminClan = Boolean(
        canonicalOwnerId &&
        clan.owner_id === canonicalOwnerId &&
        String(clan.name || "").toLowerCase() === "admin"
      );
      if (isAdminClan) {
        const authResult = await authenticatedD1User(request, env);
        if (authResult.error) return json({ error: "Log in before requesting Admin access." }, 401, env);
        if (authResult.user.id !== playerId) return json({ error: "Admin requests must use your logged-in account." }, 403, env);

        await env.DB.prepare(
          "INSERT INTO clan_join_requests (clan_id, player_id, company_value, trophies, requested_at) " +
          "VALUES (?1, ?2, ?3, ?4, ?5) " +
          "ON CONFLICT(clan_id, player_id) DO UPDATE SET company_value=excluded.company_value, trophies=excluded.trophies, requested_at=excluded.requested_at"
        ).bind(
          clan.id,
          playerId,
          Math.max(0, Math.floor(Number(body.companyValue) || 0)),
          Math.max(0, Math.floor(Number(body.trophies) || 0)),
          Date.now()
        ).run();

        return json({ ...(await clanSnapshot(env, playerId)), requested: true, clanId: clan.id }, 202, env);
      }

      const count = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM clan_members WHERE clan_id = ?1"
      ).bind(clan.id).first();
      if (Number(count && count.count) >= 30) return json({ error: "That clan is full." }, 409, env);

      await env.DB.prepare(
        "INSERT INTO clan_members (clan_id, player_id, role, company_value, trophies, joined_at) VALUES (?1, ?2, 'member', ?3, ?4, ?5)"
      ).bind(
        clan.id,
        playerId,
        Math.max(0, Math.floor(Number(body.companyValue) || 0)),
        Math.max(0, Math.floor(Number(body.trophies) || 0)),
        Date.now()
      ).run();

      return json(await clanSnapshot(env, playerId), 200, env);
    }

    if (url.pathname === "/v1/clans/leave" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch (_) {
        return json({ error: "Invalid JSON" }, 400, env);
      }

      const authResult = await authenticatedD1User(request, env);
      if (authResult.error) return json({ error: authResult.error }, authResult.status, env);
      const playerId = authResult.user.id;
      if (body.playerId && body.playerId !== playerId) return json({ error: "Account mismatch." }, 403, env);
      if (!validPlayerId(playerId)) return json({ error: "Invalid player id" }, 400, env);

      const membership = await env.DB.prepare(
        "SELECT cm.clan_id, cm.role, c.owner_id FROM clan_members cm " +
        "JOIN clans c ON c.id = cm.clan_id WHERE cm.player_id = ?1"
      ).bind(playerId).first();

      if (!membership) return json(await clanSnapshot(env, playerId), 200, env);

      if (membership.role === "owner") {
        const replacement = await env.DB.prepare(
          "SELECT player_id FROM clan_members WHERE clan_id = ?1 AND player_id != ?2 ORDER BY joined_at ASC LIMIT 1"
        ).bind(membership.clan_id, playerId).first();

        if (replacement) {
          await env.DB.batch([
            env.DB.prepare(
              "UPDATE clan_members SET role = 'owner' WHERE clan_id = ?1 AND player_id = ?2"
            ).bind(membership.clan_id, replacement.player_id),
            env.DB.prepare(
              "UPDATE clans SET owner_id = ?1 WHERE id = ?2"
            ).bind(replacement.player_id, membership.clan_id),
            env.DB.prepare(
              "DELETE FROM clan_members WHERE clan_id = ?1 AND player_id = ?2"
            ).bind(membership.clan_id, playerId),
          ]);
        } else {
          await env.DB.prepare("DELETE FROM clans WHERE id = ?1").bind(membership.clan_id).run();
          if (env.BUCKET) {
            await env.BUCKET.delete(clanEmblemKey(membership.clan_id)).catch(() => {});
          }
        }
      } else {
        await env.DB.prepare(
          "DELETE FROM clan_members WHERE clan_id = ?1 AND player_id = ?2"
        ).bind(membership.clan_id, playerId).run();
      }

      await env.DB.prepare("DELETE FROM clan_join_requests WHERE player_id=?1").bind(playerId).run().catch(() => {});
      return json(await clanSnapshot(env, playerId), 200, env);
    }

    if (url.pathname === "/v1/clans/profile" && request.method === "PUT") {
      let body;
      try {
        body = await request.json();
      } catch (_) {
        return json({ error: "Invalid JSON" }, 400, env);
      }

      const authResult = await authenticatedD1User(request, env);
      if (authResult.error) return json({ error: authResult.error }, authResult.status, env);
      if (body.playerId && body.playerId !== authResult.user.id) return json({ error: "Account mismatch." }, 403, env);

      await env.DB.prepare(
        "UPDATE clan_members SET company_value = ?1, trophies = ?2 WHERE player_id = ?3"
      ).bind(
        Math.max(0, Math.floor(Number(body.companyValue) || 0)),
        Math.max(0, Math.floor(Number(body.trophies) || 0)),
        authResult.user.id
      ).run();

      return json({ ok: true }, 200, env);
    }

    return json({ error: "Not found" }, 404, env);
  },
};

