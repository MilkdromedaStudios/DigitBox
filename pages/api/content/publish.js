import { upsertRepoFile } from "../../../lib/githubContent";
import postsIndex from "../../../data/posts-index.json";
import projectsIndex from "../../../data/projects-index.json";

function slugify(input) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { type, title, html, markdown } = req.body || {};
    if (!["project", "post"].includes(type)) return res.status(400).json({ error: "Invalid type" });
    if (!title || !html) return res.status(400).json({ error: "title and html are required" });

    const slug = slugify(title) || `${type}-${Date.now()}`;
    const dir = type === "project" ? "public/projects" : "public/posts";
    const htmlPath = `${dir}/${slug}.html`;

    await upsertRepoFile({ path: htmlPath, content: html, message: `Publish ${type}: ${title}` });

    if (markdown && type === "post") {
      await upsertRepoFile({
        path: `public/posts/${slug}.md`,
        content: markdown,
        message: `Store markdown source for post: ${title}`,
      });
    }

    if (type === "project") {
      const updatedProjects = Array.from(new Set([title, ...projectsIndex]));
      await upsertRepoFile({
        path: "data/projects-index.json",
        content: `${JSON.stringify(updatedProjects, null, 2)}\n`,
        message: `Update projects index for: ${title}`,
      });
    }

    if (type === "post") {
      const nextPost = {
        slug,
        title,
        excerpt: String(markdown || "").replace(/\s+/g, " ").trim().slice(0, 220),
      };
      const filtered = postsIndex.filter((post) => post.slug !== slug);
      const updatedPosts = [nextPost, ...filtered];

      await upsertRepoFile({
        path: "data/posts-index.json",
        content: `${JSON.stringify(updatedPosts, null, 2)}\n`,
        message: `Update posts index for: ${title}`,
      });
    }

    return res.status(200).json({ ok: true, slug, htmlPath });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Publish failed" });
  }
}
