export const config = { runtime: "edge" };

const OWNER = "MilkdromedaStudios";
const REPO = "DigitBox";
const BRANCH = "main";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function contentType(path, upstream) {
  const type = String(upstream || "").split(";")[0].trim();
  if (type && type !== "application/octet-stream" && type !== "text/plain") return upstream;
  const p = String(path || "").toLowerCase();
  if (p.endsWith(".html")) return "text/html; charset=utf-8";
  if (p.endsWith(".js") || p.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (p.endsWith(".css")) return "text/css; charset=utf-8";
  if (p.endsWith(".json")) return "application/json; charset=utf-8";
  if (p.endsWith(".wasm")) return "application/wasm";
  if (p.endsWith(".zip")) return "application/zip";
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
  if (p.endsWith(".webp")) return "image/webp";
  if (p.endsWith(".svg")) return "image/svg+xml";
  if (p.endsWith(".epk") || p.endsWith(".epw") || p.endsWith(".mc")) return "application/octet-stream";
  return upstream || "application/octet-stream";
}

function requestedRepoPath(url) {
  const prefix = "/api/project-file/";
  if (!url.pathname.startsWith(prefix)) return "";
  const raw = url.pathname.slice(prefix.length);
  const parts = raw.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  if (!parts.length || parts.some((part) => part === "." || part === ".." || part.includes("\\") || part.includes("\0"))) {
    return "";
  }
  return "public/projects/" + parts.join("/");
}

export default async function handler(request) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return json({ error: "Method not allowed" }, 405);
  }

  const url = new URL(request.url);
  const repoPath = requestedRepoPath(url);
  if (!repoPath) return json({ error: "Invalid project path" }, 400);

  const encodedPath = repoPath.split("/").map(encodeURIComponent).join("/");
  const upstreamUrl =
    "https://media.githubusercontent.com/media/" +
    OWNER + "/" + REPO + "/" + encodeURIComponent(BRANCH) + "/" + encodedPath;

  const headers = new Headers({ Accept: "*/*" });
  for (const name of ["Range", "If-None-Match", "If-Modified-Since"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  let upstream = await fetch(upstreamUrl, {
    method: request.method,
    headers,
    redirect: "follow",
  });

  // media.githubusercontent.com is ideal for Git LFS objects, but ordinary
  // Git-tracked files (such as our launcher HTML) can return 404 there.
  // Fall back to raw.githubusercontent.com for those normal repository files.
  if (upstream.status === 404) {
    const rawUrl =
      "https://raw.githubusercontent.com/" +
      OWNER + "/" + REPO + "/" + encodeURIComponent(BRANCH) + "/" + encodedPath;
    upstream = await fetch(rawUrl, {
      method: request.method,
      headers,
      redirect: "follow",
    });
  }

  if (upstream.status === 404) return json({ error: "Project file not found", path: repoPath }, 404);

  const responseHeaders = new Headers();
  for (const name of ["content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  responseHeaders.set("Content-Type", contentType(repoPath, upstream.headers.get("Content-Type")));
  responseHeaders.set("Cache-Control", "public, max-age=3600, s-maxage=86400");

  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
