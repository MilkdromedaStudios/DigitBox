import { decodeBase64Utf8 } from "../../../lib/base64";
import { jsonResponse } from "../../../lib/apiResponse";
import { getContentBucket, toR2Key, r2PublicUrlForKey } from "../../../lib/r2";
import { isGitLfsPointer } from "../../../lib/r2Content";
import { fetchGithubReleaseAsset } from "../../../lib/githubAssets";
import { getGithubRepo } from "../../../lib/githubRepo";

export const config = { runtime: "edge" };

const GITHUB_API = "https://api.github.com";

function htmlResponse(body, contentType) {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": contentType || "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}

function contentTypeForPath(filePath) {
  return /\.md$/i.test(filePath) ? "text/markdown; charset=utf-8" : "text/html; charset=utf-8";
}

async function readFromR2(filePath) {
  const key = toR2Key(filePath);

  const bucket = getContentBucket();
  if (bucket) {
    const object = await bucket.get(key);
    if (object) {
      return htmlResponse(object.body, object.httpMetadata?.contentType);
    }
  }

  const publicUrl = r2PublicUrlForKey(key);
  if (publicUrl) {
    const res = await fetch(publicUrl);
    if (res.ok) {
      return htmlResponse(res.body, res.headers.get("Content-Type"));
    }
    if (res.status !== 404) {
      throw new Error(`R2 public read failed (${res.status})`);
    }
  }

  return null;
}

function optionalGithubHeaders() {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  return headers;
}

// Reads the file from the repo itself and returns a Response, or null when
// it does not exist. For Git LFS files in a public repo, download_url points
// at media.githubusercontent.com, which serves the real bytes (this spends
// LFS bandwidth, which is why the release is checked first). Games are up to
// ~100 MB, so the body is streamed rather than buffered in the edge runtime.
async function readGithubFile(filePath) {
  const { owner, repo, branch } = getGithubRepo();

  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${filePath.split("/").map(encodeURIComponent).join("/")}?ref=${branch}`,
    { headers: optionalGithubHeaders() }
  );

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub file read failed (${res.status})`);

  const file = await res.json();
  if (file.download_url) {
    const rawRes = await fetch(file.download_url, {
      headers: process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : undefined,
    });

    // A non-OK response (media reads fail when LFS bandwidth is used up)
    // falls through to the base64 path, which still covers small files.
    if (rawRes.ok) {
      const length = Number(rawRes.headers.get("Content-Length") || "0");
      // A Git LFS pointer is ~130 bytes, so only a tiny response can be one.
      if (!length || length >= 512) {
        return new Response(rawRes.body, {
          status: 200,
          headers: {
            "Content-Type": contentTypeForPath(filePath),
            // Long CDN cache to keep repeat plays off the LFS bandwidth.
            "Cache-Control": "public, max-age=3600, s-maxage=86400",
          },
        });
      }

      const text = await rawRes.text();
      if (!isGitLfsPointer(text)) return htmlResponse(text, contentTypeForPath(filePath));
    }
  }

  if (file.encoding === "base64") {
    const content = decodeBase64Utf8(file.content || "");
    if (!isGitLfsPointer(content)) return htmlResponse(content, contentTypeForPath(filePath));
  }

  throw new Error(
    'This game is stored in Git LFS and GitHub would not serve it right now (the monthly LFS bandwidth may be used up). Run the "Sync games to release" GitHub Action so it is served from the game-assets release instead (see docs/GITHUB_RELEASE_ASSETS.md).'
  );
}

export default async function handler(req) {
  if (req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const { searchParams } = new URL(req.url);
    const filePath = String(searchParams.get("path") || "").trim();
    if (!filePath.startsWith("public/projects/") && !filePath.startsWith("public/posts/")) {
      return jsonResponse({ error: "Invalid path" }, 400);
    }

    // Serve from the Cloudflare R2 bucket first when it is configured (free
    // egress, no LFS bandwidth), then from the GitHub release that holds the
    // big game files, and finally from the repo itself for small files.
    const r2Res = await readFromR2(filePath).catch(() => null);
    if (r2Res) return r2Res;

    const releaseRes = await fetchGithubReleaseAsset(filePath).catch(() => null);
    if (releaseRes) {
      return new Response(releaseRes.body, {
        status: 200,
        headers: {
          "Content-Type": contentTypeForPath(filePath),
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    const repoRes = await readGithubFile(filePath);
    if (!repoRes) return jsonResponse({ error: "File not found" }, 404);

    return repoRes;
  } catch (error) {
    return jsonResponse({ error: error.message || "Read failed" }, 500);
  }
}
