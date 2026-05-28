const GITHUB_API = "https://api.github.com";
import fs from "fs/promises";
import path from "path";
import projectsIndex from "../../../data/projects-index.json";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function hasGithubConfig() {
  return Boolean(
    process.env.GITHUB_TOKEN &&
    process.env.GITHUB_REPO_OWNER &&
    process.env.GITHUB_REPO_NAME
  );
}

function authHeaders() {
  return {
    Authorization: `Bearer ${required("GITHUB_TOKEN")}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function toDisplayTitle(slug) {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function toExcerpt(text, maxLength = 220) {
  const normalized = text
    .replace(/<[^>]*>/g, " ")
    .replace(/[#*_`>\[\]\(\)!-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

async function fetchPostExcerpt(owner, repo, branch, path) {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${branch}`,
    { headers: authHeaders() }
  );

  if (!res.ok) return "";
  const file = await res.json();
  const content = Buffer.from(file.content || "", "base64").toString("utf8");
  return toExcerpt(content);
}

async function fetchLastUpdatedAt(owner, repo, branch, filePath) {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/commits?path=${encodeURIComponent(filePath)}&sha=${encodeURIComponent(branch)}&per_page=1`,
    { headers: authHeaders() }
  );

  if (!res.ok) return null;
  const commits = await res.json();
  const commit = Array.isArray(commits) ? commits[0] : null;
  return commit?.commit?.author?.date || commit?.commit?.committer?.date || null;
}

async function listDirectory(path, type) {
  if (!hasGithubConfig()) {
    return listDirectoryFromLocalFs(path, type);
  }

  const owner = required("GITHUB_REPO_OWNER");
  const repo = required("GITHUB_REPO_NAME");
  const branch = process.env.GITHUB_REPO_BRANCH || "main";

  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${branch}`,
    { headers: authHeaders() }
  );

  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`GitHub list failed (${res.status})`);

  const data = await res.json();
  const htmlFiles = (Array.isArray(data) ? data : []).filter((item) => item.type === "file" && item.name.endsWith(".html"));

  if (type === "post") {
    const posts = await Promise.all(
      htmlFiles.map(async (item) => {
        const base = item.name.replace(/\.html$/i, "");
        const markdownPath = `public/posts/${base}.md`;
        const excerpt = await fetchPostExcerpt(owner, repo, branch, markdownPath);
        const updated_at = await fetchLastUpdatedAt(owner, repo, branch, item.path);

        return {
          name: item.name,
          title: toDisplayTitle(base),
          slug: base,
          path: item.path,
          download_url: `/api/content/file?path=${encodeURIComponent(item.path)}`,
          excerpt,
          updated_at,
        };
      })
    );

    return posts.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
  }

  const projects = await Promise.all(
    htmlFiles.map(async (item) => {
      const base = item.name.replace(/\.html$/i, "");
      const updated_at = await fetchLastUpdatedAt(owner, repo, branch, item.path);

      return {
        name: item.name,
        title: base,
        slug: base,
        path: item.path,
        download_url: `/api/content/file?path=${encodeURIComponent(item.path)}`,
        updated_at,
      };
    })
  );

  return projects.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
}

async function listDirectoryFromLocalFs(dirPath, type) {
  if (type === "project") {
    return projectsIndex.map((name) => ({
      name: `${name}.html`,
      title: name,
      slug: name,
      path: `public/projects/${name}.html`,
      download_url: `/api/content/file?path=${encodeURIComponent(`public/projects/${name}.html`)}`,
      updated_at: null,
    }));
  }

  const absoluteDir = path.join(process.cwd(), dirPath);

  let entries = [];
  try {
    entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  const htmlFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".html"));

  const posts = await Promise.all(
    htmlFiles.map(async (entry) => {
      const base = entry.name.replace(/\.html$/i, "");
      const htmlPath = path.join(absoluteDir, entry.name);
      const markdownPath = path.join(process.cwd(), "public", "posts", `${base}.md`);
      const [htmlStat, markdownContent] = await Promise.all([
        fs.stat(htmlPath),
        fs.readFile(markdownPath, "utf8").catch(() => ""),
      ]);

      return {
        name: entry.name,
        title: toDisplayTitle(base),
        slug: base,
        path: `${dirPath}/${entry.name}`,
        download_url: `/api/content/file?path=${encodeURIComponent(`${dirPath}/${entry.name}`)}`,
        excerpt: toExcerpt(markdownContent),
        updated_at: htmlStat.mtime.toISOString(),
      };
    })
  );

  return posts.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { type } = req.query;
    if (!["project", "post"].includes(type)) return res.status(400).json({ error: "Invalid type" });

    const items = await listDirectory(type === "project" ? "public/projects" : "public/posts", type);
    const limit = Number(req.query.limit || 0);
    const limitedItems = Number.isFinite(limit) && limit > 0 ? items.slice(0, limit) : items;
    return res.status(200).json({ items: limitedItems });
  } catch (error) {
    return res.status(500).json({ error: error.message || "List failed" });
  }
}
