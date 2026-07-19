import { upsertRepoFile } from "../../../lib/githubContent";
import { jsonResponse } from "../../../lib/apiResponse";
import { getContentBucket, toR2Key } from "../../../lib/r2";
import postsIndex from "../../../data/posts-index.json";
import projectsIndex from "../../../data/projects-index.json";

export const config = { runtime: "edge" };

// Content HTML (games especially) is too large for the git repo — store it in
// the R2 bucket when the binding is available; otherwise fall back to
// committing it to the repo as before. The small JSON indexes always live in
// the repo.
async function storeContentFile({ path, content, contentType, message }) {
  const bucket = getContentBucket();
  if (bucket) {
    await bucket.put(toR2Key(path), content, {
      httpMetadata: { contentType },
    });
    return;
  }

  await upsertRepoFile({ path, content, message });
}

function slugify(input) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export default async function handler(req) {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const { type, title, html, markdown } = (await req.json().catch(() => null)) || {};
    if (!["project", "post"].includes(type)) return jsonResponse({ error: "Invalid type" }, 400);
    if (!title || !html) return jsonResponse({ error: "title and html are required" }, 400);

    const slug = slugify(title) || `${type}-${Date.now()}`;
    const dir = type === "project" ? "public/projects" : "public/posts";
    const htmlPath = `${dir}/${slug}.html`;

    await storeContentFile({
      path: htmlPath,
      content: html,
      contentType: "text/html; charset=utf-8",
      message: `Publish ${type}: ${title}`,
    });

    if (markdown && type === "post") {
      await storeContentFile({
        path: `public/posts/${slug}.md`,
        content: markdown,
        contentType: "text/markdown; charset=utf-8",
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

    return jsonResponse({ ok: true, slug, htmlPath });
  } catch (error) {
    return jsonResponse({ error: error.message || "Publish failed" }, 500);
  }
}
