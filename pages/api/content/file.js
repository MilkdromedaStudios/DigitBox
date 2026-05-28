import fs from "fs/promises";
import path from "path";

const GITHUB_API = "https://api.github.com";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function hasGithubConfig() {
  return Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO_OWNER && process.env.GITHUB_REPO_NAME);
}

function authHeaders() {
  return {
    Authorization: `Bearer ${required("GITHUB_TOKEN")}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
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

  const res = await fetch(downloadUrl, { headers: hasGithubConfig() ? { Authorization: `Bearer ${required("GITHUB_TOKEN")}` } : undefined });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub raw file read failed (${res.status})`);

  return res.text();
}

async function readGithubFile(filePath) {
  const owner = required("GITHUB_REPO_OWNER");
  const repo = required("GITHUB_REPO_NAME");
  const branch = process.env.GITHUB_REPO_BRANCH || "main";

  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${filePath.split("/").map(encodeURIComponent).join("/")}?ref=${branch}`,
    { headers: authHeaders() }
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
    throw new Error("Git LFS content is unavailable. Configure GitHub repository environment variables so the app can fetch the real project file.");
  }

  return content;
}

async function readLocalFile(filePath) {
  const absolutePath = path.join(process.cwd(), filePath);
  try {
    const content = await fs.readFile(absolutePath, "utf8");
    if (isGitLfsPointer(content) && hasGithubConfig()) {
      return readGithubFile(filePath);
    }

    if (isGitLfsPointer(content)) {
      throw new Error("Git LFS pointer found instead of the real project file. Run git lfs pull or configure GitHub repository environment variables in production.");
    }

    return content;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
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

    const content = hasGithubConfig() ? await readGithubFile(filePath) : await readLocalFile(filePath);
    if (content == null) return res.status(404).json({ error: "File not found" });

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(content);
  } catch (error) {
    return res.status(500).json({ error: error.message || "Read failed" });
  }
}
