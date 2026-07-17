// The game HTML files are far too big for the git repo (Crystal Seeker 3D is
// over GitHub's 100 MB file limit) and Git LFS bandwidth runs out, so the real
// files are stored as assets on a GitHub Release (up to 2 GB per file, free
// downloads). Builds never touch them; they are fetched from the release at
// runtime. Upload the files with scripts/upload-games-to-github.mjs.

import { getGithubRepo } from "./githubRepo";

const GITHUB_API = "https://api.github.com";
const DEFAULT_ASSETS_TAG = "game-assets";

export function getAssetsReleaseTag() {
  return process.env.GITHUB_ASSETS_TAG || DEFAULT_ASSETS_TAG;
}

function githubHeaders(extra) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...extra,
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  return headers;
}

// GitHub sanitizes uploaded asset names ("Appel 3D.html" is stored as
// "Appel.3D.html"). Reproducing that lets assets be fetched straight from the
// public download URL with no API call — unauthenticated API reads are
// rate-limited to 60/hour per IP and were failing with 403.
export function githubAssetNameForFile(name) {
  return String(name || "")
    .replace(/[^0-9A-Za-z_.-]/g, ".")
    .replace(/\.{2,}/g, ".");
}

export function normalizeAssetName(name) {
  return githubAssetNameForFile(name).toLowerCase();
}

async function findReleaseAsset(filePath) {
  const { owner, repo } = getGithubRepo();
  const tag = getAssetsReleaseTag();

  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`,
    { headers: githubHeaders() }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub release lookup failed (${res.status})`);

  const release = await res.json();
  const wanted = normalizeAssetName(String(filePath).split("/").pop());
  return (release.assets || []).find((asset) => normalizeAssetName(asset.name) === wanted) || null;
}

// Returns a Response whose body streams the asset, or null when the release
// or asset does not exist. filePath is a repo-style path like
// "public/projects/Appel 3D.html".
export async function fetchGithubReleaseAsset(filePath) {
  const { owner, repo } = getGithubRepo();
  const tag = getAssetsReleaseTag();
  const assetName = githubAssetNameForFile(String(filePath).split("/").pop());

  // The public release download URL is served by GitHub's CDN and is not
  // rate-limited like the API, so hit it directly first.
  const directRes = await fetch(
    `https://github.com/${owner}/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(assetName)}`
  );
  if (directRes.ok) return directRes;
  if (directRes.status !== 404 && directRes.status !== 403) {
    throw new Error(`GitHub release asset read failed (${directRes.status})`);
  }

  // The predicted name can be wrong for unusual characters — fall back to
  // looking the asset up through the API (authenticated when possible).
  const asset = await findReleaseAsset(filePath);
  if (!asset) return null;

  // With a token, ask the API for the asset and follow the redirect
  // manually: S3 rejects requests that carry both the signed URL params and
  // an Authorization header, and some runtimes forward the header across
  // the redirect.
  if (!process.env.GITHUB_TOKEN) {
    const res = await fetch(asset.browser_download_url);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub release asset read failed (${res.status})`);
    return res;
  }

  const apiRes = await fetch(asset.url, {
    headers: githubHeaders({ Accept: "application/octet-stream" }),
    redirect: "manual",
  });

  if (apiRes.status >= 300 && apiRes.status < 400) {
    const location = apiRes.headers.get("Location");
    if (!location) throw new Error("GitHub release asset redirect had no Location");
    const res = await fetch(location);
    if (!res.ok) throw new Error(`GitHub release asset download failed (${res.status})`);
    return res;
  }

  if (apiRes.status === 404) return null;
  if (!apiRes.ok) throw new Error(`GitHub release asset read failed (${apiRes.status})`);
  return apiRes;
}

// Removes the matching asset from the release. Returns true when an asset was
// deleted, false when there was nothing to delete or no token to do it with.
export async function deleteGithubReleaseAsset(filePath) {
  if (!process.env.GITHUB_TOKEN) return false;

  const asset = await findReleaseAsset(filePath);
  if (!asset) return false;

  const res = await fetch(asset.url, { method: "DELETE", headers: githubHeaders() });
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`GitHub release asset delete failed (${res.status})`);
  return true;
}
