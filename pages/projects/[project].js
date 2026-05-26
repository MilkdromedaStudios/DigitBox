import fs from "fs/promises";
import path from "path";
import { useMemo } from "react";

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

function isGitLfsPointer(content = "") {
  return content.includes("version https://git-lfs.github.com/spec/v1") && content.includes("oid sha256:");
}

async function readLocalProjectFile(filename) {
  const absolutePath = path.join(process.cwd(), "public", "projects", filename);
  try {
    return await fs.readFile(absolutePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function readGithubProjectFile(owner, repo, branch, filename) {
  const encodedPath = `public/projects/${filename}`
    .split("/")
    .map(encodeURIComponent)
    .join("/");

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
    { headers: authHeaders() }
  );

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub file read failed (${res.status})`);

  const data = await res.json();
  if (data?.encoding !== "base64") throw new Error("Unsupported GitHub content encoding");
  return Buffer.from(data.content || "", "base64").toString("utf8");
}

export default function ProjectRunner({ html, title, unavailableReason }) {
  const srcDoc = useMemo(() => {
    if (!html || unavailableReason) return `<!doctype html><html><body style="font-family:Arial;padding:24px;background:#090f22;color:#f5f7ff;"><h1>Project unavailable</h1><p>${unavailableReason || "Project file is missing."}</p></body></html>`;

    return html.includes("<html")
      ? html
      : `<!doctype html><html><head><meta charset=\"utf-8\"/><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/><title>${title || "Project"}</title></head><body style=\"margin:0;\">${html}</body></html>`;
  }, [html, title]);

  return (
    <iframe
      title={title || "Project"}
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-pointer-lock allow-popups allow-modals allow-forms"
      allow="autoplay; fullscreen; gamepad"
      style={{ width: "100%", height: "100vh", border: "none", display: "block", background: "#000" }}
    />
  );
}

export async function getServerSideProps({ params }) {
  const owner = required("GITHUB_REPO_OWNER");
  const repo = required("GITHUB_REPO_NAME");
  const branch = process.env.GITHUB_REPO_BRANCH || "main";
  const rawSlug = Array.isArray(params.project) ? params.project[0] : params.project;
  const slug = decodeURIComponent(rawSlug || "");
  const filename = `${slug}.html`;

  let html = await readLocalProjectFile(filename);

  if (html == null) {
    html = await readGithubProjectFile(owner, repo, branch, filename);
  }

  if (html == null) {
    return { notFound: true };
  }

  return {
    props: {
      html,
      title: slug,
      unavailableReason: isGitLfsPointer(html)
        ? "This project file is an unresolved Git LFS pointer. Confirm Git LFS assets are checked out in the deployment build."
        : "",
    },
  };
}
