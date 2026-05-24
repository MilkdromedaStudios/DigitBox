const GITHUB_API = "https://api.github.com";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
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

async function listDirectory(path, type) {
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

        return {
          name: item.name,
          title: toDisplayTitle(base),
          slug: base,
          path: item.path,
          download_url: item.download_url,
          excerpt,
        };
      })
    );

    return posts.sort((a, b) => a.title.localeCompare(b.title));
  }

  return htmlFiles
    .map((item) => {
      const base = item.name.replace(/\.html$/i, "");
      return {
        name: item.name,
        title: base,
        slug: base,
        path: item.path,
        download_url: item.download_url,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { type } = req.query;
    if (!["project", "post"].includes(type)) return res.status(400).json({ error: "Invalid type" });

    const path = type === "project" ? "public/projects" : "public/posts";
    const items = await listDirectory(path, type);
    return res.status(200).json({ items });
  } catch (error) {
    return res.status(500).json({ error: error.message || "List failed" });
  }
}
