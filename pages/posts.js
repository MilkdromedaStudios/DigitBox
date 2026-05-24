import Link from "next/link";
import { useEffect, useState } from "react";

export default function PostsPage() {
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    loadPosts();
  }, []);

  async function loadPosts() {
    setError("");
    const res = await fetch("/api/content/list?type=post");
    const payload = await res.json();
    if (!res.ok) {
      setError(payload.error || "Failed to load posts");
      return;
    }
    setPosts(payload.items || []);
  }

  return (
    <div className="content">
      <h1>Posts</h1>
      {error && <p className="post-meta">{error}</p>}

      <div className="content-list">
        {posts.map((post) => (
          <article key={post.path} className="post-card">
            <h2>{post.title}</h2>
            <p className="post-meta">{post.name}</p>
            <p className="post-excerpt">
              {post.excerpt || "No preview available yet."}
            </p>

            {/* View Post button */}
            <Link
              href={`/posts/${encodeURIComponent(post.slug)}`}
              className="auth-btn action-btn"
            >
              View Post
            </Link>

            {/* Download button */}
            <a
              className="auth-btn action-btn"
              href={post.download_url}
              target="_blank"
              rel="noreferrer"
              style={{ marginLeft: "10px" }}
            >
              Download
            </a>
          </article>
        ))}
      </div>
    </div>
  );
}
