import { decodeBase64Utf8 } from "../../lib/base64";
import { fetchR2File, isGitLfsPointer } from "../../lib/r2Content";

export const config = { runtime: "experimental-edge" };

function authHeaders() {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  return headers;
}

function toDisplayTitle(slug) {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function PostPage({ title, html }) {
  return (
    <div className="content">
      <article className="post-card">
        <h1>{title}</h1>
        <div className="post-body" dangerouslySetInnerHTML={{ __html: html }} />
      </article>
    </div>
  );
}

export async function getServerSideProps({ params }) {
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;
  const branch = process.env.GITHUB_REPO_BRANCH || "main";

  const rawSlug = Array.isArray(params.post) ? params.post[0] : params.post;

  // Try the Cloudflare R2 bucket first so posts load without touching
  // GitHub or Git LFS. GitHub stays as a fallback.
  const r2Res = await fetchR2File(`public/posts/${rawSlug}.html`).catch(() => null);
  if (r2Res) {
    return {
      props: {
        title: toDisplayTitle(rawSlug),
        html: await r2Res.text(),
      },
    };
  }

  if (!owner || !repo) {
    return {
      props: {
        title: "Post Unavailable",
        html: "<p>Posts are not configured yet. Set the GitHub repository environment variables to enable them.</p>",
      },
    };
  }
  const slug = rawSlug;
  const filename = `${slug}.html`;

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/public/posts/${encodeURIComponent(filename)}?ref=${branch}`,
    { headers: authHeaders() }
  );

  if (res.status === 404) return { notFound: true };

  if (!res.ok) {
    return {
      props: {
        title: "Post Error",
        html: "<p>Could not load this post right now.</p>",
      },
    };
  }

  const data = await res.json();
  const html = decodeBase64Utf8(data.content || "");

  if (isGitLfsPointer(html)) {
    return {
      props: {
        title: toDisplayTitle(slug),
        html: "<p>This post is stored in Git LFS and has not been uploaded to the R2 bucket yet.</p>",
      },
    };
  }

  return {
    props: {
      title: toDisplayTitle(slug),
      html,
    },
  };
}
