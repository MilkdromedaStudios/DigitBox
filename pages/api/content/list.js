import projectsIndex from "../../../data/projects-index.json";
import postsIndex from "../../../data/posts-index.json";

function projectItems() {
  return projectsIndex.map((name) => ({
    name: `${name}.html`,
    title: name,
    slug: name,
    path: `public/projects/${name}.html`,
    download_url: `/api/content/file?path=${encodeURIComponent(`public/projects/${name}.html`)}`,
    updated_at: null,
  }));
}

function postItems() {
  return postsIndex.map((post) => ({
    name: `${post.slug}.html`,
    title: post.title,
    slug: post.slug,
    path: `public/posts/${post.slug}.html`,
    download_url: `/api/content/file?path=${encodeURIComponent(`public/posts/${post.slug}.html`)}`,
    excerpt: post.excerpt || "",
    updated_at: null,
  }));
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { type } = req.query;
    if (!["project", "post"].includes(type)) return res.status(400).json({ error: "Invalid type" });

    const items = type === "project" ? projectItems() : postItems();
    const limit = Number(req.query.limit || 0);
    const limitedItems = Number.isFinite(limit) && limit > 0 ? items.slice(0, limit) : items;
    return res.status(200).json({ items: limitedItems });
  } catch (error) {
    return res.status(500).json({ error: error.message || "List failed" });
  }
}
