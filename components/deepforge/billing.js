import { deepforgeApiRoot, getCloudAuthToken } from "./cloudSync";

function billingApiRoot() {
  // Billing should prefer the exact site the user is visiting. This avoids
  // accidentally talking to a different/stale *.pages.dev deployment when
  // digitbox.dev is attached to the current Cloudflare Pages project.
  if (typeof window !== "undefined" && window.location) {
    const origin = String(window.location.origin || "").replace(/\/$/, "");
    const hostname = String(window.location.hostname || "").toLowerCase();
    if (
      hostname === "digitbox.dev" ||
      hostname === "www.digitbox.dev" ||
      hostname === "digitbox.pages.dev" ||
      hostname.endsWith(".digitbox.pages.dev") ||
      hostname === "localhost" ||
      hostname === "127.0.0.1"
    ) {
      return origin;
    }
  }
  return deepforgeApiRoot();
}

async function billingRequest(path, options = {}) {
  const token = getCloudAuthToken();
  if (!token) throw new Error("Log in to DigitBox first.");
  const root = billingApiRoot();
  const response = await fetch(root + path, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
      ...((options && options.headers) || {}),
    },
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || ("Billing request failed: " + response.status));
    error.code = body.code || "";
    error.status = response.status;
    throw error;
  }
  return body;
}

export async function loadBillingStatus() {
  return billingRequest("/v1/billing/status", { method: "GET" });
}

export async function startBillingCheckout(interval = "monthly") {
  const body = await billingRequest("/v1/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ interval: interval === "yearly" ? "yearly" : "monthly" }),
  });
  if (!body.url) throw new Error("Stripe Checkout is unavailable.");
  return body;
}

export async function openBillingPortal() {
  const body = await billingRequest("/v1/billing/portal", {
    method: "POST",
    body: "{}",
  });
  if (!body.url) throw new Error("Stripe billing portal is unavailable.");
  return body;
}
