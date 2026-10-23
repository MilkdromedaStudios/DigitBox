import worker from "../../src/index.js";

// Keep Pages Functions and Next's rewritten API on the same security checks.
export async function onRequest({ request, env }) {
  try {
    return await worker.fetch(request, env);
  } catch (_) {
    return new Response(JSON.stringify({ error: "Account service unavailable. Please try again." }), {
      status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
}
