function cors(env) {
  return {
    "Access-Control-Allow-Origin": env.__requestOrigin || env.ALLOWED_ORIGIN || "https://digitbox.dev",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Stripe-Signature",
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
    STRIPE_SECRET_KEY: env?.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: env?.STRIPE_WEBHOOK_SECRET,
    STRIPE_PRICE_ID_MONTHLY: env?.STRIPE_PRICE_ID_MONTHLY,
    DIGITBOX_SITE_URL: env?.DIGITBOX_SITE_URL,
    __requestOrigin: allowedOrigin,
  };
}

function json(body, status, env) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { ...cors(env), "Content-Type": "application/json" },
  });
}


const GITHUB_PROJECT_OWNER = "MilkdromedaStudios";
const GITHUB_PROJECT_REPO = "DigitBox";
const GITHUB_PROJECT_BRANCH = "main";

function safeGithubProjectPath(value) {
  const path = String(value || "").replace(/^\/+/, "");
  if (!path.startsWith("public/projects/")) return "";
  if (path.includes("..") || path.includes("\\") || path.includes("\0")) return "";
  return path;
}

function githubProjectContentType(path, upstreamType) {
  const clean = String(upstreamType || "").split(";")[0].trim();
  if (clean && clean !== "application/octet-stream") return upstreamType;
  const p = String(path || "").toLowerCase();
  if (p.endsWith(".html")) return "text/html; charset=utf-8";
  if (p.endsWith(".js") || p.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (p.endsWith(".css")) return "text/css; charset=utf-8";
  if (p.endsWith(".json")) return "application/json; charset=utf-8";
  if (p.endsWith(".wasm")) return "application/wasm";
  if (p.endsWith(".zip")) return "application/zip";
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
  if (p.endsWith(".webp")) return "image/webp";
  if (p.endsWith(".svg")) return "image/svg+xml";
  return upstreamType || "application/octet-stream";
}

async function githubProjectResponse(request, repoPath, env) {
  const safePath = safeGithubProjectPath(repoPath);
  if (!safePath) return json({ error: "Invalid project path" }, 400, env);

  const encoded = safePath.split("/").map(encodeURIComponent).join("/");
  // media.githubusercontent.com resolves Git LFS objects as real file bytes,
  // while still serving ordinary Git-tracked files. That lets the large game
  // tree stay in GitHub instead of being packed into the Cloudflare deployment.
  const upstreamUrl =
    "https://media.githubusercontent.com/media/" +
    GITHUB_PROJECT_OWNER + "/" +
    GITHUB_PROJECT_REPO + "/" +
    encodeURIComponent(GITHUB_PROJECT_BRANCH) + "/" +
    encoded;

  const headers = new Headers({ Accept: "*/*" });
  const range = request.headers.get("Range");
  const ifNoneMatch = request.headers.get("If-None-Match");
  const ifModifiedSince = request.headers.get("If-Modified-Since");
  if (range) headers.set("Range", range);
  if (ifNoneMatch) headers.set("If-None-Match", ifNoneMatch);
  if (ifModifiedSince) headers.set("If-Modified-Since", ifModifiedSince);

  const upstream = await fetch(upstreamUrl, { method: "GET", headers, redirect: "follow" });
  if (upstream.status === 404) return json({ error: "Project file not found" }, 404, env);

  const responseHeaders = new Headers();
  for (const name of ["content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  responseHeaders.set(
    "Content-Type",
    githubProjectContentType(safePath, upstream.headers.get("Content-Type"))
  );
  responseHeaders.set("Cache-Control", "public, max-age=3600, s-maxage=86400");
  responseHeaders.set("Access-Control-Allow-Origin", env.__requestOrigin || env.ALLOWED_ORIGIN || "https://digitbox.dev");
  responseHeaders.set("Vary", "Origin");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
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
        ),
        env.DB.prepare(
          "CREATE TABLE IF NOT EXISTS billing_accounts (" +
          "user_id TEXT PRIMARY KEY, " +
          "stripe_customer_id TEXT UNIQUE, " +
          "stripe_subscription_id TEXT UNIQUE, " +
          "stripe_price_id TEXT, " +
          "status TEXT NOT NULL DEFAULT 'none', " +
          "cancel_at_period_end INTEGER NOT NULL DEFAULT 0, " +
          "current_period_end INTEGER, " +
          "updated_at INTEGER NOT NULL, " +
          "FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)"
        )
      ]);

      // Stage 2: indexes only after every referenced table exists.
      await env.DB.batch([
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id)"),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at)"),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_player_saves_updated_at ON player_saves(updated_at)"),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_clan_members_clan ON clan_members(clan_id)"),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_clan_rank_value ON clan_members(company_value DESC)"),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_billing_customer ON billing_accounts(stripe_customer_id)"),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_billing_subscription ON billing_accounts(stripe_subscription_id)")
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


const PRO_STATUSES = new Set(["active", "trialing", "past_due"]);
const OPEN_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due"]);

function billingSiteUrl(env) {
  const configured = String(env.DIGITBOX_SITE_URL || "").replace(/\/$/, "");
  if (/^https:\/\/(?:www\.)?digitbox\.dev$/i.test(configured)) return configured;
  if (/^https:\/\/[a-z0-9-]+\.digitbox\.pages\.dev$/i.test(configured)) return configured;
  return "https://digitbox.dev";
}

function stripeConfigured(env) {
  return !!String(env.STRIPE_SECRET_KEY || "").trim();
}

async function stripeRequest(env, method, path, values = {}) {
  const secret = String(env.STRIPE_SECRET_KEY || "").trim();
  if (!secret) throw new Error("Stripe is not configured on the DigitBox backend.");
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values || {})) {
    if (value === undefined || value === null || value === "") continue;
    params.append(key, String(value));
  }
  let endpoint = "https://api.stripe.com" + path;
  const init = {
    method,
    headers: { Authorization: "Bearer " + secret, Accept: "application/json" },
  };
  if (method === "GET") {
    const query = params.toString();
    if (query) endpoint += "?" + query;
  } else {
    init.headers["Content-Type"] = "application/x-www-form-urlencoded";
    init.body = params.toString();
  }
  const response = await fetch(endpoint, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error?.message || body?.error || ("Stripe request failed: " + response.status));
    error.status = response.status;
    throw error;
  }
  return body;
}

async function authenticatedBillingUser(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return { error: "Log in to DigitBox first.", status: 401 };
  const tokenHash = await sha256Hex(match[1]);
  const row = await env.DB.prepare(
    "SELECT u.id, u.email, u.display_name FROM auth_sessions s " +
    "JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?1 AND s.expires_at > ?2"
  ).bind(tokenHash, Date.now()).first();
  if (!row) return { error: "Your DigitBox session is invalid or expired.", status: 401 };
  return { user: publicUser(row) };
}

async function billingRow(env, userId) {
  return env.DB.prepare(
    "SELECT user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, status, " +
    "cancel_at_period_end, current_period_end, updated_at FROM billing_accounts WHERE user_id = ?1"
  ).bind(userId).first();
}

function entitlementsFromBillingRow(row) {
  const status = String(row?.status || "none");
  const pro = PRO_STATUSES.has(status);
  return {
    plan: pro ? "pro" : "free",
    features: pro ? ["nexus_pro"] : [],
    subscriptionStatus: status,
    cancelAtPeriodEnd: !!Number(row?.cancel_at_period_end || 0),
    currentPeriodEnd: row?.current_period_end ? Number(row.current_period_end) : null,
  };
}

function stripeCustomerId(value) {
  if (!value) return "";
  return typeof value === "string" ? value : String(value.id || "");
}

function stripeSubscriptionId(value) {
  if (!value) return "";
  return typeof value === "string" ? value : String(value.id || "");
}

function subscriptionPriceId(subscription) {
  const price = subscription?.items?.data?.[0]?.price;
  return typeof price === "string" ? price : String(price?.id || "");
}

function subscriptionPeriodEnd(subscription) {
  const itemEnds = (subscription?.items?.data || [])
    .map(item => Number(item?.current_period_end || 0))
    .filter(Boolean);
  if (itemEnds.length) return Math.max(...itemEnds) * 1000;
  const legacy = Number(subscription?.current_period_end || 0);
  return legacy ? legacy * 1000 : null;
}

async function ensureStripeCustomer(env, user) {
  const row = await billingRow(env, user.id);
  if (row?.stripe_customer_id) return row.stripe_customer_id;
  const customer = await stripeRequest(env, "POST", "/v1/customers", {
    email: user.email,
    name: user.displayName,
    "metadata[digitbox_user_id]": user.id,
    "metadata[source]": "digitbox",
  });
  await env.DB.prepare(
    "INSERT INTO billing_accounts (user_id, stripe_customer_id, status, cancel_at_period_end, updated_at) " +
    "VALUES (?1, ?2, 'none', 0, ?3) " +
    "ON CONFLICT(user_id) DO UPDATE SET stripe_customer_id = excluded.stripe_customer_id, updated_at = excluded.updated_at"
  ).bind(user.id, customer.id, Date.now()).run();
  return customer.id;
}

async function syncStripeSubscription(env, subscription, fallbackUserId = "") {
  if (!subscription?.id) return null;
  const customer = stripeCustomerId(subscription.customer);
  let userId = String(subscription?.metadata?.digitbox_user_id || fallbackUserId || "");
  if (!userId && customer) {
    const existing = await env.DB.prepare(
      "SELECT user_id FROM billing_accounts WHERE stripe_customer_id = ?1"
    ).bind(customer).first();
    userId = String(existing?.user_id || "");
  }
  if (!userId) return null;

  await env.DB.prepare(
    "INSERT INTO billing_accounts (user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, status, cancel_at_period_end, current_period_end, updated_at) " +
    "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) " +
    "ON CONFLICT(user_id) DO UPDATE SET stripe_customer_id = excluded.stripe_customer_id, " +
    "stripe_subscription_id = excluded.stripe_subscription_id, stripe_price_id = excluded.stripe_price_id, " +
    "status = excluded.status, cancel_at_period_end = excluded.cancel_at_period_end, " +
    "current_period_end = excluded.current_period_end, updated_at = excluded.updated_at"
  ).bind(
    userId,
    customer || null,
    subscription.id,
    subscriptionPriceId(subscription) || null,
    String(subscription.status || "none"),
    subscription.cancel_at_period_end ? 1 : 0,
    subscriptionPeriodEnd(subscription),
    Date.now()
  ).run();
  return billingRow(env, userId);
}

async function retrieveStripeSubscription(env, id) {
  if (!id) return null;
  try {
    return await stripeRequest(env, "GET", "/v1/subscriptions/" + encodeURIComponent(id));
  } catch (_) {
    return null;
  }
}

async function findOpenStripeSubscription(env, customer) {
  const result = await stripeRequest(env, "GET", "/v1/subscriptions", {
    customer,
    status: "all",
    limit: 10,
  });
  return (result?.data || []).find(sub => OPEN_SUBSCRIPTION_STATUSES.has(String(sub?.status || ""))) || null;
}

async function validStripeWebhookSignature(rawBody, signatureHeader, secret) {
  const parts = String(signatureHeader || "").split(",").map(x => x.trim()).filter(Boolean);
  let timestamp = "";
  const signatures = [];
  for (const part of parts) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index);
    const value = part.slice(index + 1);
    if (key === "t") timestamp = value;
    if (key === "v1") signatures.push(value);
  }
  const ts = Number(timestamp);
  if (!ts || !signatures.length) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > 300) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(timestamp + "." + rawBody));
  const expected = bytesToHex(new Uint8Array(signature));
  return signatures.some(candidate => constantTimeEqual(expected, candidate));
}

async function handleBillingStatus(request, env) {
  const auth = await authenticatedBillingUser(request, env);
  if (auth.error) return json({ error: auth.error }, auth.status, env);
  const row = await billingRow(env, auth.user.id);
  return json({
    user: auth.user,
    entitlements: entitlementsFromBillingRow(row),
    configuration: {
      stripe: stripeConfigured(env),
      monthly: !!String(env.STRIPE_PRICE_ID_MONTHLY || "").trim(),
      runtimeHost: new URL(request.url).host,
      environmentKeys: {
        stripeSecret: !!env.STRIPE_SECRET_KEY,
        monthlyPrice: !!env.STRIPE_PRICE_ID_MONTHLY,
        webhookSecret: !!env.STRIPE_WEBHOOK_SECRET,
      },
    },
  }, 200, env);
}

async function handleBillingCheckout(request, env) {
  const auth = await authenticatedBillingUser(request, env);
  if (auth.error) return json({ error: auth.error }, auth.status, env);
  if (!stripeConfigured(env)) return json({ error: "DigitBox Pro billing is not configured yet." }, 503, env);

  const priceId = String(env.STRIPE_PRICE_ID_MONTHLY || "").trim();
  if (!priceId) return json({ error: "The monthly DigitBox Pro plan is not configured yet." }, 503, env);

  const customer = await ensureStripeCustomer(env, auth.user);
  const existing = await findOpenStripeSubscription(env, customer);
  if (existing) {
    const current = await retrieveStripeSubscription(env, existing.id) || existing;
    await syncStripeSubscription(env, current, auth.user.id);
    return json({
      error: "This DigitBox account already has a subscription. Use Manage subscription instead.",
      code: "subscription_exists",
    }, 409, env);
  }

  const root = billingSiteUrl(env);
  const session = await stripeRequest(env, "POST", "/v1/checkout/sessions", {
    mode: "subscription",
    customer,
    client_reference_id: auth.user.id,
    success_url: root + "/profile?billing=success",
    cancel_url: root + "/profile?billing=cancelled",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": 1,
    "metadata[digitbox_user_id]": auth.user.id,
    "metadata[plan]": "digitbox_pro",
    "metadata[interval]": "monthly",
    "subscription_data[metadata][digitbox_user_id]": auth.user.id,
    "subscription_data[metadata][plan]": "digitbox_pro",
  });

  if (!session?.url) return json({ error: "Stripe did not return a Checkout URL." }, 502, env);
  return json({ url: session.url }, 200, env);
}

async function handleBillingPortal(request, env) {
  const auth = await authenticatedBillingUser(request, env);
  if (auth.error) return json({ error: auth.error }, auth.status, env);
  if (!stripeConfigured(env)) return json({ error: "DigitBox Pro billing is not configured yet." }, 503, env);
  const customer = await ensureStripeCustomer(env, auth.user);
  const session = await stripeRequest(env, "POST", "/v1/billing_portal/sessions", {
    customer,
    return_url: billingSiteUrl(env) + "/profile",
  });
  if (!session?.url) return json({ error: "Stripe did not return a billing portal URL." }, 502, env);
  return json({ url: session.url }, 200, env);
}

async function handleBillingWebhook(request, env) {
  const secret = String(env.STRIPE_WEBHOOK_SECRET || "").trim();
  if (!secret) return json({ error: "Stripe webhook secret is not configured." }, 503, env);

  const rawBody = await request.text();
  const valid = await validStripeWebhookSignature(rawBody, request.headers.get("Stripe-Signature"), secret);
  if (!valid) return json({ error: "Invalid Stripe webhook signature." }, 400, env);

  const event = JSON.parse(rawBody);
  const object = event?.data?.object;

  if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event?.type)) {
    const current = await retrieveStripeSubscription(env, stripeSubscriptionId(object)) || object;
    await syncStripeSubscription(env, current);
  } else if (event?.type === "checkout.session.completed" && object?.mode === "subscription") {
    const userId = String(object?.metadata?.digitbox_user_id || object?.client_reference_id || "");
    const customer = stripeCustomerId(object?.customer);
    if (userId && customer) {
      await env.DB.prepare(
        "INSERT INTO billing_accounts (user_id, stripe_customer_id, status, cancel_at_period_end, updated_at) " +
        "VALUES (?1, ?2, 'none', 0, ?3) " +
        "ON CONFLICT(user_id) DO UPDATE SET stripe_customer_id = excluded.stripe_customer_id, updated_at = excluded.updated_at"
      ).bind(userId, customer, Date.now()).run();
    }
    const subscriptionId = stripeSubscriptionId(object?.subscription);
    if (subscriptionId) {
      const subscription = await retrieveStripeSubscription(env, subscriptionId);
      if (subscription) await syncStripeSubscription(env, subscription, userId);
    }
  }

  return json({ received: true }, 200, env);
}

export default {
  async fetch(request, env) {
    env = normalizeBindings(env, request);
    const url = new URL(request.url);

    // Eaglercraft and the rest of the large project tree live in GitHub rather
    // than Cloudflare's static asset bundle. Serve them on-demand so the public
    // URL stays same-origin and the Pages deployment remains small.
    if (url.pathname === "/projects/eaglercraft-launcher" || url.pathname === "/projects/eaglercraft-launcher/") {
      return githubProjectResponse(request, "public/projects/eaglercraft-launcher.html", env);
    }

    if (
      url.pathname === "/projects/eaglercraft-launcher.html" ||
      url.pathname.startsWith("/projects/Eaglercraft-Launcher-main/") ||
      url.pathname.startsWith("/projects/eaglercraft-runtime/")
    ) {
      return githubProjectResponse(request, "public" + url.pathname, env);
    }

    if (url.pathname === "/api/content/file" && request.method === "GET") {
      const requestedPath = String(url.searchParams.get("path") || "");
      if (requestedPath.startsWith("public/projects/")) {
        return githubProjectResponse(request, requestedPath, env);
      }
    }

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

    if (url.pathname === "/v1/billing/status" && request.method === "GET") {
      return handleBillingStatus(request, env);
    }
    if (url.pathname === "/v1/billing/checkout" && request.method === "POST") {
      return handleBillingCheckout(request, env);
    }
    if (url.pathname === "/v1/billing/portal" && request.method === "POST") {
      return handleBillingPortal(request, env);
    }
    if (url.pathname === "/v1/billing/webhook" && request.method === "POST") {
      return handleBillingWebhook(request, env);
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
