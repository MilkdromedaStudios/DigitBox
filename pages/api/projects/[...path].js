import { jsonResponse } from "../../../lib/apiResponse";
import { getContentBucket, toR2Key, r2PublicUrlForKey } from "../../../lib/r2";
import { isGitLfsPointer } from "../../../lib/r2Content";
import { fetchGithubReleaseAsset } from "../../../lib/githubAssets";
import { getGithubRepo } from "../../../lib/githubRepo";

export const config = { runtime: "edge" };


const AMPLER_UPSTREAM_BASE = "https://raw.githubusercontent.com/irv77/AmplerLauncher/main";

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".epk": "application/octet-stream",
  ".epw": "application/octet-stream",
  ".html": "text/html; charset=utf-8",
  ".jar": "application/java-archive",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mc": "application/octet-stream",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".zip": "application/zip",
};

function contentTypeForPath(filePath) {
  const match = filePath.toLowerCase().match(/\.[^.]+$/);
  return CONTENT_TYPES[match?.[0]] || "application/octet-stream";
}

function fileResponse(body, filePath, contentType) {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": contentType || contentTypeForPath(filePath),
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}

function safeProjectPath(parts, isDirectoryRequest) {
  const path = parts.map((part) => decodeURIComponent(part)).join("/");
  if (!path || path.includes("..") || path.startsWith("/") || path.includes("\\")) {
    return "";
  }

  const normalizedPath = isDirectoryRequest || !/\.[^/]+$/.test(path) ? `${path}/index.html` : path;
  return `public/projects/${normalizedPath}`;
}

async function readFromR2(filePath) {
  const key = toR2Key(filePath);
  const bucket = getContentBucket();

  if (bucket) {
    const object = await bucket.get(key);
    if (object) return fileResponse(object.body, filePath, object.httpMetadata?.contentType);
  }

  const publicUrl = r2PublicUrlForKey(key);
  if (publicUrl) {
    const res = await fetch(publicUrl);
    if (res.ok) return fileResponse(res.body, filePath, res.headers.get("Content-Type"));
    if (res.status !== 404) throw new Error(`R2 public read failed (${res.status})`);
  }

  return null;
}

function upstreamPathForProjectFile(filePath) {
  const prefix = "public/projects/Eaglercraft-Launcher-main/";
  if (!filePath.startsWith(prefix)) return "";

  const upstreamPath = filePath.slice(prefix.length);
  if (upstreamPath === "settings.html" || upstreamPath === "credits.html") return "index.html";
  return upstreamPath;
}

async function readUpstreamAmplerFile(filePath) {
  const upstreamPath = upstreamPathForProjectFile(filePath);
  if (!upstreamPath) return null;

  const res = await fetch(
    `${AMPLER_UPSTREAM_BASE}/${upstreamPath.split("/").map(encodeURIComponent).join("/")}`
  );

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Upstream launcher read failed (${res.status})`);

  return fileResponse(res.body, filePath, res.headers.get("Content-Type"));
}

async function readGithubFile(filePath) {
  const { owner, repo, branch } = getGithubRepo();
  const res = await fetch(
    `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${filePath.split("/").map(encodeURIComponent).join("/")}`,
    { headers: process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : undefined }
  );

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub read failed (${res.status})`);

  const length = Number(res.headers.get("Content-Length") || "0");
  if (!length || length >= 512) return fileResponse(res.body, filePath);

  const text = await res.text();
  if (!isGitLfsPointer(text)) return fileResponse(text, filePath);

  throw new Error(
    'This project file is stored in Git LFS and GitHub served only its pointer. Run the "Sync games to release" GitHub Action so it is served from the game-assets release.'
  );
}

export default async function handler(req) {
  if (req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const url = new URL(req.url);
    const projectPath = url.pathname.split("/api/projects/")[1] || "";
    const parts = projectPath.split("/").filter(Boolean);
    const filePath = safeProjectPath(parts, projectPath.endsWith("/"));
    if (!filePath) return jsonResponse({ error: "Invalid project path" }, 400);

    const upstreamRes = await readUpstreamAmplerFile(filePath).catch(() => null);
    if (upstreamRes) return upstreamRes;

    const r2Res = await readFromR2(filePath).catch(() => null);
    if (r2Res) return r2Res;

    const releaseRes = await fetchGithubReleaseAsset(filePath).catch(() => null);
    if (releaseRes) return fileResponse(releaseRes.body, filePath);

    const repoRes = await readGithubFile(filePath);
    if (!repoRes) return jsonResponse({ error: "File not found" }, 404);

    return repoRes;
  } catch (error) {
    return jsonResponse({ error: error.message || "Project file read failed" }, 500);
  }
}
