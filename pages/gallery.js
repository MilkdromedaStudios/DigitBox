import Link from "next/link";
import { useEffect, useState } from "react";

export default function GalleryPage() {
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState("");
  const [showPeople, setShowPeople] = useState(false);
  const [people, setPeople] = useState([]);
  const [peopleOffset, setPeopleOffset] = useState(0);
  const [peopleDone, setPeopleDone] = useState(false);
  const [peopleLoading, setPeopleLoading] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    setError("");
    const res = await fetch("/api/content/list?type=project");
    const payload = await res.json();
    if (!res.ok) return setError(payload.error || "Failed to load projects");
    setProjects(payload.items || []);
  }

  async function loadPeople(nextOffset = 0) {
    if (peopleLoading || (peopleDone && nextOffset !== 0)) return;
    setPeopleLoading(true);
    try {
      const res = await fetch(`/api/profiles/public?limit=10&offset=${nextOffset}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to load people");
      const items = payload.items || [];
      setPeople((prev) => (nextOffset === 0 ? items : [...prev, ...items]));
      setPeopleOffset(nextOffset + items.length);
      setPeopleDone(items.length < 10);
    } catch (e) {
      setError(e.message || "Failed to load people");
    } finally {
      setPeopleLoading(false);
    }
  }

  function openPeople() {
    setShowPeople(true);
    setPeople([]);
    setPeopleOffset(0);
    setPeopleDone(false);
    loadPeople(0);
  }

  return (
    <div className="content">
      <h1>Projects Gallery</h1>
      {error && <p className="post-meta">{error}</p>}

      <div style={{ marginBottom: "1rem" }}>
        <button className="auth-btn" type="button" onClick={openPeople}>View other people</button>
      </div>

      {showPeople && (
        <section className="section">
          <h2>Community</h2>
          <p className="post-meta">Only users who enable "Show off stats" appear here.</p>
          <div className="content-list">
            {people.map((person) => (
              <Link key={person.id} href={`/u/${person.id}`} className="gallery-item card-link">
                <strong>{person.display_name || "Player"}</strong>
                <div className="post-meta">{person.identity_label || "Member"}</div>
              </Link>
            ))}
          </div>
          {!peopleDone && (
            <button className="like-btn" type="button" onClick={() => loadPeople(peopleOffset)} disabled={peopleLoading}>
              {peopleLoading ? "Loading..." : "Load more"}
            </button>
          )}
        </section>
      )}

      <div className="gallery-grid">
        {projects.map((project) => (
          <figure key={project.path} className="gallery-item">
            <h2>{project.title}</h2>
            <p className="post-meta">{project.name}</p>
            <div className="gallery-actions">
              <Link className="auth-btn action-btn" href={`/projects/${encodeURIComponent(project.slug)}`}>Open</Link>
              <a className="like-btn action-btn" href={project.download_url} target="_blank" rel="noreferrer">View Raw</a>
            </div>
          </figure>
        ))}
      </div>
    </div>
  );
}
