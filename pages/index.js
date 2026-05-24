// digitbox/pages/index.js

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Home() {
  const [updates, setUpdates] = useState([]);
  const [updatesError, setUpdatesError] = useState("");

  useEffect(() => {
    loadUpdates();
  }, []);

  async function loadUpdates() {
    setUpdatesError("");
    try {
      const [projectsRes, postsRes] = await Promise.all([
        fetch("/api/content/list?type=project&limit=5"),
        fetch("/api/content/list?type=post&limit=5"),
      ]);

      const [projectsPayload, postsPayload] = await Promise.all([
        projectsRes.json(),
        postsRes.json(),
      ]);

      if (!projectsRes.ok || !postsRes.ok) {
        setUpdatesError(
          projectsPayload.error || postsPayload.error || "Failed to load latest updates"
        );
        return;
      }

      const projectItems = (projectsPayload.items || []).map((item) => ({
        ...item,
        contentType: "project",
      }));
      const postItems = (postsPayload.items || []).map((item) => ({
        ...item,
        contentType: "post",
      }));

      const merged = [...projectItems, ...postItems]
        .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))
        .slice(0, 6);

      setUpdates(merged);
    } catch {
      setUpdatesError("Failed to load latest updates");
    }
  }

  return (
    <>
      {/* HERO SECTION */}
      <section className="hero">
        <div className="hero-overlay" />
        <div className="hero-content">
          <div className="hero-box">
            <h1>Explore Innovative HTML5 Projects Today!</h1>
            <p>
              Welcome to my portfolio featuring exciting HTML5 projects you can
              interact with.
            </p>

            <div className="hero-scroller">
              <span>Play.</span>
              <span>Create.</span>
              <span>Share.</span>
              <span>Feature.</span>
            </div>
          </div>
        </div>
      </section>

      {/* LATEST UPDATES */}
      <section className="section">
        <h2>Latest Updates</h2>
        <div className="card-grid">
          {updatesError && <p className="post-meta">{updatesError}</p>}

          {!updatesError && updates.length === 0 && (
            <div className="card">
              <h3>No updates yet</h3>
              <p>Recent projects and posts will show up here once published.</p>
            </div>
          )}

          {updates.map((item) => (
            <Link
              key={`${item.contentType}-${item.path}`}
              href={item.contentType === "project" ? `/projects/${encodeURIComponent(item.slug)}` : `/posts/${encodeURIComponent(item.slug)}`}
              className="card card-link"
            >
              <h3>{item.title}</h3>
              <p className="post-meta">
                {item.contentType === "project" ? "Project" : "Post"}
                {item.updated_at ? ` • ${new Date(item.updated_at).toLocaleDateString()}` : ""}
              </p>
              {item.excerpt && <p>{item.excerpt}</p>}
            </Link>
          ))}
        </div>
      </section>

      {/* HIGHLIGHTS */}
      <section className="section">
        <h2>Highlights</h2>

        <div className="card-grid">
          <a href="/gallery" className="card card-link">
            <h3>Gallery</h3>
            <p>
              Explore my gallery showcasing innovative HTML5 games and Minecraft
              mods that I've developed.
            </p>
          </a>

          <a href="/gallery" className="card card-link">
            <h3>Projects</h3>
            <p>
              Check out my latest coding projects, where creativity meets
              technology to produce engaging user experiences.
            </p>
          </a>

          <a
            href="https://ko-fi.com/respawnerzstudioz"
            target="_blank"
            rel="noreferrer"
            className="card card-link"
          >
            <h3>Donation</h3>
            <p>
              Support my work with donations through Ko-fi to help keep the
              creativity flowing!
            </p>
          </a>
        </div>
      </section>

      {/* SUPPORT ME */}
      <section className="section">
        <h2>Support Me</h2>

        <div className="support-grid">
          <a
            href="https://ko-fi.com/respawnerzstudioz"
            target="_blank"
            rel="noreferrer"
          >
            <div className="support-pill">
              <img src="/logos/kofi.png" alt="Ko-fi" className="support-icon" />
            </div>
          </a>

          <a
            href="https://www.planetminecraft.com/member/error99998252/"
            target="_blank"
            rel="noreferrer"
          >
            <div className="support-pill">
              <img src="/logos/pmc.png" alt="Planet Minecraft" className="support-icon" />
            </div>
          </a>

          <a
            href="https://www.youtube.com/channel/UCxFlo666aCncPAtBw-IzeOw/"
            target="_blank"
            rel="noreferrer"
          >
            <div className="support-pill">
              <img src="/logos/youtube.png" alt="YouTube" className="support-icon" />
            </div>
          </a>

          <a
            href="https://modrinth.com/user/Error9998252"
            target="_blank"
            rel="noreferrer"
          >
            <div className="support-pill">
              <img src="/logos/modrinth.png" alt="Modrinth" className="support-icon" />
            </div>
          </a>
        </div>
      </section>
    </>
  );
}
