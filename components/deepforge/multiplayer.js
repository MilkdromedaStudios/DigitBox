import { getCloudAuthToken } from "./cloudSync";

async function requestMultiplayer(method, body) {
  const token = getCloudAuthToken();
  if (!token) throw new Error("Log in to use multiplayer.");
  const response = await fetch("/api/deepforge/multiplayer", {
    method,
    headers: {
      Accept: "application/json",
      Authorization: "Bearer " + token,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || ("Multiplayer request failed: " + response.status));
  return payload;
}

export function loadMultiplayerWorld() {
  return requestMultiplayer("GET");
}

export function syncMultiplayerPresence(position) {
  return requestMultiplayer("POST", position || {});
}

export function leaveMultiplayerWorld() {
  return requestMultiplayer("DELETE").catch(() => null);
}
