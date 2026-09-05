const API_ROOT = (process.env.NEXT_PUBLIC_DEEPFORGE_API || "").replace(/\/$/, "");
const PLAYER_KEY = "digitbox-deepforge-player-id-v1";

export function cloudEnabled() {
  return Boolean(API_ROOT);
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

export async function loadCloudSave(playerId) {
  if (!API_ROOT || !playerId) return null;
  const response = await fetch(API_ROOT + "/v1/save/" + encodeURIComponent(playerId), {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Cloud load failed: " + response.status);
  return response.json();
}

export async function saveCloudSave(playerId, payload) {
  if (!API_ROOT || !playerId) return null;
  const response = await fetch(API_ROOT + "/v1/save/" + encodeURIComponent(playerId), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("Cloud save failed: " + response.status);
  return response.json();
}


async function clanRequest(path, options) {
  if (!API_ROOT) throw new Error("Cloudflare D1 is not connected.");
  const response = await fetch(API_ROOT + path, {
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
