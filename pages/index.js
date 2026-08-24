// digitbox/pages/index.js

import Head from "next/head";
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
      <Head>
        <title>DigitBox — Games, Mods, Tools & Experiments</title>
        <meta
          name="description"
          content="Explore browser games, Minecraft projects, coding experiments, build notes, and AppGPT on DigitBox."
        />
      </Head>

      <section className="hero">
        <div className="hero-overlay" />
        <div className="hero-content">
          <div className="hero-box">
            <h1>Explore Innovative HTML5 Projects Today!</h1>
            <p>
              DigitBox is a working portfolio of browser games, Minecraft
              experiments, web tools, and build notes that you can explore
              directly in your browser.
            </p>

            <div className="hero-scroller">
              <span>Play.</span>
              <span>Create.</span>
              <span>Share.</span>
              <span>Learn.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <h2>What is DigitBox?</h2>
        <p>
          DigitBox is a project hub for turning small ideas into playable,
          testable experiences. The site brings together HTML5 games, Minecraft
          tools and mods, coding experiments, project updates, and the AppGPT
          Telegram Mini App builder. Each project is presented as a work in
          progress: the goal is to make the result easy to try while keeping
          the surrounding notes and links available for anyone who wants to
          understand how it was made.
        </p>
        <p>
          The repository is maintained on GitHub. Smaller site content is read
          from the repository directly, while larger game files can be served
          from GitHub release assets so the main website stays fast and the
          projects remain independently accessible.
        </p>

        <div className="card-grid">
          <article className="card">
            <h3>Browser games</h3>
            <p>
              Play experiments without downloading a launcher. Open a project
              from the gallery, try its controls, and use the save tools when
              the game supports browser storage.
            </p>
          </article>
          <article className="card">
            <h3>Minecraft projects</h3>
            <p>
              Explore mods, launchers, and server-side experiments built around
              practical gameplay problems and cross-platform testing.
            </p>
          </article>
          <article className="card">
            <h3>AI and web tools</h3>
            <p>
              Try AppGPT for building Telegram Mini Apps and read the latest
              notes about new features, fixes, and experiments.
            </p>
          </article>
        </div>
      </section>

      <section className="section">
        <h2>Latest Updates</h2>
        <p>
          New projects and posts appear here as they are published. Open a
          project to try it, or read a post when you want the context behind a
          change.
        </p>
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
              key={item.contentType + "-" + item.path}
              href={
                item.contentType === "project"
                  ? "/projects/" + encodeURIComponent(item.slug)
                  : "/posts/" + encodeURIComponent(item.slug)
              }
              className="card card-link"
            >
              <h3>{item.title}</h3>
              <p className="post-meta">
                {item.contentType === "project" ? "Project" : "Post"}
                {item.updated_at
                  ? " • " + new Date(item.updated_at).toLocaleDateString()
                  : ""}
              </p>
              {item.excerpt && <p>{item.excerpt}</p>}
            </Link>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>How to explore DigitBox</h2>
        <p>
          The site is organized around three simple ways to use it: play a
          project, read the development notes, or build something of your own.
          The original project page remains the best place to start when you
          want to see a game or tool in context.
        </p>

        <div className="card-grid">
          <Link href="/gallery" className="card card-link">
            <h3>Browse the gallery</h3>
            <p>
              Search the project collection, save favorites on this device, and
              open a project when you are ready to play.
            </p>
          </Link>

          <Link href="/posts" className="card card-link">
            <h3>Read the build notes</h3>
            <p>
              Posts explain updates, experiments, fixes, and decisions that do
              not fit inside a project preview.
            </p>
          </Link>

          <Link href="/appgpt" className="card card-link">
            <h3>Try AppGPT</h3>
            <p>
              Describe a Telegram Mini App, generate one evolving HTML file,
              preview it, debug it, and keep working on the same chat.
            </p>
          </Link>
        </div>
      </section>

      <section className="section">
        <h2>Highlights</h2>
        <div className="card-grid">
          <Link href="/gallery" className="card card-link">
            <h3>Projects</h3>
            <p>
              Browse games, Minecraft work, and coding experiments where
              creativity meets hands-on testing.
            </p>
          </Link>

          <Link href="/changelog" className="card card-link">
            <h3>Changelog</h3>
            <p>
              See the larger improvements and maintenance work that shape the
              site over time.
            </p>
          </Link>

          <a
            href="https://ko-fi.com/respawnerzstudioz"
            target="_blank"
            rel="noreferrer"
            className="card card-link"
          >
            <h3>Support the project</h3>
            <p>
              If DigitBox has been useful, you can support future experiments
              through Ko-fi.
            </p>
          </a>
        </div>
      </section>

      <section className="section">
        <h2>Find DigitBox elsewhere</h2>
        <p>
          These profiles and channels are external links for project updates,
          downloads, and community discussion. They are not required to browse
          or play the projects on this site.
        </p>
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
              <img
                src="/logos/pmc.png"
                alt="Planet Minecraft"
                className="support-icon"
              />
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
              <img
                src="/logos/modrinth.png"
                alt="Modrinth"
                className="support-icon"
              />
            </div>
          </a>
        </div>
      </section>
    </>
  );
}
