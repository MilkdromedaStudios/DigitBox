export const config = { runtime: "edge" };

const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;
const MAX_PAYLOAD_BYTES = 6 * 1024 * 1024;
const TABLE = "appgpt_telegram_vaults";
let managerBotCache = null;
let managerBotCacheAt = 0;

export default async function handler(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const botToken = process.env.APPGPT_TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const encryptionSecret = process.env.APPGPT_SYNC_ENCRYPTION_KEY;

  if (!botToken || !supabaseUrl || !serviceKey || !encryptionSecret) {
    return json({ error: "Telegram account sync is not configured on this deployment." }, 503);
  }

  let body;
  try { body = await request.json(); }
  catch { return json({ error: "Invalid JSON body" }, 400); }

  let identity;
  try { identity = await validateInitData(body?.initData, botToken); }
  catch (error) { return json({ error: error.message || "Telegram sign-in failed" }, 401); }

  const operation = String(body?.operation || "status");
  const userId = String(identity.user.id);

  try {
    if (operation === "status") {
      const row = await readVault(supabaseUrl, serviceKey, userId);
      return json({
        ok: true,
        user: publicUser(identity.user),
        hasCloudData: Boolean(row),
        updatedAt: row?.updated_at || null,
        managerBot: await getManagerBot(botToken)
      });
    }

    if (operation === "pull") {
      const row = await readVault(supabaseUrl, serviceKey, userId);
      if (!row) {
        return json({
          ok: true,
          user: publicUser(identity.user),
          data: null,
          updatedAt: null,
          managerBot: await getManagerBot(botToken)
        });
      }
      const data = await decryptPayload(row.payload, encryptionSecret);
      if (!body?.includeSecrets && data?.provider) delete data.provider.apiKey;
      return json({
        ok: true,
        user: publicUser(identity.user),
        data,
        updatedAt: row.updated_at,
        managerBot: await getManagerBot(botToken)
      });
    }

    if (operation === "push") {
      if (!body?.data || typeof body.data !== "object") return json({ error: "Missing sync data" }, 400);
      let data = structuredClone(body.data);
      const encodedSize = new TextEncoder().encode(JSON.stringify(data)).byteLength;
      if (encodedSize > MAX_PAYLOAD_BYTES) return json({ error: "Project sync payload is too large. Keep fewer historical versions and try again." }, 413);

      // Project autosync should never accidentally erase a previously synced API key.
      if (!data?.provider?.apiKey) {
        const current = await readVault(supabaseUrl, serviceKey, userId);
        if (current) {
          try {
            const old = await decryptPayload(current.payload, encryptionSecret);
            if (old?.provider?.apiKey) {
              data.provider = { ...(data.provider || {}), apiKey: old.provider.apiKey };
            }
          } catch {}
        }
      }

      data.v = 1;
      data.syncedAt = new Date().toISOString();
      const payload = await encryptPayload(data, encryptionSecret);
      const updatedAt = new Date().toISOString();
      await writeVault(supabaseUrl, serviceKey, userId, payload, updatedAt);
      return json({ ok: true, user: publicUser(identity.user), updatedAt });
    }

    if (operation === "clear") {
      await deleteVault(supabaseUrl, serviceKey, userId);
      return json({ ok: true, user: publicUser(identity.user) });
    }

    return json({ error: "Unknown sync operation" }, 400);
  } catch (error) {
    console.error("AppGPT Telegram sync failed", error);
    return json({ error: error.message || "Account sync failed" }, 500);
  }
}

async function validateInitData(initData, botToken) {
  if (!initData || typeof initData !== "string") throw new Error("Open AppGPT from Telegram to sign in automatically.");
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  if (!receivedHash || !/^[0-9a-f]{64}$/i.test(receivedHash)) throw new Error("Telegram login data is incomplete.");
  params.delete("hash");

  const rows = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`);
  const dataCheckString = rows.join("\n");
  const secretKey = await hmac(new TextEncoder().encode("WebAppData"), new TextEncoder().encode(botToken));
  const calculated = bytesToHex(await hmac(secretKey, new TextEncoder().encode(dataCheckString)));
  if (!constantTimeEqual(calculated.toLowerCase(), receivedHash.toLowerCase())) throw new Error("Telegram login signature is invalid.");

  const authDate = Number(params.get("auth_date") || 0);
  const now = Math.floor(Date.now() / 1000);
  if (!authDate || Math.abs(now - authDate) > MAX_AUTH_AGE_SECONDS) throw new Error("Telegram login session is too old. Close and reopen AppGPT from Telegram.");

  let user;
  try { user = JSON.parse(params.get("user") || "null"); }
  catch { throw new Error("Telegram user data could not be read."); }
  if (!user?.id) throw new Error("Telegram user identity is missing.");
  return { user, authDate };
}

async function hmac(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, dataBytes));
}

async function encryptionKey(secret) {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptPayload(value, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey(secret);
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
  return JSON.stringify({ v: 1, iv: bytesToBase64(iv), data: bytesToBase64(encrypted) });
}

async function decryptPayload(payload, secret) {
  const wrapped = JSON.parse(payload);
  if (wrapped?.v !== 1 || !wrapped.iv || !wrapped.data) throw new Error("Stored sync data has an unsupported format.");
  const key = await encryptionKey(secret);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(wrapped.iv) }, key, base64ToBytes(wrapped.data));
  return JSON.parse(new TextDecoder().decode(plain));
}

async function readVault(baseUrl, serviceKey, userId) {
  const url = `${baseUrl.replace(/\/+$/, "")}/rest/v1/${TABLE}?telegram_user_id=eq.${encodeURIComponent(userId)}&select=payload,updated_at&limit=1`;
  const response = await fetch(url, { headers: supabaseHeaders(serviceKey), cache: "no-store" });
  if (!response.ok) throw new Error(`Sync storage read failed (${response.status})`);
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function writeVault(baseUrl, serviceKey, userId, payload, updatedAt) {
  const url = `${baseUrl.replace(/\/+$/, "")}/rest/v1/${TABLE}?on_conflict=telegram_user_id`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...supabaseHeaders(serviceKey),
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify([{ telegram_user_id: userId, payload, updated_at: updatedAt }])
  });
  if (!response.ok) throw new Error(`Sync storage write failed (${response.status})`);
}

async function deleteVault(baseUrl, serviceKey, userId) {
  const url = `${baseUrl.replace(/\/+$/, "")}/rest/v1/${TABLE}?telegram_user_id=eq.${encodeURIComponent(userId)}`;
  const response = await fetch(url, { method: "DELETE", headers: supabaseHeaders(serviceKey) });
  if (!response.ok) throw new Error(`Sync storage delete failed (${response.status})`);
}

function supabaseHeaders(serviceKey) {
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
}

async function getManagerBot(botToken) {
  if (managerBotCache && Date.now() - managerBotCacheAt < 10 * 60 * 1000) return managerBotCache;
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, { method: "POST" });
    const data = await response.json();
    if (!data?.ok) return null;
    managerBotCache = {
      id: data.result.id,
      username: data.result.username || "",
      canManageBots: Boolean(data.result.can_manage_bots)
    };
    managerBotCacheAt = Date.now();
    return managerBotCache;
  } catch { return null; }
}

function publicUser(user) {
  return {
    id: String(user.id),
    firstName: user.first_name || "",
    lastName: user.last_name || "",
    username: user.username || "",
    photoUrl: user.photo_url || "",
    isPremium: Boolean(user.is_premium),
    languageCode: user.language_code || ""
  };
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function bytesToHex(bytes) {
  return [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
