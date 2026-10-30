import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { pbkdf2Sync } from "node:crypto";
import worker from "../../cloudflare/deepforge-worker/src/index.js";
import { onRequest as pages } from "../../functions/v1/[[path]].js";
import { onRequest as standalonePages } from "../../cloudflare/deepforge-worker/functions/v1/[[path]].js";
import nextHandler from "../../pages/api/deepforge/[[...path]].js";
import retiredRepair from "../../pages/api/deepforge/repair-numberstring-owner.js";
import { requireAdmin } from "../../lib/serverAuth.js";
import { accountRole, authRateLimit, passwordHash, sha256Hex, verifyPassword } from "../../lib/accountSecurity.js";

// Execute real SQLite SQL, rather than returning canned authorization results.
class D1 {
  constructor() { this.sqlite = new DatabaseSync(":memory:"); }
  prepare(sql) {
    const db = this.sqlite;
    let values = [];
    const execute = (method) => {
      const args = [];
      const normalized = sql.replace(/\?(\d+)/g, (_, number) => { args.push(values[Number(number) - 1]); return "?"; });
      return db.prepare(normalized)[method](...args);
    };
    return {
      bind(...args) { values = args; return this; },
      async first() { return execute("get") || null; },
      async all() { return { results: execute("all") }; },
      async run() { return { success: true, meta: execute("run") }; },
    };
  }
  async batch(statements) {
    this.sqlite.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) { this.sqlite.exec("ROLLBACK"); throw error; }
  }
}

const password = "correct horse battery staple";
const ownerId = "user_verified_owner_12345";
const memberId = "user_regular_member_12345";

function request(path, { method = "GET", body, token, headers = {} } = {}) {
  return new Request("https://digitbox.pages.dev" + path, {
    method,
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.1", ...(token ? { Authorization: "Bearer " + token } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function fixture(t) {
  const DB = new D1();
  t.after(() => DB.sqlite.close());
  const env = { DB };
  assert.equal((await worker.fetch(request("/v1/health"), env)).status, 200);
  const salt = "abcdef0123456789abcdef0123456789";
  // Seed the untagged format used by the original live login route.
  const hash = pbkdf2Sync(password, Buffer.from(salt, "hex"), 100000, 32, "sha256").toString("hex");
  for (const [id, email, name] of [[ownerId, "owner@example.test", "Numberstring"], [memberId, "member@example.test", "Member"]]) {
    await DB.prepare("INSERT INTO users VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(id, email, name, hash, salt, Date.now()).run();
  }
  await DB.prepare("INSERT INTO deepforge_config VALUES ('owner_user_id', ?1)").bind(ownerId).run();
  const ownerToken = "a".repeat(64), memberToken = "b".repeat(64), expiredToken = "c".repeat(64);
  for (const [token, id, expires] of [[ownerToken, ownerId, Date.now() + 60000], [memberToken, memberId, Date.now() + 60000], [expiredToken, ownerId, 1]]) {
    await DB.prepare("INSERT INTO auth_sessions VALUES (?1, ?2, ?3, ?4)").bind(await sha256Hex(token), id, Date.now(), expires).run();
  }
  return { env, DB, ownerToken, memberToken, expiredToken };
}

async function withEnv(env, work) {
  const previous = process.env;
  process.env = { ...previous, ...env };
  try { return await work(); } finally { process.env = previous; }
}

const entryPoints = {
  worker: (req, env) => worker.fetch(req, env),
  pages: (request, env) => pages({ request, env }),
  standalonePages: (request, env) => standalonePages({ request, env }),
  next: (req, env) => withEnv(env, () => nextHandler(req)),
};

for (const [name, invoke] of Object.entries(entryPoints)) {
  test(`${name}: owner name cannot bootstrap or overwrite ownership`, async (t) => {
    const { env, DB, memberToken } = await fixture(t);
    await DB.prepare("DELETE FROM deepforge_config").run();
    for (const displayName of ["Numberstring", " NUMBERSTRING ", "numberstring"]) {
      const response = await invoke(request("/v1/auth/signup", { method: "POST", body: { email: "new@example.test", password, displayName, owner: true } }), env);
      assert.equal(response.status, 409);
    }
    const derivedName = await invoke(request("/v1/auth/signup", { method: "POST", body: { email: "numberstring@example.test", password } }), env);
    assert.equal(derivedName.status, 409);
    const login = await invoke(request("/v1/auth/login", { method: "POST", body: { email: "owner@example.test", password, owner: true } }), env);
    assert.equal(login.status, 200);
    assert.equal((await login.json()).user.owner, false);
    assert.equal(await DB.prepare("SELECT * FROM deepforge_config").first(), null);
    await DB.prepare("UPDATE users SET display_name = 'Numberstring' WHERE id = ?1").bind(memberId).run();
    const me = await invoke(request("/v1/auth/me", { token: memberToken }), env);
    assert.equal((await me.json()).user.owner, false);
  });

  test(`${name}: password login, hashed tokens, role checks, expiry and logout`, async (t) => {
    const { env, DB, ownerToken, memberToken, expiredToken } = await fixture(t);
    assert.equal((await invoke(request("/v1/auth/me", { token: "d".repeat(64) }), env)).status, 401);
    assert.equal((await invoke(request("/v1/auth/me", { token: expiredToken }), env)).status, 401);
    const regular = await invoke(request("/v1/auth/me", { token: memberToken }), env);
    assert.equal((await regular.json()).user.admin, false);
    const wrong = await invoke(request("/v1/auth/login", { method: "POST", body: { email: "owner@example.test", password: "wrong-password", owner: true } }), env);
    assert.equal(wrong.status, 401);
    const login = await invoke(request("/v1/auth/login", { method: "POST", body: { email: "owner@example.test", password } }), env);
    assert.equal(login.status, 200);
    const body = await login.json();
    assert.equal(body.user.owner, true);
    assert.match(body.token, /^[a-f0-9]{64}$/);
    assert.ok(body.expiresAt - Date.now() <= 8 * 60 * 60 * 1000);
    assert.equal(await DB.prepare("SELECT * FROM auth_sessions WHERE token_hash = ?1").bind(body.token).first(), null);
    assert.ok(await DB.prepare("SELECT * FROM auth_sessions WHERE token_hash = ?1").bind(await sha256Hex(body.token)).first());
    assert.match((await DB.prepare("SELECT password_hash FROM users WHERE id = ?1").bind(ownerId).first()).password_hash, /^pbkdf2-sha256\$/);
    assert.equal((await invoke(request("/v1/auth/account", { method: "DELETE", token: ownerToken }), env)).status, 403);
    assert.equal((await invoke(request("/v1/auth/logout", { method: "POST", token: body.token }), env)).status, 200);
    assert.equal((await invoke(request("/v1/auth/me", { token: body.token }), env)).status, 401);
  });

  test(`${name}: account data requires the matching session, including encoded paths`, async (t) => {
    const { env, DB, ownerToken, memberToken } = await fixture(t);
    await DB.prepare("INSERT INTO player_saves VALUES (?1, '{\"private\":true}', 1)").bind(ownerId).run();
    for (const path of ["/v1/save/" + ownerId, "/v1/save/%75" + ownerId.slice(1)]) {
      assert.equal((await invoke(request(path), env)).status, 401);
      assert.equal((await invoke(request(path, { token: memberToken }), env)).status, 403);
      assert.equal((await invoke(request(path, { token: ownerToken }), env)).status, 200);
      assert.equal((await invoke(request(path, { method: "PUT", token: memberToken, body: { stolen: true } }), env)).status, 403);
    }
    assert.equal((await invoke(request("/v1/clans?playerId=" + ownerId, { token: memberToken }), env)).status, 403);
    for (const [path, method] of [["join", "POST"], ["leave", "POST"], ["profile", "PUT"]]) {
      const body = { playerId: ownerId };
      assert.equal((await invoke(request("/v1/clans/" + path, { method, body }), env)).status, 401);
      assert.equal((await invoke(request("/v1/clans/" + path, { method, body, token: memberToken }), env)).status, 403);
    }
    assert.deepEqual(JSON.parse((await DB.prepare("SELECT data FROM player_saves WHERE player_id=?1").bind(ownerId).first()).data), { private: true });
  });
}

test("retired repair never touches the database, including authenticated calls", async () => {
  await withEnv({ DB: { prepare() { throw new Error("Unexpected database access"); } } }, async () => {
    for (const method of ["GET", "POST", "PUT", "DELETE"]) assert.equal((await retiredRepair(request("/api/deepforge/repair-numberstring-owner", { method }))).status, 410);
  });
});

test("configured owner ID overrides a stale database owner and never trusts client roles", async (t) => {
  const { env, memberToken, ownerToken } = await fixture(t);
  env.OWNER_USER_ID = memberId;
  assert.equal((await accountRole(env, ownerId)).owner, false);
  assert.equal((await accountRole(env, memberId)).owner, true);
  await withEnv(env, async () => {
    assert.equal((await requireAdmin(request("/api/admin/session", { token: ownerToken }))).response.status, 403);
    assert.equal((await requireAdmin(request("/api/admin/session", { token: memberToken }))).user.id, memberId);
    assert.equal((await requireAdmin(request("/api/admin/session", { headers: { "X-Role": "owner", "X-User-ID": memberId } }))).response.status, 401);
  });
});

test("account limits survive IP changes, parallel attempts and endpoint changes", async (t) => {
  const { env, DB } = await fixture(t);
  const outcomes = await Promise.all(Array.from({ length: 25 }, (_, i) => authRateLimit(request("/v1/auth/login", { headers: { "CF-Connecting-IP": `192.0.2.${i + 1}` } }), env, "login", "owner@example.test")));
  assert.equal(outcomes.filter((result) => result === 0).length, 10);
  const response = await pages({ env, request: request("/v1/auth/login", { method: "POST", body: { email: " OWNER@EXAMPLE.TEST ", password } }) });
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get("Retry-After")) > 0);
  const keys = await DB.prepare("SELECT key FROM auth_rate_limits").all();
  assert.ok(keys.results.every(({ key }) => /^[a-f0-9]{64}$/.test(key)));
  await DB.prepare("UPDATE auth_rate_limits SET reset_at = 1").run();
  assert.equal(await authRateLimit(request("/v1/auth/login"), env, "login", "owner@example.test"), 0);
});

test("signup and password hashing remain compatible with valid existing accounts", async (t) => {
  const { env } = await fixture(t);
  const response = await worker.fetch(request("/v1/auth/signup", { method: "POST", body: { email: "new@example.test", password, displayName: "New member", owner: true, admin: true } }), env);
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.user.owner, false);
  assert.equal(body.user.admin, false);
  const salt = "0123456789abcdef0123456789abcdef";
  for (const iterations of [100000, 120000]) {
    const legacy = pbkdf2Sync(password, Buffer.from(salt, "hex"), iterations, 32, "sha256").toString("hex");
    assert.equal(await verifyPassword(password, salt, legacy), true);
    assert.equal(await verifyPassword("incorrect", salt, legacy), false);
  }
  const hash = await passwordHash(password, salt);
  assert.equal(await verifyPassword(password, salt, hash), true);
  assert.equal(await verifyPassword("incorrect", salt, hash), false);
  assert.equal(await verifyPassword(password, salt, "pbkdf2-sha256$1$" + "a".repeat(64)), false);
});

test("oversized and malformed auth bodies are rejected without creating accounts", async (t) => {
  const { env } = await fixture(t);
  for (const body of [null, [], { email: "x@example.test", password: "x".repeat(5000) }, { email: {}, password }]) {
    assert.equal((await worker.fetch(request("/v1/auth/signup", { method: "POST", body }), env)).status, 400);
  }
});

test("deep public health checks do not create accounts, sessions or storage objects", async (t) => {
  const { env, DB } = await fixture(t);
  env.BUCKET = { put() { throw new Error("Health must not write"); } };
  const before = (await DB.prepare("SELECT COUNT(*) AS n FROM auth_sessions").first()).n;
  assert.equal((await worker.fetch(request("/v1/health?deep=1"), env)).status, 200);
  assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM auth_sessions").first()).n, before);
  assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM users").first()).n, 2);
});
