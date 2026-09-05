import Head from "next/head";
import Link from "next/link";

export default function Home() {
  return (
    <>
      <Head>
        <title>DigitBox — DEEPFORGE</title>
        <meta
          name="description"
          content="Play DEEPFORGE, a mining, engineering, city-building and strategy prototype from DigitBox. Existing games, Minecraft projects, AI tools and experiments are still here too."
        />
      </Head>

      <section className="hero">
        <div className="hero-content">
          <div className="hero-box">
            <p className="post-meta">NEW FLAGSHIP PROTOTYPE</p>
            <h1>DEEPFORGE</h1>
            <p>
              Start with one drill. Dig for ore, solve engineering problems,
              upgrade your rig, build a mining city, raid rival companies, and
              climb the league.
            </p>
            <div className="hero-scroller">
              <span>Mine.</span>
              <span>Engineer.</span>
              <span>Build.</span>
              <span>Compete.</span>
            </div>
            <div style={{ marginTop: "1rem", display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
              <Link href="/frontier" className="auth-btn action-btn">
                Play DEEPFORGE
              </Link>
              <Link href="/gallery" className="btn-base action-btn">
                Browse existing projects
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <h2>A game first. Learning inside the systems.</h2>
        <p>
          DEEPFORGE is being designed as a real progression game rather than a
          quiz site with points. Math and engineering decisions improve your
          refinery, mining rig, raid strength, and city economy, so learning has
          a visible purpose in the world.
        </p>
        <div className="card-grid">
          <article className="card">
            <h3>⛏ Dig deeper</h3>
            <p>Navigate a mine, break tougher rock, find rarer ore, and decide when to sell.</p>
          </article>
          <article className="card">
            <h3>⚙ Build an empire</h3>
            <p>Upgrade drills, cargo, refineries, workshops, defenses, and your city skyline.</p>
          </article>
          <article className="card">
            <h3>▣ Engineer boosts</h3>
            <p>Ratios, algebra, geometry, and percentages become machine and combat advantages.</p>
          </article>
          <article className="card">
            <h3>⚔ Climb the league</h3>
            <p>Challenge ghost rivals in this prototype; real player cities and rankings come next.</p>
          </article>
        </div>
      </section>

      <section className="section">
        <h2>DigitBox projects are staying</h2>
        <p>
          DEEPFORGE is the new main game, but DigitBox is still the home for the
          browser games, Minecraft work, AI tools, experiments, and build notes
          already on the site.
        </p>
        <div className="card-grid">
          <Link href="/gallery" className="card card-link">
            <h3>Project Gallery</h3>
            <p>Existing games, Minecraft projects, and experiments.</p>
          </Link>
          <Link href="/ai" className="card card-link">
            <h3>DigitBox AI</h3>
            <p>Keep experimenting with the AI tools already built into DigitBox.</p>
          </Link>
          <Link href="/appgpt" className="card card-link">
            <h3>AppGPT</h3>
            <p>The Telegram Mini App builder remains available as its own product surface.</p>
          </Link>
        </div>
      </section>

      <section className="section">
        <h2>Prototype roadmap</h2>
        <div className="card-grid">
          <article className="card"><h3>Now</h3><p>Mining, upgrades, city economy, learning boosts, ghost raids, local saves.</p></article>
          <article className="card"><h3>Next</h3><p>Accounts, cloud saves, real leaderboards, player city snapshots, seasons.</p></article>
          <article className="card"><h3>Later</h3><p>Automation, programmable mining drones, factories, clans, and deeper science systems.</p></article>
        </div>
      </section>
    </>
  );
}