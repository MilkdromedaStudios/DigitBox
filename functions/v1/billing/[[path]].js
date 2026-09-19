const DEFAULT_SITE_URL = "https://digitbox.dev";
const PRO_STATUSES = new Set(["active", "trialing", "past_due"]);
const OPEN_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due"]);
let schemaReadyPromise = null;

function normalizeEnv(env, request) {
  let db = env && env.DB ? env.DB : null;
  if (env) {
    for (const value of Object.values(env)) {
      if (!db && value && typeof value.prepare === "function" && typeof value.batch === "function") db = value;
    }
  }
  const origin = request?.headers?.get("Origin") || "";
  const allowedOrigin =
    origin &&
    (origin === "https://digitbox.dev" ||
      origin === "https://www.digitbox.dev" ||
      origin === "https://digitbox.pages.dev" ||
      /^https:\/\/[a-z0-9-]+\.digitbox\.pages\.dev$/i.test(origin))
      ? origin
      : "";
  return { ...(env || {}), DB: db, __requestOrigin: allowedOrigin };
}

function cors(env) {
  return {
    "Access-Control-Allow-Origin": env.__requestOrigin || env.ALLOWED_ORIGIN || DEFAULT_SITE_URL,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Stripe-Signature",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}

function json(body, status, env) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { ...cors(env), "Content-Type": "application/json" },
  });
}

function bytesToHex(bytes) {
  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return bytesToHex(new Uint8Array(digest));
}

function constantTimeEqual(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

async function ensureBillingSchema(env) {
  if (!env.DB) throw new Error("D1 binding DB is missing.");
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      await env.DB.prepare(
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
      ).run();
      await env.DB.batch([
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_billing_customer ON billing_accounts(stripe_customer_id)"),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_billing_subscription ON billing_accounts(stripe_subscription_id)"),
      ]);
    })().catch(error => {
      schemaReadyPromise = null;
      throw error;
    });
  }
  return schemaReadyPromise;
}

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name || String(row.email || "").split("@")[0] || "Player",
  };
}

async function authenticatedUser(request, env) {
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

function siteUrl(env) {
  const configured = String(env.DIGITBOX_SITE_URL || "").replace(/\/$/, "");
  if (/^https:\/\/(?:www\.)?digitbox\.dev$/i.test(configured)) return configured;
  if (/^https:\/\/[a-z0-9-]+\.digitbox\.pages\.dev$/i.test(configured)) return configured;
  return DEFAULT_SITE_URL;
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
  let url = "https://api.stripe.com" + path;
  const init = {
    method,
    headers: { Authorization: "Bearer " + secret, Accept: "application/json" },
  };
  if (method === "GET") {
    const query = params.toString();
    if (query) url += "?" + query;
  } else {
    init.headers["Content-Type"] = "application/x-www-form-urlencoded";
    init.body = params.toString();
  }
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || body?.error || ("Stripe request failed: " + response.status);
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return body;
}

function customerId(value) {
  if (!value) return "";
  return typeof value === "string" ? value : String(value.id || "");
}

function subscriptionId(value) {
  if (!value) return "";
  return typeof value === "string" ? value : String(value.id || "");
}

function priceIdFromSubscription(subscription) {
  const item = subscription?.items?.data?.[0];
  const price = item?.price;
  return typeof price === "string" ? price : String(price?.id || "");
}

function currentPeriodEndFromSubscription(subscription) {
  const itemEnds = (subscription?.items?.data || [])
    .map(item => Number(item?.current_period_end || 0))
    .filter(Boolean);
  if (itemEnds.length) return Math.max(...itemEnds) * 1000;
  const legacy = Number(subscription?.current_period_end || 0);
  return legacy ? legacy * 1000 : null;
}

async function billingRow(env, userId) {
  return env.DB.prepare(
    "SELECT user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, status, " +
      "cancel_at_period_end, current_period_end, updated_at FROM billing_accounts WHERE user_id = ?1"
  ).bind(userId).first();
}

function entitlementsFromRow(row) {
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

async function ensureCustomer(env, user) {
  const row = await billingRow(env, user.id);
  if (row?.stripe_customer_id) return { customerId: row.stripe_customer_id, row };

  const customer = await stripeRequest(env, "POST", "/v1/customers", {
    email: user.email,
    name: user.displayName,
    "metadata[digitbox_user_id]": user.id,
    "metadata[source]": "digitbox",
  });
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO billing_accounts (user_id, stripe_customer_id, status, cancel_at_period_end, updated_at) " +
      "VALUES (?1, ?2, 'none', 0, ?3) " +
      "ON CONFLICT(user_id) DO UPDATE SET stripe_customer_id = excluded.stripe_customer_id, updated_at = excluded.updated_at"
  ).bind(user.id, customer.id, now).run();
  return { customerId: customer.id, row: await billingRow(env, user.id) };
}

async function syncSubscription(env, subscription, fallbackUserId = "") {
  if (!subscription || !subscription.id) return null;
  const stripeCustomerId = customerId(subscription.customer);
  let userId = String(subscription?.metadata?.digitbox_user_id || fallbackUserId || "");
  if (!userId && stripeCustomerId) {
    const existing = await env.DB.prepare(
      "SELECT user_id FROM billing_accounts WHERE stripe_customer_id = ?1"
    ).bind(stripeCustomerId).first();
    userId = String(existing?.user_id || "");
  }
  if (!userId) return null;

  const now = Date.now();
  const status = String(subscription.status || "none");
  const priceId = priceIdFromSubscription(subscription);
  const periodEnd = currentPeriodEndFromSubscription(subscription);
  await env.DB.prepare(
    "INSERT INTO billing_accounts (user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, status, cancel_at_period_end, current_period_end, updated_at) " +
      "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) " +
      "ON CONFLICT(user_id) DO UPDATE SET " +
      "stripe_customer_id = excluded.stripe_customer_id, " +
      "stripe_subscription_id = excluded.stripe_subscription_id, " +
      "stripe_price_id = excluded.stripe_price_id, status = excluded.status, " +
      "cancel_at_period_end = excluded.cancel_at_period_end, current_period_end = excluded.current_period_end, updated_at = excluded.updated_at"
  ).bind(
    userId,
    stripeCustomerId || null,
    subscription.id,
    priceId || null,
    status,
    subscription.cancel_at_period_end ? 1 : 0,
    periodEnd,
    now
  ).run();
  return billingRow(env, userId);
}

async function retrieveSubscription(env, id) {
  if (!id) return null;
  try {
    return await stripeRequest(env, "GET", "/v1/subscriptions/" + encodeURIComponent(id));
  } catch (_) {
    return null;
  }
}

async function findOpenStripeSubscription(env, stripeCustomerId) {
  const result = await stripeRequest(env, "GET", "/v1/subscriptions", {
    customer: stripeCustomerId,
    status: "all",
    limit: 10,
  });
  return (result?.data || []).find(subscription => OPEN_SUBSCRIPTION_STATUSES.has(String(subscription?.status || ""))) || null;
}

async function handleStatus(request, env) {
  const auth = await authenticatedUser(request, env);
  if (auth.error) return json({ error: auth.error }, auth.status, env);
  const row = await billingRow(env, auth.user.id);
  return json({
    user: auth.user,
    entitlements: entitlementsFromRow(row),
    configuration: {
      stripe: stripeConfigured(env),
      monthly: !!String(env.STRIPE_PRICE_ID_MONTHLY || "").trim(),
      yearly: !!String(env.STRIPE_PRICE_ID_YEARLY || "").trim(),
    },
  }, 200, env);
}

async function handleCheckout(request, env) {
  const auth = await authenticatedUser(request, env);
  if (auth.error) return json({ error: auth.error }, auth.status, env);
  if (!stripeConfigured(env)) return json({ error: "DigitBox Pro billing is not configured yet." }, 503, env);

  const body = await request.json().catch(() => ({}));
  const interval = body?.interval === "yearly" ? "yearly" : "monthly";
  const priceId = String(interval === "yearly" ? env.STRIPE_PRICE_ID_YEARLY || "" : env.STRIPE_PRICE_ID_MONTHLY || "").trim();
  if (!priceId) return json({ error: interval === "yearly" ? "The yearly DigitBox Pro plan is not configured yet." : "The monthly DigitBox Pro plan is not configured yet." }, 503, env);

  const { customerId: stripeCustomerId } = await ensureCustomer(env, auth.user);
  const existing = await findOpenStripeSubscription(env, stripeCustomerId);
  if (existing) {
    const current = await retrieveSubscription(env, existing.id) || existing;
    await syncSubscription(env, current, auth.user.id);
    return json({ error: "This DigitBox account already has a subscription. Use Manage subscription instead.", code: "subscription_exists" }, 409, env);
  }

  const root = siteUrl(env);
  const session = await stripeRequest(env, "POST", "/v1/checkout/sessions", {
    mode: "subscription",
    customer: stripeCustomerId,
    client_reference_id: auth.user.id,
    success_url: root + "/profile?billing=success",
    cancel_url: root + "/profile?billing=cancelled",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": 1,
    "metadata[digitbox_user_id]": auth.user.id,
    "metadata[plan]": "digitbox_pro",
    "metadata[interval]": interval,
    "subscription_data[metadata][digitbox_user_id]": auth.user.id,
    "subscription_data[metadata][plan]": "digitbox_pro",
  });

  if (!session?.url) return json({ error: "Stripe did not return a Checkout URL." }, 502, env);
  return json({ url: session.url }, 200, env);
}

async function handlePortal(request, env) {
  const auth = await authenticatedUser(request, env);
  if (auth.error) return json({ error: auth.error }, auth.status, env);
  if (!stripeConfigured(env)) return json({ error: "DigitBox Pro billing is not configured yet." }, 503, env);
  const { customerId: stripeCustomerId } = await ensureCustomer(env, auth.user);
  const session = await stripeRequest(env, "POST", "/v1/billing_portal/sessions", {
    customer: stripeCustomerId,
    return_url: siteUrl(env) + "/profile",
  });
  if (!session?.url) return json({ error: "Stripe did not return a billing portal URL." }, 502, env);
  return json({ url: session.url }, 200, env);
}

async function webhookSignatureValid(rawBody, signatureHeader, secret) {
  const values = String(signatureHeader || "").split(",").map(value => value.trim()).filter(Boolean);
  let timestamp = "";
  const signatures = [];
  for (const value of values) {
    const index = value.indexOf("=");
    if (index < 0) continue;
    const key = value.slice(0, index);
    const val = value.slice(index + 1);
    if (key === "t") timestamp = val;
    if (key === "v1") signatures.push(val);
  }
  const timestampNumber = Number(timestamp);
  if (!timestampNumber || !signatures.length) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestampNumber) > 300) return false;

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

async function handleWebhook(request, env) {
  const webhookSecret = String(env.STRIPE_WEBHOOK_SECRET || "").trim();
  if (!webhookSecret) return json({ error: "Stripe webhook secret is not configured." }, 503, env);

  const rawBody = await request.text();
  const valid = await webhookSignatureValid(rawBody, request.headers.get("Stripe-Signature"), webhookSecret);
  if (!valid) return json({ error: "Invalid Stripe webhook signature." }, 400, env);

  const event = JSON.parse(rawBody);
  const object = event?.data?.object;
  if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event?.type)) {
    const current = await retrieveSubscription(env, subscriptionId(object)) || object;
    await syncSubscription(env, current);
  } else if (event?.type === "checkout.session.completed" && object?.mode === "subscription") {
    const userId = String(object?.metadata?.digitbox_user_id || object?.client_reference_id || "");
    const stripeCustomerId = customerId(object?.customer);
    if (userId && stripeCustomerId) {
      await env.DB.prepare(
        "INSERT INTO billing_accounts (user_id, stripe_customer_id, status, cancel_at_period_end, updated_at) " +
          "VALUES (?1, ?2, 'none', 0, ?3) " +
          "ON CONFLICT(user_id) DO UPDATE SET stripe_customer_id = excluded.stripe_customer_id, updated_at = excluded.updated_at"
      ).bind(userId, stripeCustomerId, Date.now()).run();
    }
    const subId = subscriptionId(object?.subscription);
    if (subId) {
      const subscription = await retrieveSubscription(env, subId);
      if (subscription) await syncSubscription(env, subscription, userId);
    }
  }

  return json({ received: true }, 200, env);
}

export async function onRequest(context) {
  const request = context.request;
  const env = normalizeEnv(context.env, request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(env) });

  try {
    await ensureBillingSchema(env);
    const path = new URL(request.url).pathname.replace(/\/+$/, "");
    if (path === "/v1/billing/status" && request.method === "GET") return handleStatus(request, env);
    if (path === "/v1/billing/checkout" && request.method === "POST") return handleCheckout(request, env);
    if (path === "/v1/billing/portal" && request.method === "POST") return handlePortal(request, env);
    if (path === "/v1/billing/webhook" && request.method === "POST") return handleWebhook(request, env);
    return json({ error: "Billing route not found." }, 404, env);
  } catch (error) {
    console.error("DigitBox billing error", error);
    return json({ error: error?.message || "DigitBox billing failed." }, Number(error?.status) >= 400 ? Number(error.status) : 500, env);
  }
}
