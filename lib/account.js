// digitbox/lib/account.js
//
// DigitBox account client: sign up, log in, session, profile and avatar.
// Talks to the /v1 account backend on the Cloudflare Pages deployment, which
// owns the D1 user table.
//
// The storage key and NEXT_PUBLIC_DEEPFORGE_API variable keep their original
// names (accounts started out as DEEPFORGE accounts) so existing sessions and
// deployment settings keep working.

const CONFIGURED_API_ROOT = (process.env.NEXT_PUBLIC_DEEPFORGE_API || "").replace(/\/$/, "");
const CLOUDFLARE_PAGES_ROOT = "https://digitbox.pages.dev";

const AUTH_KEY = "digitbox-deepforge-auth-v1";
export const CLOUD_AUTH_UPDATED_EVENT = "digitbox:cloud-auth-updated";

export function accountApiRoot() {
  if (
    CONFIGURED_API_ROOT &&
    (
      /^https:\/\/(?:[a-z0-9-]+\.)?digitbox\.pages\.dev$/i.test(CONFIGURED_API_ROOT) ||
      /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(CONFIGURED_API_ROOT)
    )
  ) {
    return CONFIGURED_API_ROOT;
  }
  if (typeof window !== "undefined" && window.location) {
    const origin = String(window.location.origin || "").replace(/\/$/, "");
    const hostname = String(window.location.hostname || "").toLowerCase();
    if (
      hostname === "digitbox.pages.dev" ||
      hostname.endsWith(".digitbox.pages.dev") ||
      hostname === "localhost" ||
      hostname === "127.0.0.1"
    ) return origin;
  }
  return CLOUDFLARE_PAGES_ROOT;
}

export function getCloudAuthToken() {
  if (typeof window === "undefined") return "";
  try {
    const raw = JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
    return raw && raw.token ? String(raw.token) : "";
  } catch (_) { return ""; }
}

// Saves of games added from the admin page (components/HubProjectFrame.js).
const HUB_SAVE_PREFIX = "digitbox_hubsave_v1:";

function storeCloudAuth(payload) {
  if (typeof window === "undefined") return payload;
  if (payload && payload.token && payload.user) {
    const value = JSON.stringify({
      token: payload.token,
      user: payload.user,
      expiresAt: payload.expiresAt || 0,
    });
    try {
      localStorage.setItem(AUTH_KEY, value);
    } catch (_) {
      // Storage is full: game saves must never stop someone signing in.
      Object.keys(localStorage).filter((key) => key.startsWith(HUB_SAVE_PREFIX)).forEach((key) => localStorage.removeItem(key));
      localStorage.setItem(AUTH_KEY, value);
    }
    window.dispatchEvent(new Event(CLOUD_AUTH_UPDATED_EVENT));
  }
  return payload;
}

export function clearCloudAuth() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(AUTH_KEY);
    window.dispatchEvent(new Event(CLOUD_AUTH_UPDATED_EVENT));
  }
}

async function authRequest(path, options) {
  const response = await fetch(accountApiRoot() + path, {
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

export async function loadCloudProfile() {
  const baseUser = await loadCloudAuth();
  if (!baseUser) return null;
  const token = getCloudAuthToken();
  try {
    const response = await fetch(accountApiRoot() + "/v1/profile/me", {
      method: "GET",
      headers: { Accept: "application/json", Authorization: "Bearer " + token },
      cache: "no-store",
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return baseUser;
    return { ...baseUser, ...(body && body.user ? body.user : {}) };
  } catch (_) {
    return baseUser;
  }
}

export async function uploadCloudAvatar(file) {
  const token = getCloudAuthToken();
  if (!token) throw new Error("Log in before changing your profile picture.");
  if (!file) throw new Error("Choose an image first.");
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("Use a PNG, JPG, or WebP image.");
  }
  if (file.size > 4 * 1024 * 1024) throw new Error("Profile images must be 4 MB or smaller.");
  const response = await fetch(accountApiRoot() + "/v1/profile/avatar", {
    method: "PUT",
    headers: { Authorization: "Bearer " + token, "Content-Type": file.type },
    body: file,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || ("Avatar upload failed: " + response.status));
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CLOUD_AUTH_UPDATED_EVENT));
  return body;
}

export async function deleteCloudAvatar() {
  const token = getCloudAuthToken();
  if (!token) throw new Error("Log in before changing your profile picture.");
  const response = await fetch(accountApiRoot() + "/v1/profile/avatar", {
    method: "DELETE",
    headers: { Authorization: "Bearer " + token, Accept: "application/json" },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || ("Avatar delete failed: " + response.status));
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CLOUD_AUTH_UPDATED_EVENT));
  return body;
}
