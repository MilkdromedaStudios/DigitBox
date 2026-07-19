import { fetchR2File, isGitLfsPointer } from "../../lib/r2Content";
import { getGithubRepo } from "../../lib/githubRepo";

export const config = { runtime: "experimental-edge" };

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
  const { owner, repo, branch } = getGithubRepo();

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

  const slug = rawSlug;
  const filename = `${slug}.html`;

  // Read straight from raw.githubusercontent.com — the GitHub API's
  // unauthenticated 60/hour-per-IP rate limit was causing 403s.
  const res = await fetch(
    `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/public/posts/${encodeURIComponent(filename)}`,
    { headers: process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : undefined }
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

  const html = await res.text();

  if (isGitLfsPointer(html)) {
    return {
      props: {
        title: toDisplayTitle(slug),
        html: "<p>This post is stored in Git LFS and has not been synced to the game-assets release yet.</p>",
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
