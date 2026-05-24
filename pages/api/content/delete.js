import { deleteRepoFile } from "../../../lib/githubContent";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { type, slug } = req.body || {};
    if (!type || !slug) return res.status(400).json({ error: "type and slug are required" });
    if (!["project", "post"].includes(type)) return res.status(400).json({ error: "Invalid type" });

    const normalizedSlug = String(slug).trim().replace(/\.html$/i, "");
    const dir = type === "project" ? "public/projects" : "public/posts";
    await deleteRepoFile({ path: `${dir}/${normalizedSlug}.html`, message: `Delete ${type}: ${normalizedSlug}` });
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Delete failed" });
  }
}
