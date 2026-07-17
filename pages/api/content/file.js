import { decodeBase64Utf8 } from "../../../lib/base64";
import { jsonResponse } from "../../../lib/apiResponse";
import { fetchR2File, isGitLfsPointer } from "../../../lib/r2Content";

export const config = { runtime: "edge" };

const GITHUB_API = "https://api.github.com";

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

function hasGithubReadConfig() {
  return Boolean(process.env.GITHUB_REPO_OWNER && process.env.GITHUB_REPO_NAME);
}

async function readGithubRawFile(downloadUrl) {
  if (!downloadUrl) return null;

  const res = await fetch(downloadUrl, {
    headers: process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : undefined,
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub raw file read failed (${res.status})`);

  return res.text();
}

async function readGithubFile(filePath) {
  if (!hasGithubReadConfig()) return null;

  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;
  const branch = process.env.GITHUB_REPO_BRANCH || "main";

  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${filePath.split("/").map(encodeURIComponent).join("/")}?ref=${branch}`,
    { headers: optionalGithubHeaders() }
  );

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub file read failed (${res.status})`);

  const file = await res.json();
  if (file.download_url) {
    const rawContent = await readGithubRawFile(file.download_url);
    if (rawContent != null && !isGitLfsPointer(rawContent)) return rawContent;
  }

  if (file.encoding !== "base64") {
    throw new Error("Unsupported GitHub content encoding");
  }

  const content = decodeBase64Utf8(file.content || "");
  if (isGitLfsPointer(content)) {
    throw new Error(
      "This file is stored in Git LFS and only its pointer is on GitHub. Upload the real file to the Cloudflare R2 bucket and set R2_PUBLIC_BASE_URL (see docs/CLOUDFLARE_R2_SETUP.md)."
    );
  }

  return content;
}

export default async function handler(req) {
  if (req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const { searchParams } = new URL(req.url);
    const filePath = String(searchParams.get("path") || "").trim();
    if (!filePath.startsWith("public/projects/") && !filePath.startsWith("public/posts/")) {
      return jsonResponse({ error: "Invalid path" }, 400);
    }

    // Serve from the Cloudflare R2 bucket first (free egress, no LFS
    // bandwidth). GitHub stays as a fallback for files not uploaded to R2.
    const r2Res = await fetchR2File(filePath).catch(() => null);
    if (r2Res) {
      return new Response(r2Res.body, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    const content = await readGithubFile(filePath);
    if (content == null) return jsonResponse({ error: "File not found" }, 404);

    return new Response(content, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    return jsonResponse({ error: error.message || "Read failed" }, 500);
  }
}
