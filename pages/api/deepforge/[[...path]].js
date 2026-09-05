import deepforgeWorker from "../../../cloudflare/deepforge-worker/src/index.js";

export const config = { runtime: "edge" };

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}
function hexToBytes(hex) {
  const clean = String(hex || "");
  const bytes = new Uint8Array(Math.floor(clean.length / 2));
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
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
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(password || "")), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(saltHex), iterations: 100000 }, key, 256);
  return bytesToHex(new Uint8Array(bits));
}
function constantTimeEqual(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}
function cleanEmail(value) { return String(value || "").trim().toLowerCase(); }
function cleanName(value) { return String(value || "").trim().replace(/\s+/g, " "); }
function publicUser(row) {
  return { id: row.id, email: row.email, displayName: row.display_name || row.email.split("@")[0] };
}
function findBindings(rawEnv) {
  let DB = rawEnv && rawEnv.DB ? rawEnv.DB : null;
  let BUCKET = rawEnv && rawEnv.BUCKET ? rawEnv.BUCKET : null;
  for (const value of Object.values(rawEnv || {})) {
    if (!DB && value && typeof value.prepare === "function" && typeof value.batch === "function") DB = value;
    if (!BUCKET && value && typeof value.get === "function" && typeof value.put === "function" && typeof value.delete === "function" && typeof value.prepare !== "function") BUCKET = value;
  }
  return { ...(rawEnv || {}), DB, BUCKET };
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    },
  });
}
async function ensureSchema(request, env, incoming) {
  const healthUrl = new URL(incoming);
  healthUrl.pathname = "/v1/health";
  healthUrl.search = "";
  const response = await deepforgeWorker.fetch(new Request(healthUrl.toString(), { method: "GET" }), env);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || body.error || "D1 schema initialization failed.");
  }
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS deepforge_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS clan_designs (clan_id TEXT PRIMARY KEY, shape TEXT NOT NULL, pattern TEXT NOT NULL, primary_color TEXT NOT NULL, secondary_color TEXT NOT NULL, symbol TEXT NOT NULL, updated_at INTEGER NOT NULL)"),
  ]);
}
async function createSession(env, userId) {
  const token = randomHex(32);
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  const expiresAt = now + 30 * 24 * 60 * 60 * 1000;
  await env.DB.prepare("INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)").bind(tokenHash, userId, now, expiresAt).run();
  return { token, expiresAt };
}
async function authenticatedUser(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const tokenHash = await sha256Hex(match[1]);
  const row = await env.DB.prepare(
    "SELECT u.id, u.email, u.display_name, s.token_hash FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?1 AND s.expires_at > ?2"
  ).bind(tokenHash, Date.now()).first();
  return row || null;
}
async function getOwnerId(env) {
  const row = await env.DB.prepare("SELECT value FROM deepforge_config WHERE key = 'owner_user_id'").first();
  return row ? String(row.value) : "";
}
async function claimNumberstring(env, userId) {
  await env.DB.prepare("INSERT OR IGNORE INTO deepforge_config (key, value) VALUES ('owner_user_id', ?1)").bind(userId).run();
  return (await getOwnerId(env)) === userId;
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
async function authSelfTest(env) {
  const suffix = randomHex(8);
  const userId = "user_health_" + suffix;
  const email = "health-" + suffix + "@example.invalid";
  const password = "DfHealth-" + suffix + "-A9x!";
  const salt = randomHex(16);
  const hash = await passwordHash(password, salt);
  try {
    await env.DB.prepare("INSERT INTO users (id, email, display_name, password_hash, password_salt, created_at) VALUES (?1, ?2, 'Health Check', ?3, ?4, ?5)").bind(userId, email, hash, salt, Date.now()).run();
    const row = await env.DB.prepare("SELECT id, password_hash, password_salt FROM users WHERE email = ?1").bind(email).first();
    if (!row || row.id !== userId) throw new Error("Auth self-test user lookup failed.");
    const verify = await passwordHash(password, row.password_salt);
    if (!constantTimeEqual(verify, row.password_hash)) throw new Error("Auth self-test password verification failed.");
    const session = await createSession(env, userId);
    const tokenHash = await sha256Hex(session.token);
    const sessionRow = await env.DB.prepare("SELECT user_id FROM auth_sessions WHERE token_hash = ?1 AND expires_at > ?2").bind(tokenHash, Date.now()).first();
    if (!sessionRow || sessionRow.user_id !== userId) throw new Error("Auth self-test session lookup failed.");
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
    await env.BUCKET.put(key, "deepforge-ok", { httpMetadata: { contentType: "text/plain" } });
    const object = await env.BUCKET.get(key);
    if (!object || (await object.text()) !== "deepforge-ok") throw new Error("R2 self-test failed.");
    return true;
  } finally {
    await env.BUCKET.delete(key).catch(() => {});
  }
}

export default async function handler(request) {
  const incoming = new URL(request.url);
  const prefix = "/api/deepforge";
  if (incoming.pathname.startsWith(prefix)) incoming.pathname = incoming.pathname.slice(prefix.length) || "/";
  else if (!incoming.pathname.startsWith("/v1/")) return json({ error: "Invalid DEEPFORGE API route." }, 400);

  const env = findBindings(process.env);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: json({}).headers });

  try {
    if (incoming.pathname === "/v1/health" && request.method === "GET") {
      await ensureSchema(request, env, incoming);
      const deep = incoming.searchParams.get("deep") === "1";
      const auth = deep ? await authSelfTest(env) : null;
      const r2 = deep ? await r2SelfTest(env) : Boolean(env.BUCKET);
      const ok = Boolean(env.DB) && (!deep || Boolean(auth));
      return json({ ok, d1: Boolean(env.DB), r2, auth: deep ? Boolean(auth) : undefined, deep, apiVersion: 7, project: "digitbox" }, ok ? 200 : 500);
    }

    if (incoming.pathname === "/v1/auth/signup" && request.method === "POST") {
      await ensureSchema(request, env, incoming);
      const body = await request.json().catch(() => null);
      if (!body) return json({ error: "Invalid JSON" }, 400);
      const email = cleanEmail(body.email);
      const password = String(body.password || "");
      let displayName = cleanName(body.displayName).slice(0, 24);
      const wantsOwnerName = displayName.toLowerCase() === "numberstring";
      if (wantsOwnerName) displayName = "Numberstring";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 160) return json({ error: "Enter a valid email address." }, 400);
      if (password.length < 8 || password.length > 128) return json({ error: "Password must be 8–128 characters." }, 400);
      const exists = await env.DB.prepare("SELECT id FROM users WHERE email = ?1").bind(email).first();
      if (exists) return json({ error: "An account with that email already exists." }, 409);
      if (wantsOwnerName) {
        const ownerId = await getOwnerId(env);
        const named = await env.DB.prepare("SELECT id FROM users WHERE lower(display_name) = 'numberstring' LIMIT 1").first();
        if (ownerId || named) return json({ error: "Numberstring is the permanent DEEPFORGE owner username and is already claimed." }, 409);
      }
      const salt = randomHex(16);
      const hash = await passwordHash(password, salt);
      const user = { id: "user_" + crypto.randomUUID().replace(/-/g, ""), email, displayName: displayName || email.split("@")[0].slice(0, 24) };
      await env.DB.prepare("INSERT INTO users (id, email, display_name, password_hash, password_salt, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(user.id, user.email, user.displayName, hash, salt, Date.now()).run();
      if (user.displayName === "Numberstring") {
        const claimed = await claimNumberstring(env, user.id);
        if (!claimed) {
          await env.DB.prepare("DELETE FROM users WHERE id = ?1").bind(user.id).run();
          return json({ error: "Numberstring owner slot is already claimed." }, 409);
        }
      }
      const session = await createSession(env, user.id);
      return json({ user: { ...user, owner: user.displayName === "Numberstring" }, token: session.token, expiresAt: session.expiresAt }, 201);
    }

    if (incoming.pathname === "/v1/auth/login" && request.method === "POST") {
      await ensureSchema(request, env, incoming);
      const body = await request.json().catch(() => null);
      if (!body) return json({ error: "Invalid JSON" }, 400);
      const email = cleanEmail(body.email);
      const password = String(body.password || "");
      const row = await env.DB.prepare("SELECT id, email, display_name, password_hash, password_salt FROM users WHERE email = ?1").bind(email).first();
      if (!row) return json({ error: "Email or password is incorrect." }, 401);
      const hash = await passwordHash(password, row.password_salt);
      if (!constantTimeEqual(hash, row.password_hash)) return json({ error: "Email or password is incorrect." }, 401);
      if (row.display_name === "Numberstring" && !(await getOwnerId(env))) await claimNumberstring(env, row.id);
      const owner = (await getOwnerId(env)) === row.id;
      await env.DB.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?1").bind(Date.now()).run();
      const session = await createSession(env, row.id);
      return json({ user: { ...publicUser(row), owner }, token: session.token, expiresAt: session.expiresAt }, 200);
    }

    if (incoming.pathname === "/v1/auth/me" && request.method === "GET") {
      await ensureSchema(request, env, incoming);
      const row = await authenticatedUser(request, env);
      if (!row) return json({ error: "Your login session is invalid or expired." }, 401);
      const owner = (await getOwnerId(env)) === row.id;
      return json({ user: { ...publicUser(row), owner } }, 200);
    }

    if (incoming.pathname === "/v1/auth/account" && request.method === "DELETE") {
      await ensureSchema(request, env, incoming);
      const row = await authenticatedUser(request, env);
      if (!row) return json({ error: "Your login session is invalid or expired." }, 401);
      const ownerId = await getOwnerId(env);
      if (row.id === ownerId || row.display_name === "Numberstring") return json({ error: "Numberstring is permanent and cannot be deleted." }, 403);
      await removeMembership(env, row.id);
      await env.DB.batch([
        env.DB.prepare("DELETE FROM auth_sessions WHERE user_id = ?1").bind(row.id),
        env.DB.prepare("DELETE FROM player_saves WHERE player_id = ?1").bind(row.id),
        env.DB.prepare("DELETE FROM users WHERE id = ?1").bind(row.id),
      ]);
      return json({ ok: true, deleted: true }, 200);
    }

    const forwarded = new Request(incoming.toString(), request);
    return deepforgeWorker.fetch(forwarded, env);
  } catch (error) {
    return json({ error: error && error.message ? error.message : String(error) }, 500);
  }
}
