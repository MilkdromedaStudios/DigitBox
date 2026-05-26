import { deleteRepoFile } from "../../../lib/githubContent";
import { upsertRepoFile } from "../../../lib/githubContent";
import postsIndex from "../../../data/posts-index.json";
import projectsIndex from "../../../data/projects-index.json";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { type, slug } = req.body || {};
    if (!type || !slug) return res.status(400).json({ error: "type and slug are required" });
    if (!["project", "post"].includes(type)) return res.status(400).json({ error: "Invalid type" });

    const normalizedSlug = String(slug).trim().replace(/\.html$/i, "");
    const dir = type === "project" ? "public/projects" : "public/posts";
    await deleteRepoFile({ path: `${dir}/${normalizedSlug}.html`, message: `Delete ${type}: ${normalizedSlug}` });

    if (type === "project") {
      const updatedProjects = projectsIndex.filter((name) => name !== normalizedSlug);
      await upsertRepoFile({
        path: "data/projects-index.json",
        content: `${JSON.stringify(updatedProjects, null, 2)}\n`,
        message: `Remove project from index: ${normalizedSlug}`,
      });
    }

    if (type === "post") {
      const updatedPosts = postsIndex.filter((post) => post.slug !== normalizedSlug);
      await upsertRepoFile({
        path: "data/posts-index.json",
        content: `${JSON.stringify(updatedPosts, null, 2)}\n`,
        message: `Remove post from index: ${normalizedSlug}`,
      });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Delete failed" });
  }
}
