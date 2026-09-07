import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import KubeLiquidGlass from "../components/KubeLiquidGlass";

export default function BetaPage() {
  const [updates, setUpdates] = useState([]);
  const [updatesError, setUpdatesError] = useState("");

  useEffect(() => {
    document.body.classList.add("beta-liquid-active");
    return () => document.body.classList.remove("beta-liquid-active");
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadUpdates() {
      setUpdatesError("");
      try {
        const [projectsRes, postsRes] = await Promise.all([
          fetch("/api/content/list?type=project&limit=6"),
          fetch("/api/content/list?type=post&limit=6"),
        ]);
        const [projectsPayload, postsPayload] = await Promise.all([
          projectsRes.json(),
          postsRes.json(),
        ]);
        if (!projectsRes.ok || !postsRes.ok) {
          if (!cancelled) setUpdatesError(projectsPayload.error || postsPayload.error || "Failed to load latest news");
          return;
        }
        const merged = [
          ...(projectsPayload.items || []).map((item) => ({ ...item, contentType: "project" })),
          ...(postsPayload.items || []).map((item) => ({ ...item, contentType: "post" })),
        ]
          .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))
          .slice(0, 7);
        if (!cancelled) setUpdates(merged);
      } catch (_) {
        if (!cancelled) setUpdatesError("Failed to load latest news");
      }
    }
    loadUpdates();
    return () => { cancelled = true; };
  }, []);


  const heroNews = useMemo(() => updates.slice(0, 3), [updates]);

  function itemHref(item) {
    return item.contentType === "project"
      ? "/projects/" + encodeURIComponent(item.slug)
      : "/posts/" + encodeURIComponent(item.slug);
  }

  return (
    <>
      <Head>
        <title>DigitBox</title>
        <meta name="description" content="DigitBox — projects, games, experiments, and DEEPFORGE." />
        <meta name="theme-color" content="#07111f" />
      </Head>

      <KubeLiquidGlass />

      <Layout>
        <div className="beta-liquid-site">
          <section className="hero beta-liquid-hero">
            <div className="hero-overlay" />
            <div className="hero-content">
              <div className="hero-box beta-liquid-hero-glass">
                <span className="beta-kicker">DIGITBOX / BETA CHANNEL</span>
                <h1>DigitBox</h1>
                <p>Fresh projects, build notes, experiments, and releases from DigitBox.</p>
                <div className="beta-news-pills">
                  {updatesError && <span className="beta-news-empty">{updatesError}</span>}
                  {!updatesError && heroNews.length === 0 && <span className="beta-news-empty">Loading the latest news…</span>}
                  {heroNews.map((item) => (
                    <Link key={item.contentType + "-hero-" + item.path} href={itemHref(item)} className="beta-news-pill">
                      <small>{item.contentType === "project" ? "PROJECT" : "POST"}</small>
                      <b>{item.title}</b>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <Link href="/beta/beta" className="beta-deepforge-pill" aria-label="Open DEEPFORGE private beta">
            <div className="beta-deepforge-orb" aria-hidden="true"><span>DF</span></div>
            <div className="beta-deepforge-copy">
              <span className="beta-kicker">FEATURED PRIVATE BETA</span>
              <h2>DEEPFORGE</h2>
              <p>One shared mining world. Dig, build your city, upgrade real mining gear, survive the night, join clans, and fight for the underground.</p>
              <div className="beta-deepforge-tags">
                <span>⛏ Shared world</span><span>🏙 Player cities</span><span>⚔ PvP + zombies</span><span>☁ Account saves</span>
              </div>
            </div>
            <div className="beta-deepforge-cta"><b>PLAY</b><span>→</span></div>
          </Link>

          <section className="section beta-liquid-section">
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
              <article className="card beta-liquid-card"><h3>Browser games</h3><p>Play experiments without downloading a launcher. Open a project from the gallery, try its controls, and use the save tools when the game supports browser storage.</p></article>
              <article className="card beta-liquid-card"><h3>Minecraft projects</h3><p>Explore mods, launchers, and server-side experiments built around practical gameplay problems and cross-platform testing.</p></article>
              <article className="card beta-liquid-card"><h3>AI and web tools</h3><p>Try AppGPT for building Telegram Mini Apps and read the latest notes about new features, fixes, and experiments.</p></article>
            </div>
          </section>

          <section className="section beta-liquid-section">
            <div className="beta-section-heading"><div><span className="beta-kicker">LIVE FEED</span><h2>Latest News</h2></div><Link href="/posts" className="beta-mini-pill">All posts →</Link></div>
            <p>New projects and posts appear here as they are published.</p>
            <div className="card-grid">
              {updatesError && <p className="post-meta">{updatesError}</p>}
              {!updatesError && updates.length === 0 && <div className="card beta-liquid-card"><h3>No updates yet</h3><p>Recent projects and posts will show up here once published.</p></div>}
              {updates.map((item) => (
                <Link key={item.contentType + "-" + item.path} href={itemHref(item)} className="card card-link beta-liquid-card">
                  <h3>{item.title}</h3>
                  <p className="post-meta">{item.contentType === "project" ? "Project" : "Post"}{item.updated_at ? " • " + new Date(item.updated_at).toLocaleDateString() : ""}</p>
                  {item.excerpt && <p>{item.excerpt}</p>}
                </Link>
              ))}
            </div>
          </section>

          <section className="section beta-liquid-section">
            <h2>How to explore DigitBox</h2>
            <p>The site is organized around three simple ways to use it: play a project, read the development notes, or build something of your own.</p>
            <div className="card-grid">
              <Link href="/gallery" className="card card-link beta-liquid-card"><h3>Browse the gallery</h3><p>Search the project collection, save favorites on this device, and open a project when you are ready to play.</p></Link>
              <Link href="/posts" className="card card-link beta-liquid-card"><h3>Read the build notes</h3><p>Posts explain updates, experiments, fixes, and decisions that do not fit inside a project preview.</p></Link>
              <Link href="/appgpt" className="card card-link beta-liquid-card"><h3>Try AppGPT</h3><p>Describe a Telegram Mini App, generate one evolving HTML file, preview it, debug it, and keep working on the same chat.</p></Link>
            </div>
          </section>

          <section className="section beta-liquid-section">
            <h2>Highlights</h2>
            <div className="card-grid">
              <Link href="/gallery" className="card card-link beta-liquid-card"><h3>Projects</h3><p>Browse games, Minecraft work, and coding experiments where creativity meets hands-on testing.</p></Link>
              <Link href="/changelog" className="card card-link beta-liquid-card"><h3>Changelog</h3><p>See the larger improvements and maintenance work that shape the site over time.</p></Link>
              <a href="https://ko-fi.com/respawnerzstudioz" target="_blank" rel="noreferrer" className="card card-link beta-liquid-card"><h3>Support the project</h3><p>If DigitBox has been useful, you can support future experiments through Ko-fi.</p></a>
            </div>
          </section>

          <section className="section beta-liquid-section">
            <h2>Find DigitBox elsewhere</h2>
            <p>These profiles and channels are external links for project updates, downloads, and community discussion.</p>
            <div className="support-grid">
              <a href="https://ko-fi.com/respawnerzstudioz" target="_blank" rel="noreferrer"><div className="support-pill beta-liquid-card"><img src="/logos/kofi.png" alt="Ko-fi" className="support-icon" /></div></a>
              <a href="https://www.planetminecraft.com/member/error99998252/" target="_blank" rel="noreferrer"><div className="support-pill beta-liquid-card"><img src="/logos/pmc.png" alt="Planet Minecraft" className="support-icon" /></div></a>
              <a href="https://www.youtube.com/channel/UCxFlo666aCncPAtBw-IzeOw/" target="_blank" rel="noreferrer"><div className="support-pill beta-liquid-card"><img src="/logos/youtube.png" alt="YouTube" className="support-icon" /></div></a>
              <a href="https://modrinth.com/user/Error9998252" target="_blank" rel="noreferrer"><div className="support-pill beta-liquid-card"><img src="/logos/modrinth.png" alt="Modrinth" className="support-icon" /></div></a>
            </div>
          </section>
        </div>
      </Layout>

      <style jsx global>{`
        .beta-liquid-active {
          --beta-cyan: #74e8ff;
          --beta-violet: #a88cff;
          --beta-ink: #07111f;
          background:
            radial-gradient(circle at 12% 8%, rgba(82,225,255,.24), transparent 28%),
            radial-gradient(circle at 89% 17%, rgba(166,111,255,.24), transparent 32%),
            radial-gradient(circle at 50% 72%, rgba(41,143,255,.15), transparent 35%),
            linear-gradient(155deg,#07111f 0%,#0c1730 42%,#130d2b 100%);
          background-attachment: fixed;
        }
        .beta-liquid-active .page { background: transparent; }
        .beta-liquid-active .main { padding-top: 1.1rem; }
        .beta-liquid-active .content { max-width: 1120px; }
        .beta-liquid-active .header {
          top: 10px;
          margin: 0 12px;
          border: 1px solid rgba(255,255,255,.2);
          border-radius: 999px;
          background: rgba(13,24,45,.45);
          box-shadow: 0 18px 55px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.18);
          backdrop-filter: blur(24px) saturate(155%);
        }
        .beta-liquid-active .nav a,.beta-liquid-active .btn-base {
          border-radius: 999px;
          background: rgba(255,255,255,.07);
          border-color: rgba(255,255,255,.16);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.12);
        }
        .beta-liquid-active .nav a:hover,.beta-liquid-active .btn-base:hover { background: rgba(255,255,255,.14); }
        .beta-liquid-active .footer {
          width: min(880px,calc(100% - 24px));
          margin: 2rem auto 1rem;
          border: 1px solid rgba(255,255,255,.15);
          border-radius: 999px;
          background: rgba(13,24,45,.42);
          backdrop-filter: blur(22px) saturate(150%);
        }
        .beta-liquid-site { padding-bottom: 1rem; }
        .beta-liquid-site .hero {
          min-height: 430px;
          display: flex;
          align-items: center;
          padding: clamp(2rem,6vw,5rem) clamp(1rem,4vw,3rem);
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 34px;
          box-shadow: 0 34px 85px rgba(0,0,0,.35);
        }
        .beta-liquid-site .hero::after { background: linear-gradient(105deg,rgba(3,10,22,.78),rgba(6,10,25,.18),rgba(16,8,37,.58)); }
        .beta-liquid-hero-glass {
          max-width: 720px;
          padding: clamp(1.3rem,3vw,2.1rem);
          border-radius: 30px;
          border: 1px solid rgba(255,255,255,.24);
          background: linear-gradient(135deg,rgba(255,255,255,.14),rgba(255,255,255,.055));
          box-shadow: 0 25px 65px rgba(0,0,0,.32), inset 0 1px 0 rgba(255,255,255,.24);
          backdrop-filter: blur(28px) saturate(160%);
        }
        .beta-liquid-hero-glass h1 { margin:.2rem 0 .4rem;font-size:clamp(2.4rem,7vw,5rem);letter-spacing:-.055em;line-height:.95; }
        .beta-kicker { display:inline-block;font-size:.7rem;font-weight:850;letter-spacing:.17em;color:#a9eefe; }
        .beta-news-pills { display:grid;gap:.55rem;margin-top:1.15rem; }
        .beta-news-pill,.beta-news-empty {
          display:flex;align-items:center;gap:.8rem;width:100%;padding:.72rem .95rem;border-radius:999px;
          border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.07);color:#eef7ff;
          box-shadow:inset 0 1px 0 rgba(255,255,255,.12);backdrop-filter:blur(12px);
        }
        .beta-news-pill { transition:transform .18s ease,background .18s ease; }
        .beta-news-pill:hover { transform:translateX(5px);background:rgba(255,255,255,.13); }
        .beta-news-pill small { color:#8fe7ff;font-size:.58rem;letter-spacing:.12em;min-width:58px; }
        .beta-news-pill b { overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.88rem; }
        .beta-deepforge-pill {
          position:relative;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:clamp(1rem,3vw,2.2rem);
          width:100%;min-height:220px;margin:1.35rem 0;padding:clamp(1.3rem,4vw,2.4rem);overflow:hidden;
          border-radius:30px;border:1px solid rgba(255,255,255,.23);color:#f1f8ff;
          background-image:
            linear-gradient(90deg,rgba(5,10,12,.90) 0%,rgba(7,11,13,.66) 46%,rgba(6,9,10,.72) 100%),
            url("/images/deepforge-pill-bg.webp");
          background-size:cover;
          background-position:center;
          background-repeat:no-repeat;
          box-shadow:0 30px 75px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.22);backdrop-filter:blur(28px) saturate(150%);
          transition:transform .25s ease,border-color .25s ease;
        }
        .beta-deepforge-pill::after { content:"";position:absolute;inset:-80% -10%;background:conic-gradient(from 220deg,transparent,rgba(92,225,181,.16),transparent 25%,rgba(255,182,76,.13),transparent 55%);pointer-events:none; }
        .beta-deepforge-pill:hover { transform:translateY(-3px) scale(1.006);border-color:rgba(144,244,211,.42); }
        .beta-deepforge-pill>* { position:relative;z-index:1; }
        .beta-deepforge-orb { width:clamp(86px,12vw,132px);height:clamp(86px,12vw,132px);display:grid;place-items:center;border-radius:50%;background:radial-gradient(circle at 30% 25%,#9af4d6,#225e52 48%,#0a2624 73%);box-shadow:inset 0 1px 12px rgba(255,255,255,.38),0 18px 55px rgba(67,217,172,.2);border:1px solid rgba(199,255,237,.42); }
        .beta-deepforge-orb span { font-weight:950;font-size:clamp(1.5rem,4vw,3rem);letter-spacing:-.06em;color:#eafff8;text-shadow:0 2px 15px rgba(0,0,0,.35); }
        .beta-deepforge-copy h2 { margin:.15rem 0 .4rem;font-size:clamp(2rem,5vw,4rem);letter-spacing:-.05em;line-height:1; }
        .beta-deepforge-copy p { max-width:720px;margin:.35rem 0;color:#b6c6c8;line-height:1.5; }
        .beta-deepforge-tags { display:flex;gap:.45rem;flex-wrap:wrap;margin-top:.8rem; }
        .beta-deepforge-tags span,.beta-mini-pill { padding:.42rem .68rem;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#d6e7e7;font-size:.7rem; }
        .beta-deepforge-cta { width:78px;height:78px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2); }
        .beta-deepforge-cta b { font-size:.62rem;letter-spacing:.1em; }.beta-deepforge-cta span { font-size:1.5rem;line-height:.7; }
        .beta-liquid-site .section {
          border-radius:30px;border-color:rgba(255,255,255,.14);
          background:linear-gradient(135deg,rgba(255,255,255,.075),rgba(255,255,255,.025));
          box-shadow:0 22px 60px rgba(0,0,0,.22),inset 0 1px 0 rgba(255,255,255,.1);backdrop-filter:blur(22px) saturate(140%);
        }
        .beta-liquid-card { border-color:rgba(255,255,255,.12)!important;background:linear-gradient(145deg,rgba(255,255,255,.075),rgba(255,255,255,.025))!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.1),0 12px 35px rgba(0,0,0,.13)!important;backdrop-filter:blur(14px);transition:transform .18s ease,border-color .18s ease!important; }
        .beta-liquid-card:hover { transform:translateY(-3px);border-color:rgba(118,226,255,.28)!important; }
        .beta-section-heading { display:flex;align-items:end;justify-content:space-between;gap:1rem; }.beta-section-heading h2 { margin:.15rem 0 0; }
        .beta-mini-pill { white-space:nowrap; }
        @media(max-width:760px){
          .beta-liquid-active .header{border-radius:24px;margin:0 8px;top:7px}.beta-liquid-active .footer{border-radius:24px}.beta-liquid-site .hero{min-height:390px;border-radius:25px}.beta-liquid-hero-glass{border-radius:24px}.beta-deepforge-pill{grid-template-columns:1fr;border-radius:34px;text-align:left}.beta-deepforge-orb{width:86px;height:86px}.beta-deepforge-cta{position:absolute;right:20px;top:20px;width:58px;height:58px}.beta-deepforge-copy{padding-right:0}.beta-deepforge-tags{padding-right:0}.beta-section-heading{align-items:flex-start;flex-direction:column}.beta-liquid-site .section{border-radius:24px}
        }
        @media(prefers-reduced-motion:reduce){.beta-news-pill,.beta-deepforge-pill,.beta-liquid-card{transition:none!important}}
      `}</style>
    </>
  );
}
