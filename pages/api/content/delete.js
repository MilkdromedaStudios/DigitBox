import { deleteRepoFile } from "../../../lib/githubContent";
import { upsertRepoFile } from "../../../lib/githubContent";
import { jsonResponse } from "../../../lib/apiResponse";
import { getContentBucket, toR2Key } from "../../../lib/r2";
import { deleteGithubReleaseAsset } from "../../../lib/githubAssets";
import postsIndex from "../../../data/posts-index.json";
import projectsIndex from "../../../data/projects-index.json";

export const config = { runtime: "edge" };

// Content may live in the R2 bucket, the GitHub release that holds the big
// game files, the git repo, or several of these (mid-migration). Delete from
// every store, and tolerate a missing repo file as long as one of the other
// stores had the content.
async function deleteContentFile({ path, message }) {
  const bucket = getContentBucket();
  if (bucket) {
    await bucket.delete(toR2Key(path));
  }

  const deletedReleaseAsset = await deleteGithubReleaseAsset(path).catch(() => false);

  try {
    await deleteRepoFile({ path, message });
  } catch (error) {
    const notFound = /file not found/i.test(String(error?.message || ""));
    if (!notFound || (!bucket && !deletedReleaseAsset)) throw error;
  }
}

export default async function handler(req) {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const { type, slug } = (await req.json().catch(() => null)) || {};
    if (!type || !slug) return jsonResponse({ error: "type and slug are required" }, 400);
    if (!["project", "post"].includes(type)) return jsonResponse({ error: "Invalid type" }, 400);

    const normalizedSlug = String(slug).trim().replace(/\.html$/i, "");
    const dir = type === "project" ? "public/projects" : "public/posts";
    await deleteContentFile({ path: `${dir}/${normalizedSlug}.html`, message: `Delete ${type}: ${normalizedSlug}` });

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
