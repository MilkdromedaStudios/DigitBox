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

  const encodedPath = `public/projects/${filename}`
    .split("/")
    .map(encodeURIComponent)
    .join("/");

  const rawRes = await fetch(
    `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${encodedPath}`,
    { headers: { Authorization: `Bearer ${required("GITHUB_TOKEN")}` } }
  );

  if (rawRes.status === 404) {
    return { notFound: true };
  }

  if (!rawRes.ok) {
    return {
      props: {
        html: "<h1>Could not load project.</h1>",
        title: "Project Error",
      },
    };
  }

  const html = await rawRes.text();

  return {
    props: {
      html,
      title: slug,
      unavailableReason: isGitLfsPointer(html) ? "This project file is still unavailable from GitHub raw content." : "",
    },
  };
}
