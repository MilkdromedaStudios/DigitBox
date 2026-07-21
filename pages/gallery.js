import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { readLikes, toggleLike, LIKES_UPDATED_EVENT } from "../lib/likes";
import { readNotes, writeNotes } from "../lib/notes";

export default function GalleryPage() {
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("all"); // "all" | "liked"
  const [likes, setLikes] = useState([]);
  const [notes, setNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState(true);

  const hydratedRef = useRef(false);

  useEffect(() => {
    loadProjects();
  }, []);

  // Load per-device likes + notes and keep likes in sync across tabs.
  useEffect(() => {
    setLikes(readLikes());
    setNotes(readNotes());
    hydratedRef.current = true;
    const sync = () => setLikes(readLikes());
    window.addEventListener(LIKES_UPDATED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(LIKES_UPDATED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // Debounced autosave for the notes scratchpad.
  useEffect(() => {
    if (!hydratedRef.current) return undefined;
    const id = setTimeout(() => {
      writeNotes(notes);
      setNotesSaved(true);
    }, 400);
    return () => clearTimeout(id);
  }, [notes]);

  async function loadProjects() {
    setError("");
    const res = await fetch("/api/content/list?type=project");
    const payload = await res.json();
    if (!res.ok) return setError(payload.error || "Failed to load projects");
    setProjects(payload.items || []);
  }

  function onToggleLike(slug) {
    setLikes(toggleLike(slug));
  }

  const likedCount = useMemo(
    () => projects.filter((p) => likes.includes(p.slug)).length,
    [projects, likes]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = tab === "liked" ? projects.filter((p) => likes.includes(p.slug)) : projects;
    if (q) {
      list = list.filter((p) =>
        [p.title, p.name, p.slug]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(q))
      );
    }
    return list;
  }, [projects, query, tab, likes]);

  return (
    <div className="content">
      <h1>Projects Gallery</h1>
      {error && <p className="post-meta">{error}</p>}

      <div className="gallery-toolbar">
        <input
          type="search"
          className="auth-input gallery-search"
          placeholder="Search projects…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search projects"
        />
        <div className="gallery-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "all"}
            className={`gallery-tab${tab === "all" ? " is-active" : ""}`}
            onClick={() => setTab("all")}
          >
            All
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "liked"}
            className={`gallery-tab${tab === "liked" ? " is-active" : ""}`}
            onClick={() => setTab("liked")}
          >
            ♥ Liked{likedCount ? ` (${likedCount})` : ""}
          </button>
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="post-meta">
          {tab === "liked"
            ? "No liked projects yet — tap ♥ Like on a project to save it here."
            : "No projects match your search."}
        </p>
      )}

      <div className="gallery-grid">
        {filtered.map((project) => {
          const liked = likes.includes(project.slug);
          return (
            <figure key={project.path} className="gallery-item">
              <h2>{project.title}</h2>
              <p className="post-meta">{project.name}</p>
              <div className="gallery-actions">
                <Link className="auth-btn action-btn" href={`/projects/${encodeURIComponent(project.slug)}`}>
                  Open
                </Link>
                <button
                  type="button"
                  className={`like-toggle${liked ? " is-liked" : ""}`}
                  onClick={() => onToggleLike(project.slug)}
                  aria-pressed={liked}
                  title={liked ? "Remove from liked" : "Add to liked"}
                >
                  <span aria-hidden="true">{liked ? "♥" : "♡"}</span>
                  {liked ? "Liked" : "Like"}
                </button>
              </div>
            </figure>
          );
        })}
      </div>

      <section className="section notes-section">
        <div className="notes-head">
          <h2>Jot things down</h2>
          <span className="post-meta notes-status">{notesSaved ? "Saved on this device" : "Saving…"}</span>
        </div>
        <textarea
          className="auth-input notes-area"
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            setNotesSaved(false);
          }}
          placeholder="A scratchpad for anything — ideas, save codes, to-dos… kept on this device."
          rows={6}
          aria-label="Personal notes"
        />
      </section>
    </div>
  );
}
