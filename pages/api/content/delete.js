import { deleteRepoFile } from "../../../lib/githubContent";
import { upsertRepoFile } from "../../../lib/githubContent";
import { jsonResponse } from "../../../lib/apiResponse";
import postsIndex from "../../../data/posts-index.json";
import projectsIndex from "../../../data/projects-index.json";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const { type, slug } = (await req.json().catch(() => null)) || {};
    if (!type || !slug) return jsonResponse({ error: "type and slug are required" }, 400);
    if (!["project", "post"].includes(type)) return jsonResponse({ error: "Invalid type" }, 400);

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

    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse({ error: error.message || "Delete failed" }, 500);
  }
}
