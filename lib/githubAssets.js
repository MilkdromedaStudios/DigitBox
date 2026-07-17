// The game HTML files are far too big for the git repo (Crystal Seeker 3D is
// over GitHub's 100 MB file limit) and Git LFS bandwidth runs out, so the real
// files are stored as assets on a GitHub Release (up to 2 GB per file, free
// downloads). Builds never touch them; they are fetched from the release at
// runtime. Upload the files with scripts/upload-games-to-github.mjs.

const GITHUB_API = "https://api.github.com";
const DEFAULT_ASSETS_TAG = "game-assets";

export function getAssetsReleaseTag() {
  return process.env.GITHUB_ASSETS_TAG || DEFAULT_ASSETS_TAG;
}

export function hasGithubAssetsConfig() {
  return Boolean(process.env.GITHUB_REPO_OWNER && process.env.GITHUB_REPO_NAME);
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
// "Appel.3D.html"), so names must be compared after the same substitution.
export function normalizeAssetName(name) {
  return String(name || "")
    .replace(/[^0-9A-Za-z_.-]/g, ".")
    .replace(/\.{2,}/g, ".")
    .toLowerCase();
}

async function findReleaseAsset(filePath) {
  if (!hasGithubAssetsConfig()) return null;

  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;
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
  const asset = await findReleaseAsset(filePath);
  if (!asset) return null;

  // Without a token the public browser_download_url is enough. With a token,
  // ask the API for the asset and follow the redirect manually: S3 rejects
  // requests that carry both the signed URL params and an Authorization
  // header, and some runtimes forward the header across the redirect.
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
