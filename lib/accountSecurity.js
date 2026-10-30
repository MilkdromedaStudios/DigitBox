// Shared by every account API entry point. This module is server-only.
const encoder = new TextEncoder();
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const PASSWORD_ITERATIONS = 100000; // Cloudflare Web Crypto's supported ceiling.

export function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export function randomHex(size) {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(size)));
}

export async function sha256Hex(value) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(String(value)))));
}

export function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function derivePassword(password, salt, iterations) {
  if (!/^[a-f0-9]{32}$/i.test(salt)) return "";
  const saltBytes = Uint8Array.from(salt.match(/../g), (hex) => parseInt(hex, 16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations }, key, 256);
  return bytesToHex(new Uint8Array(bits));
}

export async function passwordHash(password, salt) {
  // Include the algorithm/cost so changing it later cannot strand accounts.
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${await derivePassword(password, salt, PASSWORD_ITERATIONS)}`;
}

export async function verifyPassword(password, salt, stored) {
  const tagged = /^pbkdf2-sha256\$(100000|120000)\$([a-f0-9]{64})$/i.exec(stored || "");
  if (tagged) return constantTimeEqual(await derivePassword(password, salt, Number(tagged[1])), tagged[2]);
  if (!/^[a-f0-9]{64}$/i.test(stored || "")) return false;
  // The old Next route used 100k; the old standalone route used 120k.
  // Preserve both formats on runtimes that support them; never accept a
  // failed hash calculation as a successful password check.
  for (const iterations of [100000, 120000]) {
    try {
      if (constantTimeEqual(await derivePassword(password, salt, iterations), stored)) return true;
    } catch (_) { /* Some Workers runtimes reject the old 120k cost. */ }
  }
  return false;
}

export async function getOwnerId(env) {
  const configured = String(env.OWNER_USER_ID || "").trim();
  if (configured) return configured;
  const row = await env.DB.prepare("SELECT value FROM deepforge_config WHERE key = 'owner_user_id'").first();
  return row ? String(row.value) : "";
}

export function extraAdminIds(env) {
  return String(env.ADMIN_USER_IDS || "").split(",").map((id) => id.trim()).filter(Boolean);
}

export async function accountRole(env, userId) {
  const owner = Boolean(userId) && (await getOwnerId(env)) === userId;
  return { owner, admin: owner || extraAdminIds(env).includes(userId) };
}

export function bearerToken(request) {
  const match = (request.headers.get("Authorization") || "").match(/^Bearer\s+([a-f0-9]{64})$/i);
  return match ? match[1] : "";
}

export async function readAuthBody(request) {
  // Bound the actual stream, including requests without Content-Length.
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 4096) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const body = JSON.parse(new TextDecoder().decode(bytes));
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch (_) { return null; }
}

export async function authRateLimit(request, env, action, email) {
  const now = Date.now();
  // CF-Connecting-IP is set by Cloudflare. Never trust X-Forwarded-For.
  // If a trusted edge IP isn't available, use a shared fallback bucket.
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  await env.DB.prepare("DELETE FROM auth_rate_limits WHERE reset_at <= ?1").bind(now).run();
  const buckets = [[`ip:${ip}`, action === "signup" ? 10 : 30]];
  if (email) buckets.push([`account:${email}`, 10]);
  for (const [identity, limit] of buckets) {
    const key = await sha256Hex(`${action}:${identity}`);
    // Atomic increment, shared across isolates and all deployment aliases.
    const row = await env.DB.prepare(
      "INSERT INTO auth_rate_limits (key, attempts, reset_at) VALUES (?1, 1, ?2) " +
      "ON CONFLICT(key) DO UPDATE SET attempts = auth_rate_limits.attempts + 1 " +
      "RETURNING attempts, reset_at"
    ).bind(key, now + AUTH_WINDOW_MS).first();
    if (!row || row.attempts > limit) return Math.max(1, Math.ceil(((row?.reset_at || now + AUTH_WINDOW_MS) - now) / 1000));
  }
  return 0;
}
