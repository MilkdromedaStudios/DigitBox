// Public Eaglercraft repository. Index only, no game bytes loaded into memory.
export const config = { runtime: "edge" };
const URL = "https://api.github.com/repos/MilkdromedaStudios/all-of-eaglercraft/git/trees/main?recursive=1";
export default async function handler(request) {
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET" } });
  try {
    const upstream = await fetch(URL, { headers: { Accept: "application/vnd.github+json" }, cf: { cacheTtl: 600, cacheEverything: true } });
    if (!upstream.ok) throw new Error("GitHub catalog unavailable (HTTP " + upstream.status + "). Try again shortly.");
    const result = await upstream.json();
    if (!Array.isArray(result.tree)) throw new Error("GitHub returned an invalid file list.");
    const files = result.tree.filter((entry) => entry.type === "blob" && /^[^/\\]+\.html$/i.test(entry.path)).map((entry) => ({ name: entry.path, size: entry.size || 0 }));
    return new Response(JSON.stringify({ files, count: files.length, truncated: Boolean(result.truncated), source: "MilkdromedaStudios/all-of-eaglercraft" }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=60, s-maxage=600", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || "Cannot load repository" }), { status: 502, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }
}
