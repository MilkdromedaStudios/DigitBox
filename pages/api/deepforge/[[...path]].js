import deepforgeWorker from "../../../cloudflare/deepforge-worker/src/index.js";

export const config = {
  runtime: "edge",
};

export default async function handler(request) {
  const incoming = new URL(request.url);
  const prefix = "/api/deepforge";

  if (!incoming.pathname.startsWith(prefix)) {
    return new Response(JSON.stringify({ error: "Invalid DEEPFORGE API route." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  incoming.pathname = incoming.pathname.slice(prefix.length) || "/";

  // @cloudflare/next-on-pages exposes Pages environment variables and
  // bindings to Edge API handlers through process.env. The DEEPFORGE worker
  // also auto-detects D1/R2 binding objects, so their dashboard variable
  // names do not have to be hard-coded here.
  const env = process.env;
  const forwarded = new Request(incoming.toString(), request);

  return deepforgeWorker.fetch(forwarded, env);
}
