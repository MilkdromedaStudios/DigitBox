import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import PostForm from "../../components/PostForm";
import { getCurrentUserWithRole, isAdminRole } from "../../lib/roles";
import { fetchWithRetry, toFriendlyNetworkError } from "../../lib/fetchWithRetry";

export default function AdminPage() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [projTitle, setProjTitle] = useState("");
  const [projectFile, setProjectFile] = useState(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    getCurrentUserWithRole().then(({ user: u, role: r }) => {
      setUser(u);
      setRole(r);
      if (!u || !isAdminRole(r)) router.replace("/");
    });
  }, [router]);

  function onSelectProjectFile(e) {
    const file = e.target.files?.[0] || null;
    setProjectFile(file);
    if (file && !projTitle.trim()) {
      setProjTitle(file.name.replace(/\.html?$/i, ""));
    }
  }

  async function createProject(e) {
    e.preventDefault();
    if (!projectFile) {
      setStatus("Error: Please choose one HTML file.");
      return;
    }

    const html = await projectFile.text();
    const title = projTitle.trim() || projectFile.name.replace(/\.html?$/i, "");

    if (!title || !html.trim()) {
      setStatus("Error: Title and file content are required.");
      return;
    }

    setLoading(true);
    setStatus("");

    try {
      const res = await fetchWithRetry(
        "/api/content/publish",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "project", title, html }),
        },
        { retries: 3, timeoutMs: 30000 }
      );
      const payload = await res.json().catch(() => ({}));
      setStatus(res.ok ? `Published: ${payload.htmlPath}` : `Error: ${payload.error || "Failed to publish"}`);

      if (res.ok) {
        setProjTitle("");
        setProjectFile(null);
      }
    } catch (error) {
      setStatus(`Error: ${toFriendlyNetworkError(error)}`);
    } finally {
      setLoading(false);
    }
  }

  if (!user || !isAdminRole(role)) return <div className="content">Checking admin access…</div>;

  return (
    <div className="content">
      <h1>Admin Dashboard</h1>
      <section style={{ marginBottom: "2rem" }}><h2>Create Post</h2><PostForm /></section>
      <section>
        <h2>Create Project</h2>
        <form className="post-form" onSubmit={createProject}>
          <input className="auth-input" placeholder="Project title" value={projTitle} onChange={(e) => setProjTitle(e.target.value)} />
          <input type="file" accept=".html,text/html" onChange={onSelectProjectFile} />
          {projectFile && <p className="post-meta">Selected file: {projectFile.name}</p>}
          <button className="auth-btn" type="submit" disabled={loading || !projectFile}>{loading ? "Publishing..." : "Publish Project"}</button>
          {status && <p>{status}</p>}
        </form>
      </section>
    </div>
  );
}
