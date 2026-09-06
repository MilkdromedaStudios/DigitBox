import { deepforgeApiRoot, getCloudAuthToken } from "./cloudSync";

async function combatRequest(method, body) {
  const root = deepforgeApiRoot();
  const token = getCloudAuthToken();
  if (!token) throw new Error("Log in to use combat.");
  const response = await fetch(root + "/api/deepforge/combat", {
    method,
    headers: {
      Accept: "application/json",
      Authorization: "Bearer " + token,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || ("Combat request failed: " + response.status));
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export function loadCombatStatus() {
  return combatRequest("GET");
}

export function attackPlayer(targetId) {
  return combatRequest("POST", { action: "attack", targetId });
}

export function takeZombieDamage(damage) {
  return combatRequest("POST", { action: "zombieDamage", damage });
}
