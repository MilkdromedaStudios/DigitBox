export const config = { runtime: "edge" };

const HOUR_MS = 60 * 60 * 1000;

function findBucket(rawEnv) {
  if (rawEnv && rawEnv.BUCKET && typeof rawEnv.BUCKET.get === "function" && typeof rawEnv.BUCKET.put === "function") {
    return rawEnv.BUCKET;
  }
  for (const value of Object.values(rawEnv || {})) {
    if (value && typeof value.get === "function" && typeof value.put === "function" && typeof value.delete === "function" && typeof value.prepare !== "function") {
      return value;
    }
  }
  return null;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
    },
  });
}

function hourMeta(now = Date.now()) {
  const hourKey = Math.floor(now / HOUR_MS);
  return {
    hourKey,
    resetAt: (hourKey + 1) * HOUR_MS,
    key: "world/hour-" + hourKey + ".json",
  };
}

export default async function handler(request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: json({}).headers });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const BUCKET = findBucket(process.env);
  const meta = hourMeta();
  if (!BUCKET) {
    return json({
      ok: false,
      r2: false,
      error: "Cloudflare R2 bucket binding is not available.",
      hourKey: meta.hourKey,
      resetAt: meta.resetAt,
    }, 503);
  }

  const existing = await BUCKET.get(meta.key);
  if (existing) {
    return json({
      ok: true,
      r2: true,
      initialized: false,
      alreadyExists: true,
      hourKey: meta.hourKey,
      resetAt: meta.resetAt,
      key: meta.key,
    });
  }

  const blankWorld = JSON.stringify({ cuts: {}, mined: {} });
  const stored = await BUCKET.put(meta.key, blankWorld, {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: "application/json", cacheControl: "no-store" },
    customMetadata: {
      hourKey: String(meta.hourKey),
      initializedAt: String(Date.now()),
      initializedBy: "github-hourly-reset",
    },
  });

  return json({
    ok: true,
    r2: true,
    initialized: Boolean(stored),
    alreadyExists: !stored,
    hourKey: meta.hourKey,
    resetAt: meta.resetAt,
    key: meta.key,
  });
}
