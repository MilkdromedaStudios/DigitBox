// digitbox/lib/edgeCache.js
//
// JSON cache for edge API routes, on top of the Workers Cache API
// (Cloudflare). Each entry remembers when it was fetched, so a value is served
// as-is while fresh and kept as a fallback for when the upstream fails.
// Cloudflare doesn't cache function responses from Cache-Control alone, so
// without this every visitor would hit the upstream API. Where there is no
// Cache API (e.g. Vercel's edge runtime) every call goes upstream.
//
// Promises are deliberately not shared between requests: on Workers, work
// started by one request can be cancelled when that client disconnects.

const KEY_PREFIX = "https://digitbox.dev/__cache/";
// How long a copy is kept around to fall back on, counted from when it was
// fetched. YouTube's API policies require refreshing stored data well within
// 30 days, so an old copy is never kept alive past this.
const KEEP_SECONDS = 3 * 24 * 60 * 60;
const KEEP_MS = KEEP_SECONDS * 1000;
// After a failed refresh, wait this long before calling the upstream again,
// so an outage or an exhausted quota isn't retried on every request.
const RETRY_AFTER_MS = 5 * 60 * 1000;

// Whether values actually persist between requests here (false on Vercel).
export function hasCacheApi() {
  return Boolean(cacheStore());
}

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
    if (!entry || typeof entry.fetchedAt !== "number") return null;
    // Drop a value past its keep time even if the cache still has it.
    if ("value" in entry && Date.now() - entry.fetchedAt >= KEEP_MS) return null;
    return entry;
  } catch {
    return null;
  }
}

// Kept until `fetchedAt + KEEP_SECONDS` (failure markers just until retryAt).
async function writeEntry(url, entry) {
  const until = "value" in entry ? entry.fetchedAt + KEEP_MS : entry.retryAt;
  const maxAge = Math.max(1, Math.ceil((until - Date.now()) / 1000));
  try {
    await cacheStore()?.put(
      url,
      new Response(JSON.stringify(entry), {
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=" + maxAge },
      })
    );
  } catch {
    /* caching is best-effort */
  }
}

// The key may hold user text (a search); a malformed string must not throw.
function cacheUrl(key) {
  try {
    return KEY_PREFIX + encodeURIComponent(key);
  } catch {
    return KEY_PREFIX + encodeURIComponent(String(key).replace(/[\uD800-\uDFFF]/g, ""));
  }
}

// Resolve to loader()'s value, cached under `key` for `freshMs`. When the
// loader throws, the last good value is returned instead (if there is one);
// otherwise the error propagates. Either way the upstream isn't retried for
// RETRY_AFTER_MS. Loaders throw for results not worth caching.
export async function cachedJson(key, freshMs, loader) {
  const url = cacheUrl(key);
  const entry = await readEntry(url);
  const now = Date.now();
  if (entry && "value" in entry && now - entry.fetchedAt < freshMs) return entry.value;
  if (entry && entry.retryAt > now) {
    if ("value" in entry) return entry.value;
    const failure = new Error(entry.error || "unavailable");
    failure.reason = entry.error || "unavailable";
    throw failure;
  }

  try {
    const value = await loader();
    await writeEntry(url, { value, fetchedAt: Date.now() });
    return value;
  } catch (error) {
    const retryAt = Date.now() + RETRY_AFTER_MS;
    if (entry && "value" in entry) {
      await writeEntry(url, { value: entry.value, fetchedAt: entry.fetchedAt, retryAt });
      return entry.value;
    }
    await writeEntry(url, { error: (error && (error.reason || error.message)) || "unavailable", fetchedAt: 0, retryAt });
    throw error;
  }
}
