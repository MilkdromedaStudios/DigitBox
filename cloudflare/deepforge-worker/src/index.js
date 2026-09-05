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
      if (!db && value && typeof value.prepare === "function" && typeof value.batch === "function") {
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
    __requestOrigin: allowedOrigin,
  };
}

function json(body, status, env) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { ...cors(env), "Content-Type": "application/json" },
  });
}

function validPlayerId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{8,96}$/.test(value);
}

let schemaReadyPromise = null;

async function ensureSchema(env) {
  if (!env.DB) throw new Error("D1 binding DB is missing.");

  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      // Stage 1: tables first. This must finish before SQLite is asked to
      // prepare indexes that reference those tables.
      await env.DB.batch([
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
        )
      ]);

      // Stage 2: indexes only after every referenced table exists.
      await env.DB.batch([
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id)"),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at)"),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_player_saves_updated_at ON player_saves(updated_at)"),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_clan_members_clan ON clan_members(clan_id)"),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_clan_rank_value ON clan_members(company_value DESC)")
      ]);
    })().catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }

  return schemaReadyPromise;
}

function cleanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  const clean = String(hex || "");
  const bytes = new Uint8Array(Math.floor(clean.length / 2));
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function randomHex(size) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return bytesToHex(new Uint8Array(digest));
}

async function passwordHash(password, saltHex) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(password || "")),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: hexToBytes(saltHex),
      iterations: 120000,
    },
    key,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

function constantTimeEqual(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return mismatch === 0;
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
  const expiresAt = now + 30 * 24 * 60 * 60 * 1000;
  await env.DB.prepare(
    "INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)"
  ).bind(tokenHash, userId, now, expiresAt).run();
  return { token, expiresAt };
}

async function authenticatedD1User(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return { error: "Log in before creating a clan.", status: 401 };

  const tokenHash = await sha256Hex(match[1]);
  const now = Date.now();
  const row = await env.DB.prepare(
    "SELECT u.id, u.email, u.display_name, s.expires_at " +
    "FROM auth_sessions s JOIN users u ON u.id = s.user_id " +
    "WHERE s.token_hash = ?1 AND s.expires_at > ?2"
  ).bind(tokenHash, now).first();

  if (!row) return { error: "Your login session is invalid or expired.", status: 401 };
  return { user: publicUser(row), tokenHash };
}

async function authSelfTest(env) {
  const suffix = randomHex(8);
  const userId = "user_health_" + suffix;
  const email = "health-" + suffix + "@example.invalid";
  const password = "DfHealth-" + suffix + "-A9x!";
  const salt = randomHex(16);
  const hash = await passwordHash(password, salt);
  const now = Date.now();

  try {
    await env.DB.prepare(
      "INSERT INTO users (id, email, display_name, password_hash, password_salt, created_at) " +
      "VALUES (?1, ?2, 'Health Check', ?3, ?4, ?5)"
    ).bind(userId, email, hash, salt, now).run();

    const row = await env.DB.prepare(
      "SELECT id, email, display_name, password_hash, password_salt FROM users WHERE email = ?1"
    ).bind(email).first();
    if (!row || row.id !== userId) throw new Error("Auth self-test user lookup failed.");

    const verifyHash = await passwordHash(password, row.password_salt);
    if (!constantTimeEqual(verifyHash, row.password_hash)) {
      throw new Error("Auth self-test password verification failed.");
    }

    const session = await createSession(env, userId);
    const tokenHash = await sha256Hex(session.token);
    const sessionRow = await env.DB.prepare(
      "SELECT u.id FROM auth_sessions s JOIN users u ON u.id = s.user_id " +
      "WHERE s.token_hash = ?1 AND s.expires_at > ?2"
    ).bind(tokenHash, Date.now()).first();
    if (!sessionRow || sessionRow.id !== userId) {
      throw new Error("Auth self-test session lookup failed.");
    }

    return true;
  } finally {
    await env.DB.prepare("DELETE FROM auth_sessions WHERE user_id = ?1").bind(userId).run().catch(() => {});
    await env.DB.prepare("DELETE FROM users WHERE id = ?1").bind(userId).run().catch(() => {});
  }
}

async function r2SelfTest(env) {
  if (!env.BUCKET) return false;
  const key = "health/" + randomHex(8) + ".txt";
  try {
    await env.BUCKET.put(key, "deepforge-ok", {
      httpMetadata: { contentType: "text/plain" },
    });
    const object = await env.BUCKET.get(key);
    if (!object) throw new Error("R2 self-test read failed.");
    const text = await object.text();
    if (text !== "deepforge-ok") throw new Error("R2 self-test content mismatch.");
    return true;
  } finally {
    await env.BUCKET.delete(key).catch(() => {});
  }
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
    };
  }

  const listResult = await env.DB.prepare(
    "SELECT c.id, c.name, c.tag, c.created_at, " +
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
    })),
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
        detail: error && error.message ? error.message : String(error),
      }, 500, env);
    }

    if (url.pathname === "/v1/health" && request.method === "GET") {
      try {
        const probe = await env.DB.prepare("SELECT 1 AS ok").first();
        const deep = url.searchParams.get("deep") === "1";
        const auth = deep ? await authSelfTest(env) : null;
        const r2 = deep ? await r2SelfTest(env) : Boolean(env.BUCKET);
        const ok = Boolean(probe && Number(probe.ok) === 1) && (!deep || (auth && r2));
        return json({
          ok,
          d1: true,
          r2,
          auth: deep ? Boolean(auth) : undefined,
          deep,
          apiVersion: 5,
          project: "digitbox",
        }, ok ? 200 : 500, env);
      } catch (error) {
        return json({
          ok: false,
          d1: Boolean(env.DB),
          r2: Boolean(env.BUCKET),
          auth: false,
          deep: url.searchParams.get("deep") === "1",
          apiVersion: 5,
          project: "digitbox",
          error: error && error.message ? error.message : String(error),
        }, 500, env);
      }
    }

    if (url.pathname === "/v1/auth/signup" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch (_) {
        return json({ error: "Invalid JSON" }, 400, env);
      }

      const email = cleanEmail(body.email);
      const password = String(body.password || "");
      const displayName = cleanName(body.displayName).slice(0, 24);

      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 160) {
        return json({ error: "Enter a valid email address." }, 400, env);
      }
      if (password.length < 8 || password.length > 128) {
        return json({ error: "Password must be 8–128 characters." }, 400, env);
      }

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
      return json({ user, token: session.token, expiresAt: session.expiresAt }, 201, env);
    }

    if (url.pathname === "/v1/auth/login" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch (_) {
        return json({ error: "Invalid JSON" }, 400, env);
      }

      const email = cleanEmail(body.email);
      const password = String(body.password || "");
      const row = await env.DB.prepare(
        "SELECT id, email, display_name, password_hash, password_salt FROM users WHERE email = ?1"
      ).bind(email).first();

      if (!row) return json({ error: "Email or password is incorrect." }, 401, env);
      const hash = await passwordHash(password, row.password_salt);
      if (!constantTimeEqual(hash, row.password_hash)) {
        return json({ error: "Email or password is incorrect." }, 401, env);
      }

      await env.DB.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?1").bind(Date.now()).run();
      const session = await createSession(env, row.id);
      return json({ user: publicUser(row), token: session.token, expiresAt: session.expiresAt }, 200, env);
    }

    if (url.pathname === "/v1/auth/me" && request.method === "GET") {
      const authResult = await authenticatedD1User(request, env);
      if (authResult.error) return json({ error: authResult.error }, authResult.status, env);
      return json({ user: authResult.user }, 200, env);
    }

    if (url.pathname === "/v1/auth/logout" && request.method === "POST") {
      const authResult = await authenticatedD1User(request, env);
      if (!authResult.error) {
        await env.DB.prepare("DELETE FROM auth_sessions WHERE token_hash = ?1").bind(authResult.tokenHash).run();
      }
      return json({ ok: true }, 200, env);
    }

    if (url.pathname === "/v1/auth/account" && request.method === "DELETE") {
      const authResult = await authenticatedD1User(request, env);
      if (authResult.error) return json({ error: authResult.error }, authResult.status, env);

      const membership = await env.DB.prepare(
        "SELECT clan_id FROM clan_members WHERE player_id = ?1"
      ).bind(authResult.user.id).first();

      if (membership) {
        return json({ error: "Leave your clan before deleting this account." }, 409, env);
      }

      await env.DB.batch([
        env.DB.prepare("DELETE FROM auth_sessions WHERE user_id = ?1").bind(authResult.user.id),
        env.DB.prepare("DELETE FROM users WHERE id = ?1").bind(authResult.user.id),
      ]);

      return json({ ok: true }, 200, env);
    }

    if (url.pathname.startsWith("/v1/save/")) {
      const playerId = decodeURIComponent(url.pathname.slice("/v1/save/".length));
      if (!validPlayerId(playerId)) return json({ error: "Invalid player id" }, 400, env);

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
      return json(await clanSnapshot(env, url.searchParams.get("playerId")), 200, env);
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

      const playerId = body.playerId;
      if (!validPlayerId(playerId)) return json({ error: "Invalid player id" }, 400, env);

      const existing = await env.DB.prepare(
        "SELECT clan_id FROM clan_members WHERE player_id = ?1"
      ).bind(playerId).first();
      if (existing) return json({ error: "You are already in a clan." }, 409, env);

      let clan = null;
      if (body.clanId) {
        clan = await env.DB.prepare(
          "SELECT id FROM clans WHERE id = ?1"
        ).bind(String(body.clanId)).first();
      } else {
        const code = cleanName(body.code).toUpperCase();
        if (!/^[A-Z0-9]{6}$/.test(code)) return json({ error: "Enter a valid 6-character invite code." }, 400, env);
        clan = await env.DB.prepare(
          "SELECT id FROM clans WHERE invite_code = ?1"
        ).bind(code).first();
      }

      if (!clan) return json({ error: "Clan not found." }, 404, env);

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

      const playerId = body.playerId;
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

      return json(await clanSnapshot(env, playerId), 200, env);
    }

    if (url.pathname === "/v1/clans/profile" && request.method === "PUT") {
      let body;
      try {
        body = await request.json();
      } catch (_) {
        return json({ error: "Invalid JSON" }, 400, env);
      }

      if (!validPlayerId(body.playerId)) return json({ error: "Invalid player id" }, 400, env);

      await env.DB.prepare(
        "UPDATE clan_members SET company_value = ?1, trophies = ?2 WHERE player_id = ?3"
      ).bind(
        Math.max(0, Math.floor(Number(body.companyValue) || 0)),
        Math.max(0, Math.floor(Number(body.trophies) || 0)),
        body.playerId
      ).run();

      return json({ ok: true }, 200, env);
    }

    return json({ error: "Not found" }, 404, env);
  },
};
