import { deepforgeApiRoot, getCloudAuthToken } from "./cloudSync";

function billingApiRoot() {
  // DigitBox's account/D1 backend lives on the Cloudflare Pages deployment.
  // The public digitbox.dev frontend is deployed separately, so Stripe runtime
  // secrets configured in Cloudflare are only visible at this API root.
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
