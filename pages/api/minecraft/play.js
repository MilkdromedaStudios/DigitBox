// Stream the requested public, standalone HTML over DigitBox with an HTML MIME type.
// Never embed or buffer the potentially 90MB file in an API JSON response.
export const config = { runtime: "edge" };
const BASE = "https://raw.githubusercontent.com/MilkdromedaStudios/all-of-eaglercraft/main/";
export default async function handler(request) {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  const url = new URL(request.url);
  const filename = url.searchParams.get("file") || "";
  // No arbitrary URLs, parent directories, path separators, or dotfiles.
  if (!/^[a-z0-9][a-z0-9_(). -]{0,240}\.html$/i.test(filename) || filename.includes("..")) return new Response("Invalid game file name.", { status: 400 });
  try {
    const upstream = await fetch(BASE + encodeURIComponent(filename), { method: request.method, redirect: "follow", cf: { cacheTtl: 3600, cacheEverything: true } });
    if (upstream.status === 404) return new Response("Game not found in the public repository.", { status: 404 });
    if (!upstream.ok) return new Response("GitHub could not serve this game (HTTP " + upstream.status + ").", { status: 502 });
    const headers = new Headers({
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": "inline",
      "Cache-Control": "public, max-age=600, s-maxage=3600",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    });
    const len = upstream.headers.get("Content-Length");
    if (len) headers.set("Content-Length", len);
    return new Response(request.method === "HEAD" ? null : upstream.body, { status: 200, headers });
  } catch (_) {
    return new Response("Could not stream this game from GitHub. Try again.", { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
