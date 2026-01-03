// digitbox/pages/admin/index.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";

const adminEmails = [
  "wong.christopher501@gmail.com",
  "Studio.Milkdromeda@planetmail.net",
];

export default function AdminPage() {
  const [user, setUser] = useState(null);

  const [posts, setPosts] = useState([]);
  const [projects, setProjects] = useState([]);

  const [postTitle, setPostTitle] = useState("");
  const [postContent, setPostContent] = useState("");
  const [postImageFile, setPostImageFile] = useState(null);
  const [postLoading, setPostLoading] = useState(false);

  const [projTitle, setProjTitle] = useState("");
  const [projDescription, setProjDescription] = useState("");
  const [projHtml, setProjHtml] = useState("");
  const [projLoading, setProjLoading] = useState(false);

  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data?.user || null;
      setUser(u);

      if (!u || !adminEmails.includes(u.email)) {
        router.replace("/");
      } else {
        loadPosts();
        loadProjects();
      }
    });
  }, []);

  async function loadPosts() {
    const { data } = await supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false });

    setPosts(data || []);
  }

  async function loadProjects() {
    const { data } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });

    setProjects(data || []);
  }

  async function createPost(e) {
    e.preventDefault();
    if (!postTitle || !postContent) return;

    setPostLoading(true);

    let image_url = null;

    if (postImageFile) {
      const ext = postImageFile.name.split(".").pop();
      const fileName = `${crypto.randomUUID()}.${ext}`;

      const { data: upload } = await supabase.storage
        .from("post-images")
        .upload(fileName, postImageFile);

      const { data: publicUrl } = supabase.storage
        .from("post-images")
        .getPublicUrl(upload.path);

      image_url = publicUrl.publicUrl;
    }

    await supabase.from("posts").insert({
      title: postTitle,
      content: postContent,
      image_url,
      author: user.email,
    });

    setPostLoading(false);
    setPostTitle("");
    setPostContent("");
    setPostImageFile(null);
    loadPosts();
  }

  async function createProject(e) {
    e.preventDefault();
    if (!projTitle || !projHtml) return;

    setProjLoading(true);

    await supabase.from("projects").insert({
      title: projTitle,
      description: projDescription,
      html_code: projHtml,
      author: user.email,
    });

    setProjLoading(false);
    setProjTitle("");
    setProjDescription("");
    setProjHtml("");
    loadProjects();
  }

  async function deletePost(id) {
    await supabase.from("posts").delete().eq("id", id);
    loadPosts();
  }

  async function deleteProject(id) {
    await supabase.from("projects").delete().eq("id", id);
    loadProjects();
  }

  if (!user || !adminEmails.includes(user.email)) {
    return <div className="content">Checking admin access…</div>;
  }

  return (
    <div className="content">
      <h1>Admin Dashboard</h1>
      <p className="admin-subtitle">
        Create posts and HTML5 projects, and manage existing content.
      </p>

      {/* Create Post */}
      <section style={{ marginBottom: "2rem" }}>
        <h2>Create Post</h2>
        <form className="post-form" onSubmit={createPost}>
          <input
            className="auth-input"
            placeholder="Post title"
            value={postTitle}
            onChange={(e) => setPostTitle(e.target.value)}
          />
          <textarea
            className="auth-input"
            placeholder="Write your post (Markdown allowed)..."
            value={postContent}
            onChange={(e) => setPostContent(e.target.value)}
            rows={6}
          />
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setPostImageFile(e.target.files[0] || null)}
          />
          <button className="auth-btn" type="submit" disabled={postLoading}>
            {postLoading ? "Posting..." : "Create Post"}
          </button>
        </form>
      </section>

      {/* Create Project */}
      <section style={{ marginBottom: "2rem" }}>
        <h2>Create Project</h2>
        <form className="post-form" onSubmit={createProject}>
          <input
            className="auth-input"
            placeholder="Project title"
            value={projTitle}
            onChange={(e) => setProjTitle(e.target.value)}
          />
          <textarea
            className="auth-input"
            placeholder="Project description (optional)"
            value={projDescription}
            onChange={(e) => setProjDescription(e.target.value)}
            rows={3}
          />
          <textarea
            className="auth-input code-editor"
            placeholder="Paste full HTML for your game here..."
            value={projHtml}
            onChange={(e) => setProjHtml(e.target.value)}
            rows={14}
          />
          <button className="auth-btn" type="submit" disabled={projLoading}>
            {projLoading ? "Saving..." : "Create Project"}
          </button>
        </form>
      </section>

      {/* Manage Posts */}
      <section style={{ marginBottom: "2rem" }}>
        <h2>Manage Posts</h2>
        <div className="admin-posts">
          {posts.map((post) => (
            <div key={post.id} className="admin-post-row">
              <div>
                <strong>{post.title}</strong>
                <div className="post-meta">
                  {post.author} ·{" "}
                  {new Date(post.created_at).toLocaleString()}
                </div>
              </div>
              <button
                className="logout-btn"
                onClick={() => deletePost(post.id)}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Manage Projects */}
      <section>
        <h2>Manage Projects</h2>
        <div className="admin-posts">
          {projects.map((proj) => (
            <div key={proj.id} className="admin-post-row">
              <div>
                <strong>{proj.title}</strong>
                <div className="post-meta">
                  {proj.author} ·{" "}
                  {new Date(proj.created_at).toLocaleString()}
                </div>
              </div>
              <button
                className="logout-btn"
                onClick={() => deleteProject(proj.id)}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
