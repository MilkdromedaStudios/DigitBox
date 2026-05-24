import { useEffect } from "react";

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

export default function ProjectRunner({ html, title }) {
  useEffect(() => {
    if (!html) return;

    const fullDocument = html.includes("<html")
      ? html
      : `<!doctype html><html><head><meta charset=\"utf-8\"/><title>${title || "Project"}</title></head><body>${html}</body></html>`;

    document.open();
    document.write(fullDocument);
    document.close();
  }, [html, title]);

  return null;
}

export async function getServerSideProps({ params }) {
  const owner = required("GITHUB_REPO_OWNER");
  const repo = required("GITHUB_REPO_NAME");
  const branch = process.env.GITHUB_REPO_BRANCH || "main";
  const slug = Array.isArray(params.project) ? params.project[0] : params.project;
  const filename = `${slug}.html`;

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/public/projects/${encodeURIComponent(filename)}?ref=${branch}`,
    { headers: authHeaders() }
  );

  if (res.status === 404) {
    return { notFound: true };
  }

  if (!res.ok) {
    return {
      props: {
        html: "<h1>Could not load project.</h1>",
        title: "Project Error",
      },
    };
  }

  const data = await res.json();
  const html = Buffer.from(data.content || "", "base64").toString("utf8");

  return {
    props: {
      html,
      title: slug,
    },
  };
}
