import { jsonResponse } from "../../../lib/apiResponse";
import { getContentBucket, toR2Key, r2PublicUrlForKey } from "../../../lib/r2";
import { isGitLfsPointer } from "../../../lib/r2Content";
import { fetchGithubReleaseAsset } from "../../../lib/githubAssets";
import { getGithubRepo } from "../../../lib/githubRepo";

export const config = { runtime: "edge" };


const EAGLERCRAFT_LAUNCHER_HTML = "<!doctype html>\n<html lang=\"en\">\n<head><meta charset=\"utf-8\" /><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" /><title>Eaglercraft Launcher</title>\n<style>:root{color-scheme:dark;--bg:#080b12;--line:#26324a;--text:#eef4ff;--muted:#a8b3c7;--accent:#6ee7ff}*{box-sizing:border-box}body{margin:0;min-height:100vh;font-family:Arial,sans-serif;color:var(--text);background:radial-gradient(circle at top,#1a3152,var(--bg) 48rem)}main{width:min(1120px,calc(100% - 32px));margin:0 auto;padding:42px 0}.hero,.card{border:1px solid var(--line);background:rgba(19,26,40,.86);box-shadow:0 24px 90px rgba(0,0,0,.25)}.hero{display:grid;gap:18px;justify-items:center;text-align:center;padding:36px 18px;border-radius:28px}.logo{width:min(420px,82vw);height:auto}h1{margin:0;font-size:clamp(2rem,6vw,4.5rem);letter-spacing:-.05em}p{color:var(--muted);line-height:1.6;margin:0}.actions{display:flex;flex-wrap:wrap;gap:12px;justify-content:center}.button{color:#041018;background:var(--accent);border-radius:999px;padding:12px 18px;text-decoration:none;font-weight:800}.button.secondary{color:var(--text);background:#202b40;border:1px solid var(--line)}section{margin-top:30px}h2{margin:0 0 14px;font-size:clamp(1.5rem,3vw,2.2rem)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}.card{display:flex;gap:14px;align-items:center;padding:16px;min-height:104px;color:inherit;text-decoration:none;border-radius:20px}.card:hover{border-color:var(--accent)}.card img{width:54px;height:54px;object-fit:contain;image-rendering:pixelated}.card h3{margin:0 0 4px;font-size:1rem}small{color:var(--muted)}.notice{margin-top:18px;padding:14px 16px;border:1px solid #4a3b1d;border-radius:16px;color:#ffe7aa;background:#241b0b}</style></head>\n<body><main><div class=\"hero\"><img class=\"logo\" src=\"./assets/images/logo.png\" alt=\"Eaglercraft Launcher\" /><h1>Eaglercraft Launcher</h1><p>Choose a bundled client, version, or resource pack. This manual launcher is configured to load files from its project folder.</p><div class=\"actions\"><a class=\"button\" href=\"./mc/1.12.2/\">Play latest release</a><a class=\"button secondary\" href=\"./settings.html\">Settings</a><a class=\"button secondary\" href=\"./credits.html\">Credits</a></div></div><div id=\"status\" class=\"notice\">Loading launcher entries\u2026</div><section id=\"catalog\"></section></main>\n<script>\nconst groups=[[\"Base Versions\",\"./assets/json/base.json\"],[\"Modded Clients\",\"./assets/json/modded.json\"],[\"Assisted Play\",\"./assets/json/assisted.json\"],[\"Packs\",\"./assets/json/packs.json\"]];\nconst catalog=document.getElementById(\"catalog\"),status=document.getElementById(\"status\");\nfunction cardFor(item){const card=document.createElement(\"a\");card.className=\"card\";card.href=item.link;if(/\\.zip($|\\?)/i.test(item.link))card.download=\"\";card.innerHTML='<img src=\"'+item.icon+'\" alt=\"\" loading=\"lazy\" /><span><h3>'+item.title+'</h3><small>'+(item.version||\"Ready\")+'</small></span>';return card;}\nasync function loadGroup(group){const title=group[0],url=group[1],response=await fetch(url);if(!response.ok)throw new Error(title+\" failed to load\");const items=(await response.json()).filter((item)=>item.active!==false);const section=document.createElement(\"section\");section.innerHTML=\"<h2>\"+title+\"</h2>\";const grid=document.createElement(\"div\");grid.className=\"grid\";items.forEach((item)=>grid.appendChild(cardFor(item)));section.appendChild(grid);catalog.appendChild(section);}\nPromise.all(groups.map(loadGroup)).then(()=>status.remove()).catch((error)=>{status.textContent=\"Launcher setup error: \"+error.message;});\n</script></body></html>";

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

    if (filePath === "public/projects/Eaglercraft-Launcher-main/index.html") {
      return fileResponse(EAGLERCRAFT_LAUNCHER_HTML, filePath);
    }

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
