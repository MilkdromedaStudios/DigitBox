import Link from "next/link";
import { useEffect, useState } from "react";

export default function GalleryPage() {
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    setError("");
    const res = await fetch("/api/content/list?type=project");
    const payload = await res.json();
    if (!res.ok) {
      setError(payload.error || "Failed to load projects");
      return;
    }
    setProjects(payload.items || []);
  }

  return (
    <div className="content">
      <h1>Projects Gallery</h1>
      {error && <p className="post-meta">{error}</p>}

      <div className="gallery-grid">
        {projects.map((project) => (
          <figure key={project.path} className="gallery-item">
            <h2>{project.title}</h2>
            <p className="post-meta">{project.name}</p>
            <div className="gallery-actions">
              <Link className="auth-btn action-btn" href={`/projects/${encodeURIComponent(project.slug)}`}>
                Open
              </Link>
              <a className="like-btn action-btn" href={project.download_url} target="_blank" rel="noreferrer">
                View Raw
              </a>
            </div>
          </figure>
        ))}
      </div>
    </div>
  );
}
