import postsIndex from "../../../data/posts-index.json";
import projectsIndex from "../../../data/projects-index.json";
import { decodeBase64Utf8 } from "../../../lib/base64";
import { jsonResponse } from "../../../lib/apiResponse";
import { getGithubRepo } from "../../../lib/githubRepo";

export const config = { runtime: "edge" };

const GITHUB_API = "https://api.github.com";

function githubReadHeaders() {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  return headers;
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
    { headers: githubReadHeaders() }
  );

  if (!res.ok) return "";
  const file = await res.json();
  const content = decodeBase64Utf8(file.content || "");
  return toExcerpt(content);
}

async function fetchLastUpdatedAt(owner, repo, branch, filePath) {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/commits?path=${encodeURIComponent(filePath)}&sha=${encodeURIComponent(branch)}&per_page=1`,
    { headers: githubReadHeaders() }
  );

  if (!res.ok) return null;
  const commits = await res.json();
  const commit = Array.isArray(commits) ? commits[0] : null;
  return commit?.commit?.author?.date || commit?.commit?.committer?.date || null;
}

async function listDirectory(path, type) {
  const indexedItems = listDirectoryFromIndex(path, type);
  if (indexedItems.length > 0) {
    return indexedItems;
  }

  const { owner, repo, branch } = getGithubRepo();

  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${branch}`,
    { headers: githubReadHeaders() }
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

function listDirectoryFromIndex(dirPath, type) {
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

  return postsIndex.map((post) => ({
    name: `${post.slug}.html`,
    title: post.title || toDisplayTitle(post.slug),
    slug: post.slug,
    path: `${dirPath}/${post.slug}.html`,
    download_url: `/api/content/file?path=${encodeURIComponent(`${dirPath}/${post.slug}.html`)}`,
    excerpt: post.excerpt || "",
    updated_at: null,
  }));
}

export default async function handler(req) {
  if (req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    if (!["project", "post"].includes(type)) return jsonResponse({ error: "Invalid type" }, 400);

    const items = await listDirectory(type === "project" ? "public/projects" : "public/posts", type);
    const limit = Number(searchParams.get("limit") || 0);
    const limitedItems = Number.isFinite(limit) && limit > 0 ? items.slice(0, limit) : items;
    return jsonResponse({ items: limitedItems });
  } catch (error) {
    return jsonResponse({ error: error.message || "List failed" }, 500);
  }
}
