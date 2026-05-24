import { useEffect, useMemo, useState } from "react";

export default function GalleryPage() {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [viewMode, setViewMode] = useState("tiles");
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

  const containerClass = useMemo(
    () => (viewMode === "tiles" ? "gallery-grid" : "content-list"),
    [viewMode]
  );

  return (
    <div className="content">
      <h1>Projects Gallery</h1>
      <div className="view-toggle-row">
        <button className="auth-btn" onClick={() => setViewMode("tiles")}>Tiles</button>
        <button className="like-btn" onClick={() => setViewMode("list")}>List</button>
      </div>
      {error && <p className="post-meta">{error}</p>}

      <div className={containerClass}>
        {projects.map((project) => (
          <figure key={project.path} className="gallery-item">
            <h2>{project.title}</h2>
            <p className="post-meta">{project.name}</p>
            <div className="gallery-actions">
              <button className="auth-btn" onClick={() => { setSelectedProject(project); setShowModal(true); }}>
                Open
              </button>
              <a className="like-btn" href={project.download_url} target="_blank" rel="noreferrer">View Raw</a>
            </div>
          </figure>
        ))}
      </div>

      {showModal && selectedProject && (
        <div className="project-modal">
          <div className="project-modal-inner">
            <div className="project-modal-header">
              <h2>{selectedProject.title}</h2>
              <button className="exit-btn" onClick={() => setShowModal(false)}>Exit</button>
            </div>
            <div className="project-modal-frame-wrapper">
              <iframe className="project-modal-iframe" src={selectedProject.download_url} title={selectedProject.title} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
