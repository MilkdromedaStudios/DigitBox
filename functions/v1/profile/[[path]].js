function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store",
  };
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(), "Content-Type": "application/json", ...extra },
  });
}

function bindings(env) {
  let db = env?.DB || null;
  let bucket = env?.BUCKET || null;
  for (const value of Object.values(env || {})) {
    if (!db && value && typeof value.prepare === "function" && typeof value.batch === "function") db = value;
    if (!bucket && value && typeof value.get === "function" && typeof value.put === "function" && typeof value.delete === "function" && typeof value.prepare !== "function") bucket = value;
  }
  return { db, bucket };
}

function bytesToHex(bytes) {
  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return bytesToHex(new Uint8Array(digest));
}

async function requireUser(request, db) {
  const auth = request.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return { error: "Sign in to DigitBox first.", status: 401 };
  const tokenHash = await sha256Hex(match[1]);
  const row = await db.prepare(
    "SELECT u.id, u.email, u.display_name, s.expires_at FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?1 AND s.expires_at>?2"
  ).bind(tokenHash, Date.now()).first();
  if (!row) return { error: "Your DigitBox session is invalid or expired.", status: 401 };
  return {
    user: {
      id: row.id,
      email: row.email,
      displayName: row.display_name || String(row.email || "").split("@")[0] || "Player",
    },
  };
}

function validUserId(value) {
  return /^user_[A-Za-z0-9_-]{8,96}$/.test(String(value || ""));
}

function avatarKey(userId) {
  return "profiles/" + userId + "/avatar";
}

async function avatarMeta(bucket, userId, request) {
  if (!bucket) return { avatarUrl: "", avatarVersion: 0 };
  const key = avatarKey(userId);
  let head = null;
  try {
    head = typeof bucket.head === "function" ? await bucket.head(key) : await bucket.get(key);
  } catch {}
  if (!head) return { avatarUrl: "", avatarVersion: 0 };
  const version = Number(head.customMetadata?.uploadedAt || 0) || 1;
  const origin = new URL(request.url).origin;
  return {
    avatarUrl: origin + "/v1/profile/avatar/" + encodeURIComponent(userId) + "?v=" + version,
    avatarVersion: version,
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });

  const { db, bucket } = bindings(env);
  if (!db) return json({ error: "DigitBox account database is unavailable." }, 503);

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");

  const publicAvatar = path.match(/^\/v1\/profile\/avatar\/([^/]+)$/);
  if (publicAvatar && request.method === "GET") {
    if (!bucket) return json({ error: "Avatar storage is unavailable." }, 503);
    const userId = decodeURIComponent(publicAvatar[1]);
    if (!validUserId(userId)) return json({ error: "Invalid profile id." }, 400);
    const object = await bucket.get(avatarKey(userId));
    if (!object) return json({ error: "Avatar not found." }, 404);
    const headers = new Headers(cors());
    object.writeHttpMetadata?.(headers);
    headers.set("Content-Type", headers.get("Content-Type") || "image/webp");
    headers.set("Cache-Control", "public, max-age=300");
    if (object.httpEtag) headers.set("ETag", object.httpEtag);
    return new Response(object.body, { status: 200, headers });
  }

  const auth = await requireUser(request, db);
  if (auth.error) return json({ error: auth.error }, auth.status);

  if (path === "/v1/profile/me" && request.method === "GET") {
    const avatar = await avatarMeta(bucket, auth.user.id, request);
    return json({ user: { ...auth.user, ...avatar } });
  }

  if (path === "/v1/profile/avatar" && request.method === "PUT") {
    if (!bucket) return json({ error: "Avatar storage is unavailable." }, 503);
    const type = String(request.headers.get("content-type") || "").toLowerCase().split(";")[0].trim();
    if (!["image/png", "image/jpeg", "image/webp"].includes(type)) {
      return json({ error: "Use a PNG, JPG, or WebP image." }, 415);
    }
    const declared = Number(request.headers.get("content-length") || 0);
    if (declared > 4 * 1024 * 1024) return json({ error: "Profile images must be 4 MB or smaller." }, 413);
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 4 * 1024 * 1024) {
      return json({ error: "Profile images must be between 1 byte and 4 MB." }, 413);
    }
    const uploadedAt = Date.now();
    await bucket.put(avatarKey(auth.user.id), bytes, {
      httpMetadata: { contentType: type, cacheControl: "public, max-age=300" },
      customMetadata: { userId: auth.user.id, uploadedAt: String(uploadedAt) },
    });
    const origin = new URL(request.url).origin;
    return json({
      ok: true,
      avatarUrl: origin + "/v1/profile/avatar/" + encodeURIComponent(auth.user.id) + "?v=" + uploadedAt,
      avatarVersion: uploadedAt,
    });
  }

  if (path === "/v1/profile/avatar" && request.method === "DELETE") {
    if (!bucket) return json({ error: "Avatar storage is unavailable." }, 503);
    await bucket.delete(avatarKey(auth.user.id));
    return json({ ok: true });
  }

  return json({ error: "Not found" }, 404);
}
