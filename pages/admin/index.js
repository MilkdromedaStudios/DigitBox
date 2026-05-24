import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import PostForm from "../../components/PostForm";
import { getCurrentUserWithRole, isAdminRole } from "../../lib/roles";
import { fetchWithRetry, toFriendlyNetworkError } from "../../lib/fetchWithRetry";

export default function AdminPage() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [projTitle, setProjTitle] = useState("");
  const [projHtml, setProjHtml] = useState("");
  const [projectFile, setProjectFile] = useState(null);
  const [status, setStatus] = useState("");
  const router = useRouter();

  useEffect(() => {
    getCurrentUserWithRole().then(({ user: u, role: r }) => {
      setUser(u);
      setRole(r);
      if (!u || !isAdminRole(r)) router.replace("/");
    });
  }, [router]);

  async function createProject(e) {
    e.preventDefault();
    const html = projectFile ? await projectFile.text() : projHtml;
    if (!projTitle || !html) return;

    try {
      const res = await fetchWithRetry(
        "/api/content/publish",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "project", title: projTitle, html }),
        },
        { retries: 3, timeoutMs: 30000 }
      );
      const payload = await res.json().catch(() => ({}));
      const res = await fetchWithRetry("/api/content/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "project", title: projTitle, html }),
      });
      const payload = await res.json();
      setStatus(res.ok ? `Published: ${payload.htmlPath}` : `Error: ${payload.error}`);
    } catch (error) {
      setStatus(`Error: ${toFriendlyNetworkError(error)}`);
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
          <textarea className="auth-input" placeholder="Paste project HTML" value={projHtml} onChange={(e) => setProjHtml(e.target.value)} rows={8} />
          <input type="file" accept=".html,text/html" onChange={(e) => setProjectFile(e.target.files?.[0] || null)} />
          <button className="auth-btn" type="submit">Publish Project</button>
          {status && <p>{status}</p>}
        </form>
      </section>
    </div>
  );
}
