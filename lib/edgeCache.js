// digitbox/lib/edgeCache.js
//
// JSON cache for edge API routes, on top of the Workers Cache API
// (Cloudflare). Each entry remembers when it was fetched, so a value is served
// as-is while fresh and kept as a fallback for when the upstream fails.
// Cloudflare doesn't cache function responses from Cache-Control alone, so
// without this every visitor would hit the upstream API. Where there is no
// Cache API (e.g. Vercel's edge runtime) every call goes upstream.

const KEY_PREFIX = "https://digitbox.dev/__cache/";
// How long a stale copy is kept around to fall back on.
const KEEP_SECONDS = 3 * 24 * 60 * 60;

const inflight = new Map();

function cacheStore() {
  try {
    return globalThis.caches && globalThis.caches.default ? globalThis.caches.default : null;
  } catch {
    return null;
  }
}

async function readEntry(url) {
  try {
    const hit = await cacheStore()?.match(url);
    const entry = hit ? await hit.json() : null;
    return entry && typeof entry.fetchedAt === "number" && "value" in entry ? entry : null;
  } catch {
    return null;
  }
}

async function writeEntry(url, value) {
  try {
    await cacheStore()?.put(
      url,
      new Response(JSON.stringify({ value, fetchedAt: Date.now() }), {
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=" + KEEP_SECONDS },
      })
    );
  } catch {
    /* caching is best-effort */
  }
}

// Resolve to loader()'s value, cached under `key` for `freshMs`. When the
// loader throws, the last good value is returned instead (if there is one);
// otherwise the error propagates. Loaders throw for results not worth caching.
export async function cachedJson(key, freshMs, loader) {
  const url = KEY_PREFIX + encodeURIComponent(key);
  const cached = await readEntry(url);
  if (cached && Date.now() - cached.fetchedAt < freshMs) return cached.value;

  // Concurrent misses in one isolate share a single upstream call.
  if (!inflight.has(url)) {
    inflight.set(
      url,
      (async () => {
        try {
          const value = await loader();
          await writeEntry(url, value);
          return value;
        } finally {
          inflight.delete(url);
        }
      })()
    );
  }

  try {
    return await inflight.get(url);
  } catch (error) {
    if (cached) return cached.value;
    throw error;
  }
}
