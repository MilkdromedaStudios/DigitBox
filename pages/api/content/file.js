import fs from "fs/promises";
import path from "path";
import { isGitLfsPointer, readGithubFile } from "../../../lib/contentSource";

async function readLocalFile(filePath) {
  const absolutePath = path.join(process.cwd(), filePath);
  try {
    const content = await fs.readFile(absolutePath, "utf8");
    if (!isGitLfsPointer(content)) return content;

    const githubContent = await readGithubFile(filePath);
    if (githubContent != null) return githubContent;

    throw new Error("Git LFS pointer found instead of the real project file. Run git lfs pull during the build so the project can be viewed without a GitHub API key.");
  } catch (error) {
    if (error?.code === "ENOENT") return readGithubFile(filePath);
    throw error;
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const filePath = String(req.query.path || "").trim();
    if (!filePath.startsWith("public/projects/") && !filePath.startsWith("public/posts/")) {
      return res.status(400).json({ error: "Invalid path" });
    }

    const content = await readLocalFile(filePath);
    if (content == null) return res.status(404).json({ error: "File not found" });

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(content);
  } catch (error) {
    return res.status(500).json({ error: error.message || "Read failed" });
  }
}
