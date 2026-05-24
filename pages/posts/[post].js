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
  const owner = required("GITHUB_REPO_OWNER");
  const repo = required("GITHUB_REPO_NAME");
  const branch = process.env.GITHUB_REPO_BRANCH || "main";
  const slug = Array.isArray(params.post) ? params.post[0] : params.post;
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
  const html = Buffer.from(data.content || "", "base64").toString("utf8");

  return {
    props: {
      title: toDisplayTitle(slug),
      html,
    },
  };
}
