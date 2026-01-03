// digitbox/pages/index.js

export default function Home() {
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
          <div className="card">
            <h3>Coming Soon</h3>
            <p>Posts will appear here once the database is connected.</p>
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

          <a href="/projects" className="card card-link">
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
              <span className="support-text">Ko‑fi</span>
            </div>
          </a>

          <a
            href="https://www.planetminecraft.com/member/error99998252/"
            target="_blank"
            rel="noreferrer"
          >
            <div className="support-pill">
              <img src="/logos/pmc.png" alt="Planet Minecraft" className="support-icon" />
              <span className="support-text">Planet Minecraft</span>
            </div>
          </a>

          <a
            href="https://www.youtube.com/channel/UCxFlo666aCncPAtBw-IzeOw/"
            target="_blank"
            rel="noreferrer"
          >
            <div className="support-pill">
              <img src="/logos/youtube.png" alt="YouTube" className="support-icon" />
              <span className="support-text">YouTube</span>
            </div>
          </a>

          <a
            href="https://modrinth.com/user/Error9998252"
            target="_blank"
            rel="noreferrer"
          >
            <div className="support-pill">
              <img src="/logos/modrinth.png" alt="Modrinth" className="support-icon" />
              <span className="support-text">Modrinth</span>
            </div>
          </a>
        </div>
      </section>
    </>
  );
}
