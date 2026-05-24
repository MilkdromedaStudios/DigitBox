import Link from "next/link";
import { useEffect, useState } from "react";

// digitbox/pages/index.js

export default function Home() {
  const [posts, setPosts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [updatesError, setUpdatesError] = useState("");

  useEffect(() => {
    loadLatestContent();
  }, []);

  async function loadLatestContent() {
    setUpdatesError("");

    try {
      const [postsRes, projectsRes] = await Promise.all([
        fetch("/api/content/list?type=post"),
        fetch("/api/content/list?type=project"),
      ]);

      const [postsPayload, projectsPayload] = await Promise.all([
        postsRes.json(),
        projectsRes.json(),
      ]);

      if (!postsRes.ok || !projectsRes.ok) {
        setUpdatesError("Failed to load latest updates right now.");
        return;
      }

      setPosts((postsPayload.items || []).slice(0, 3));
      setProjects((projectsPayload.items || []).slice(0, 3));
    } catch {
      setUpdatesError("Could not reach the content service. Please try again.");
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
        {updatesError && <p className="post-meta">{updatesError}</p>}

        <div className="card-grid">
          <div className="card">
            <h3>Recent Posts</h3>
            {posts.length === 0 ? (
              <p>No posts yet.</p>
            ) : (
              <ul>
                {posts.map((post) => (
                  <li key={post.path}>
                    <Link href={`/posts/${encodeURIComponent(post.slug)}`}>
                      {post.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <p>
              <Link href="/posts">Browse all posts</Link>
            </p>
          </div>

          <div className="card">
            <h3>Recent Projects</h3>
            {projects.length === 0 ? (
              <p>No projects yet.</p>
            ) : (
              <ul>
                {projects.map((project) => (
                  <li key={project.path}>
                    <Link href={`/projects/${encodeURIComponent(project.slug)}`}>
                      {project.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <p>
              <Link href="/gallery">Browse all projects</Link>
            </p>
          </div>
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
