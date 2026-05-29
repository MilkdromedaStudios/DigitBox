export const GITHUB_API = "https://api.github.com";

export function hasGithubReadConfig() {
  return Boolean(process.env.GITHUB_REPO_OWNER && process.env.GITHUB_REPO_NAME);
}

export function githubReadHeaders() {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  return headers;
}

export function isGitLfsPointer(content) {
  return (
    typeof content === "string" &&
    content.startsWith("version https://git-lfs.github.com/spec/v1") &&
    content.includes("\noid sha256:") &&
    content.includes("\nsize ")
  );
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

export async function readGithubFile(filePath) {
  if (!hasGithubReadConfig()) return null;

  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;
  const branch = process.env.GITHUB_REPO_BRANCH || "main";

  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${filePath.split("/").map(encodeURIComponent).join("/")}?ref=${branch}`,
    { headers: githubReadHeaders() }
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

  const content = Buffer.from(file.content || "", "base64").toString("utf8");
  if (isGitLfsPointer(content)) {
    throw new Error("Git LFS content is still a pointer. Run git lfs pull during the build so the real project file is available locally.");
  }

  return content;
}
