const CONFIGURED_API_ROOT = (process.env.NEXT_PUBLIC_DEEPFORGE_API || "").replace(/\/$/, "");

function apiRoot() {
  if (CONFIGURED_API_ROOT) return CONFIGURED_API_ROOT;
  if (typeof window !== "undefined") {
    try {
      const override = String(localStorage.getItem(API_OVERRIDE_KEY) || "").trim().replace(/\/$/, "");
      if (/^https:\/\//i.test(override)) return override;
    } catch (_) {}
    if (window.location && window.location.origin) {
      return window.location.origin.replace(/\/$/, "");
    }
  }
  return "";
}

export function getCloudApiRoot() {
  return apiRoot();
}

export function setCloudApiRoot(value) {
  if (typeof window === "undefined") return "";
  let root = String(value || "").trim().replace(/\/$/, "");
  if (root && !/^https:\/\//i.test(root)) root = "https://" + root;
  if (!root) {
    localStorage.removeItem(API_OVERRIDE_KEY);
    return "";
  }
  localStorage.setItem(API_OVERRIDE_KEY, root);
  return root;
}
const PLAYER_KEY = "digitbox-deepforge-player-id-v1";
const AUTH_KEY = "digitbox-deepforge-auth-v1";
const API_OVERRIDE_KEY = "digitbox-deepforge-api-root-v1";

export function cloudEnabled() {
  return true;
}

export function getOrCreatePlayerId() {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem(PLAYER_KEY);
  if (!id) {
    const random = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
    id = "guest_" + random;
    localStorage.setItem(PLAYER_KEY, id);
  }
  return id;
}

export function getCloudAuthToken() {
  if (typeof window === "undefined") return "";
  try {
    const raw = JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
    return raw && raw.token ? String(raw.token) : "";
  } catch (_) {
    return "";
  }
}

function storeCloudAuth(payload) {
  if (typeof window === "undefined") return payload;
  if (payload && payload.token && payload.user) {
    localStorage.setItem(AUTH_KEY, JSON.stringify({
      token: payload.token,
      user: payload.user,
      expiresAt: payload.expiresAt || 0,
    }));
  }
  return payload;
}

export function clearCloudAuth() {
  if (typeof window !== "undefined") localStorage.removeItem(AUTH_KEY);
}

async function authRequest(path, options) {
  const root = apiRoot();
  if (!root) throw new Error("Cloudflare API is unavailable.");
  const response = await fetch(root + path, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...((options && options.headers) || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || ("Auth request failed: " + response.status));
  return body;
}

export async function checkCloudBackend() {
  const root = apiRoot();
  if (!root) return { ok: false, d1: false, r2: false };
  const response = await fetch(root + "/v1/health", {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const type = String(response.headers.get("content-type") || "");
  if (!type.includes("application/json")) {
    throw new Error("DEEPFORGE API is not deployed on this host.");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) {
    throw new Error(body.error || "DEEPFORGE D1 health check failed.");
  }
  return body;
}

export async function cloudSignup(email, password, displayName) {
  const payload = await authRequest("/v1/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password, displayName }),
  });
  return storeCloudAuth(payload);
}

export async function cloudLogin(email, password) {
  const payload = await authRequest("/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return storeCloudAuth(payload);
}

export async function loadCloudAuth() {
  const token = getCloudAuthToken();
  if (!token) return null;
  try {
    const payload = await authRequest("/v1/auth/me", {
      method: "GET",
      headers: { Authorization: "Bearer " + token },
    });
    return payload && payload.user ? payload.user : null;
  } catch (_) {
    clearCloudAuth();
    return null;
  }
}

export async function cloudLogout() {
  const token = getCloudAuthToken();
  try {
    if (token) {
      await authRequest("/v1/auth/logout", {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
      });
    }
  } finally {
    clearCloudAuth();
  }
}

export async function loadCloudSave(playerId) {
  const root = apiRoot();
  if (!root || !playerId) return null;
  const response = await fetch(root + "/v1/save/" + encodeURIComponent(playerId), {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (response.status === 404) {
    const type = String(response.headers.get("content-type") || "");
    if (type.includes("application/json")) return null;
    throw new Error("DEEPFORGE API route is missing on this host.");
  }
  if (!response.ok) throw new Error("Cloud load failed: " + response.status);
  return response.json();
}

export async function saveCloudSave(playerId, payload) {
  const root = apiRoot();
  if (!root || !playerId) return null;
  const response = await fetch(root + "/v1/save/" + encodeURIComponent(playerId), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("Cloud save failed: " + response.status);
  return response.json();
}


async function clanRequest(path, options) {
  const root = apiRoot();
  if (!root) throw new Error("Cloudflare API is unavailable.");
  const response = await fetch(root + path, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...((options && options.headers) || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || ("Clan request failed: " + response.status));
  return body;
}

export function clanEmblemUrl(clanId, version) {
  if (!clanId) return "";
  const root = apiRoot();
  if (!root) return "";
  return root + "/v1/clans/" + encodeURIComponent(clanId) + "/emblem" +
    (version ? "?v=" + encodeURIComponent(version) : "");
}

export async function uploadClanEmblem(clanId, file) {
  const root = apiRoot();
  const token = getCloudAuthToken();
  if (!root) throw new Error("Cloudflare API is unavailable.");
  if (!token) throw new Error("Log in before changing the clan emblem.");
  if (!file) throw new Error("Choose an image first.");

  const response = await fetch(
    root + "/v1/clans/" + encodeURIComponent(clanId) + "/emblem",
    {
      method: "PUT",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    }
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || ("Emblem upload failed: " + response.status));
  return body;
}

export async function deleteClanEmblem(clanId) {
  const root = apiRoot();
  const token = getCloudAuthToken();
  if (!root) throw new Error("Cloudflare API is unavailable.");
  if (!token) throw new Error("Log in before changing the clan emblem.");

  const response = await fetch(
    root + "/v1/clans/" + encodeURIComponent(clanId) + "/emblem",
    {
      method: "DELETE",
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/json",
      },
    }
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || ("Emblem delete failed: " + response.status));
  return body;
}

export async function loadClans(playerId) {
  return clanRequest("/v1/clans?playerId=" + encodeURIComponent(playerId), { method: "GET" });
}

export async function createClan(playerId, name, tag, companyValue, trophies, accessToken) {
  return clanRequest("/v1/clans", {
    method: "POST",
    headers: accessToken ? { Authorization: "Bearer " + accessToken } : {},
    body: JSON.stringify({
      playerId,
      name,
      tag,
      companyValue: Number(companyValue) || 0,
      trophies: Number(trophies) || 0,
    }),
  });
}

export async function joinClan(playerId, code, companyValue, trophies) {
  return clanRequest("/v1/clans/join", {
    method: "POST",
    body: JSON.stringify({
      playerId,
      code,
      companyValue: Number(companyValue) || 0,
      trophies: Number(trophies) || 0,
    }),
  });
}

export async function joinClanById(playerId, clanId, companyValue, trophies) {
  return clanRequest("/v1/clans/join", {
    method: "POST",
    body: JSON.stringify({
      playerId,
      clanId,
      companyValue: Number(companyValue) || 0,
      trophies: Number(trophies) || 0,
    }),
  });
}

export async function leaveClan(playerId) {
  return clanRequest("/v1/clans/leave", {
    method: "POST",
    body: JSON.stringify({ playerId }),
  });
}

export async function syncClanProfile(playerId, companyValue, trophies) {
  return clanRequest("/v1/clans/profile", {
    method: "PUT",
    body: JSON.stringify({
      playerId,
      companyValue: Number(companyValue) || 0,
      trophies: Number(trophies) || 0,
    }),
  });
}
