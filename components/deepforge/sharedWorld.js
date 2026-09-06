import { deepforgeApiRoot, getCloudAuthToken } from "./cloudSync";

async function worldRequest(method, body) {
  const root = deepforgeApiRoot();
  const token = getCloudAuthToken();
  const response = await fetch(root + "/api/deepforge/shared-world", {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || ("Shared world request failed: " + response.status));
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export function loadSharedWorld() {
  return worldRequest("GET");
}

export function submitSharedDigs(digs) {
  return worldRequest("POST", { digs: Array.isArray(digs) ? digs : [] });
}
