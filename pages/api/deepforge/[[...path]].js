import deepforgeWorker from "../../../cloudflare/deepforge-worker/src/index.js";
import { onRequest as billingWorker } from "../../../functions/v1/billing/[[path]].js";
import { onRequest as profileWorker } from "../../../functions/v1/profile/[[path]].js";

export const config = { runtime: "edge" };

export default async function handler(request) {
  const incoming = new URL(request.url);
  const prefix = "/api/deepforge";
  if (incoming.pathname.startsWith(prefix + "/")) incoming.pathname = incoming.pathname.slice(prefix.length);
  else if (!incoming.pathname.startsWith("/v1/")) return new Response("Not found", { status: 404 });
  const forwarded = new Request(incoming.toString(), request);
  const env = process.env;
  try {
    if (incoming.pathname.startsWith("/v1/billing/")) return await billingWorker({ request: forwarded, env });
    if (incoming.pathname.startsWith("/v1/profile/")) return await profileWorker({ request: forwarded, env });
    return await deepforgeWorker.fetch(forwarded, env);
  } catch (_) {
    return new Response(JSON.stringify({ error: "Account service unavailable. Please try again." }), {
      status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
}
