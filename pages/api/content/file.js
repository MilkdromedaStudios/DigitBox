import fs from "fs/promises";
import path from "path";

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

function isGitLfsPointer(content) {
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

  const content = Buffer.from(file.content || "", "base64").toString("utf8");
  if (isGitLfsPointer(content)) {
    throw new Error("Git LFS content is still a pointer. Run git lfs pull during the build so the real project file is available locally.");
  }

  return content;
}

async function readLocalFile(filePath) {
  const absolutePath = path.join(process.cwd(), filePath);
  try {
    const content = await fs.readFile(absolutePath, "utf8");
    if (!isGitLfsPointer(content)) return content;

    const githubContent = await readGithubFile(filePath);
    if (githubContent != null) return githubContent;

    throw new Error("Git LFS pointer found instead of the real project file. Run git lfs pull during the build so the project can be viewed without a GitHub API key.");
  } catch (error) {
    if (error?.code === "ENOENT") return readGithubFile(filePath);
    throw error;
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const filePath = String(req.query.path || "").trim();
    if (!filePath.startsWith("public/projects/") && !filePath.startsWith("public/posts/")) {
      return res.status(400).json({ error: "Invalid path" });
    }

    const content = await readLocalFile(filePath);
    if (content == null) return res.status(404).json({ error: "File not found" });

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(content);
  } catch (error) {
    return res.status(500).json({ error: error.message || "Read failed" });
  }
}
