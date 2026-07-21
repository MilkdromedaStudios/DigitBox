import { chatCompletion, getAiConfig } from "../../../../lib/ai";

export const config = { runtime: "edge" };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });
}

// Pull the free-text prompt out of the path after ".../request/…".
function promptFromPath(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  const idx = parts.lastIndexOf("request");
  if (idx === -1 || idx === parts.length - 1) return "";
  try {
    return parts
      .slice(idx + 1)
      .map((p) => decodeURIComponent(p))
      .join(" ");
  } catch {
    return "";
  }
}

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(req.url);
  const cfg = getAiConfig();

  // A tiny bit of self-documentation for a bare GET with no prompt.
  const wantsInfo = url.searchParams.get("info") === "1";

  let messages = null;
  let single = "";
  let temperature = 0.7;
  let maxTokens = 800;

  if (req.method === "GET") {
    single =
      url.searchParams.get("message") ||
      url.searchParams.get("q") ||
      url.searchParams.get("prompt") ||
      promptFromPath(url.pathname) ||
      "";
  } else if (req.method === "POST") {
    let body = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    if (Array.isArray(body.messages)) messages = body.messages;
    single = body.message || body.prompt || single;
    if (typeof body.temperature === "number") temperature = body.temperature;
    if (typeof body.max_tokens === "number") maxTokens = body.max_tokens;
  } else {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  if (wantsInfo || (!messages && !single)) {
    return json({
      ok: true,
      name: "Digitbox AI",
      configured: cfg.enabled,
      model: cfg.enabled ? cfg.model : null,
      usage: {
        get: "/api/ai/request?message=Hello  (also /ai/api/request/Hello)",
        post: "POST /api/ai/request  body: { \"message\": \"Hello\" }  or  { \"messages\": [{\"role\":\"user\",\"content\":\"Hi\"}] }",
      },
    });
  }

  try {
    const input = messages || single;
    const { reply, model } = await chatCompletion(input, { temperature, maxTokens });
    return json({ ok: true, reply, model });
  } catch (err) {
    const status = err && err.status ? err.status : 500;
    const message = (err && err.message) || "Digitbox AI request failed.";
    return json({ ok: false, error: message }, status);
  }
}
