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
