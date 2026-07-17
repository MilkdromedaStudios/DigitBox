// Game and post HTML files are too large for Git LFS bandwidth limits, so the
// real files live in a public Cloudflare R2 bucket (free egress). A repo path
// like "public/projects/Foo.html" maps to the bucket key "projects/Foo.html".
// Set R2_PUBLIC_BASE_URL to the bucket's public URL (r2.dev or custom domain).

function getR2BaseUrl() {
  return String(process.env.R2_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
}

export function hasR2Config() {
  return Boolean(getR2BaseUrl());
}

export function r2UrlForRepoPath(filePath) {
  const base = getR2BaseUrl();
  if (!base) return null;

  const key = String(filePath).replace(/^public\//, "");
  return `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export async function fetchR2File(filePath) {
  const url = r2UrlForRepoPath(filePath);
  if (!url) return null;

  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 read failed (${res.status})`);

  return res;
}

export function isGitLfsPointer(content) {
  return (
    typeof content === "string" &&
    content.startsWith("version https://git-lfs.github.com/spec/v1") &&
    content.includes("\noid sha256:") &&
    content.includes("\nsize ")
  );
}
