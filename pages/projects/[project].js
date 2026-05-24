import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/router";

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

export default function ProjectRunner({ html, title, slug, notFound }) {
  const router = useRouter();

  useEffect(() => {
    if (!html || notFound) return;

    const safeTitle = title || "Project";
    const fullDocument = html.includes("<html")
      ? html
      : `<!doctype html><html><head><meta charset=\"utf-8\"/><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"/><title>${safeTitle}</title></head><body>${html}</body></html>`;

    document.open();
    document.write(fullDocument);
    document.close();

    fetch(`/api/projects/${encodeURIComponent(slug)}/track`, { method: "POST" }).catch(() => {});
  }, [html, notFound, slug, title]);

  if (notFound) {
    return (
      <div className="content">
        <h1>404 - Project Not Found</h1>
        <p className="post-meta">We could not find that project.</p>
        <Link className="auth-btn action-btn" href="/gallery">Return to Gallery</Link>
      </div>
    );
  }

  return (
    <button type="button" className="project-back-btn" onClick={() => router.push("/gallery")}>← Return</button>
  );
}

export async function getServerSideProps({ params }) {
  const owner = required("GITHUB_REPO_OWNER");
  const repo = required("GITHUB_REPO_NAME");
  const branch = process.env.GITHUB_REPO_BRANCH || "main";
  const slug = Array.isArray(params.project) ? params.project[0] : params.project;

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/public/projects/${encodeURIComponent(`${slug}.html`)}?ref=${branch}`,
    { headers: authHeaders() }
  );

  if (res.status === 404) {
    return { props: { html: "", title: slug, slug, notFound: true } };
  }

  if (!res.ok) {
    return { props: { html: "<h1>Could not load project.</h1>", title: "Project Error", slug, notFound: false } };
  }

  const data = await res.json();
  const html = Buffer.from(data.content || "", "base64").toString("utf8");
  return { props: { html, title: slug, slug, notFound: false } };
}
