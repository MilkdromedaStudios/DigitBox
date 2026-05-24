import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { getCurrentUserWithRole, isAdminRole } from "../../lib/roles";
import { fetchWithRetry, toFriendlyNetworkError } from "../../lib/fetchWithRetry";

export default function AdminProjectsPage() {
  const [allowed, setAllowed] = useState(false);
  const [projects, setProjects] = useState([]);
  const [status, setStatus] = useState("");
  const [busySlug, setBusySlug] = useState("");
  const router = useRouter();

  useEffect(() => {
    getCurrentUserWithRole().then(({ user, role }) => {
      if (!user || !isAdminRole(role)) return router.replace("/");
      setAllowed(true);
      loadProjects();
    });
  }, [router]);

  async function loadProjects() {
    const res = await fetch("/api/content/list?type=project");
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) return setStatus(payload.error || "Failed to load projects");
    setProjects(payload.items || []);
  }

  async function deleteProject(slug) {
    setBusySlug(slug);
    setStatus("");
    try {
      const res = await fetchWithRetry("/api/content/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "project", slug }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Delete failed");
      setStatus(`Deleted project: ${slug}`);
      loadProjects();
    } catch (error) {
      setStatus(`Error: ${toFriendlyNetworkError(error)}`);
    } finally {
      setBusySlug("");
    }
  }

  if (!allowed) return <div className="content">Checking admin access…</div>;

  return (
    <div className="content">
      <h1>Task 1: Projects</h1>
      <p className="post-meta">Manage and delete published projects.</p>
      <Link className="like-btn action-btn" href="/admin">← Back to Admin Dashboard</Link>
      {status && <p className="post-meta">{status}</p>}
      <div className="admin-posts">
        {projects.map((project) => (
          <div key={project.slug} className="admin-post-row">
            <div>
              <strong>{project.title}</strong>
              <div className="post-meta">/{project.slug}</div>
            </div>
            <div className="gallery-actions">
              <Link className="auth-btn action-btn" href={`/projects/${encodeURIComponent(project.slug)}`}>Open</Link>
              <button className="logout-btn" onClick={() => deleteProject(project.slug)} disabled={busySlug === project.slug}>
                {busySlug === project.slug ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
