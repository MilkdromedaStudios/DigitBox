import { useEffect, useMemo, useState } from "react";

export default function PostsPage() {
  const [posts, setPosts] = useState([]);
  const [viewMode, setViewMode] = useState("tiles");
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

  const containerClass = useMemo(
    () => (viewMode === "tiles" ? "gallery-grid" : "content-list"),
    [viewMode]
  );

  return (
    <div className="content">
      <h1>Posts</h1>
      <div className="view-toggle-row">
        <button className="auth-btn" onClick={() => setViewMode("tiles")}>Tiles</button>
        <button className="like-btn" onClick={() => setViewMode("list")}>List</button>
      </div>
      {error && <p className="post-meta">{error}</p>}

      <div className={containerClass}>
        {posts.map((post) => (
          <article key={post.path} className="post-card">
            <h2>{post.title}</h2>
            <p className="post-meta">{post.name}</p>
            <a className="auth-btn" href={post.download_url} target="_blank" rel="noreferrer">
              Open Post
            </a>
          </article>
        ))}
      </div>
    </div>
  );
}
