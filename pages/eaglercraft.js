import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import {
  eaglercraftEntryPath,
  eaglercraftVersions,
} from "../data/eaglercraftVersions";

const statusLabels = {
  checking: "Checking…",
  installed: "Ready to play",
  missing: "Build not installed",
};

export default function EaglercraftPage() {
  const [buildStatus, setBuildStatus] = useState(() =>
    Object.fromEntries(eaglercraftVersions.map((version) => [version.slug, "checking"]))
  );
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;

    async function checkBuild(version) {
      const path = eaglercraftEntryPath(version.slug);
      try {
        const response = await fetch(path, {
          method: "HEAD",
          cache: "no-store",
        });
        if (!cancelled) {
          setBuildStatus((current) => ({
            ...current,
            [version.slug]: response.ok ? "installed" : "missing",
          }));
        }
      } catch (_) {
        if (!cancelled) {
          setBuildStatus((current) => ({
            ...current,
            [version.slug]: "missing",
          }));
        }
      }
    }

    eaglercraftVersions.forEach(checkBuild);
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleVersions = useMemo(() => {
    if (filter === "all") return eaglercraftVersions;
    return eaglercraftVersions.filter((version) => version.channel === filter);
  }, [filter]);

  const readyCount = useMemo(
    () => Object.values(buildStatus).filter((status) => status === "installed").length,
    [buildStatus]
  );

  return (
    <>
      <Head>
        <title>Eaglercraft Version Hub · DigitBox</title>
        <meta
          name="description"
          content="DigitBox Eaglercraft version launcher for locally hosted, legally distributable builds."
        />
      </Head>

      <Layout>
        <div className="eagler-page">
          <section className="eagler-hero">
            <span className="eagler-kicker">DIGITBOX / MINECRAFT LAB</span>
            <h1>Eaglercraft Version Hub</h1>
            <p>
              One launcher for the major Eaglercraft branches and commonly used
              legacy/community ports. DigitBox automatically enables a Play button
              when a build is present in the matching public folder.
            </p>

            <div className="eagler-stats" aria-label="Eaglercraft build status">
              <div><strong>{eaglercraftVersions.length}</strong><span>version slots</span></div>
              <div><strong>{readyCount}</strong><span>installed</span></div>
              <div><strong>{eaglercraftVersions.length - readyCount}</strong><span>waiting for builds</span></div>
            </div>
          </section>

          <section className="eagler-toolbar" aria-label="Version filters">
            {[
              ["all", "All versions"],
              ["major", "Major"],
              ["community", "Legacy / community"],
            ].map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={filter === value ? "active" : ""}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </section>

          <section className="eagler-grid">
            {visibleVersions.map((version) => {
              const status = buildStatus[version.slug] || "checking";
              const installed = status === "installed";
              const entryPath = eaglercraftEntryPath(version.slug);

              return (
                <article className="eagler-card" key={version.slug}>
                  <div className="eagler-card-top">
                    <span className={`eagler-channel ${version.channel}`}>
                      {version.channel === "major" ? "MAJOR" : "COMMUNITY"}
                    </span>
                    <span className={`eagler-status ${status}`}>{statusLabels[status]}</span>
                  </div>

                  <h2>{version.name}</h2>
                  <p className="eagler-version">Minecraft {version.minecraftVersion}</p>
                  <p className="eagler-note">{version.note}</p>

                  <div className="eagler-path">
                    <span>Build path</span>
                    <code>{entryPath}</code>
                  </div>

                  <div className="eagler-actions">
                    {installed ? (
                      <a className="eagler-play" href={entryPath}>Play</a>
                    ) : (
                      <span className="eagler-play disabled" aria-disabled="true">
                        Add build to enable
                      </span>
                    )}
                    {version.sourceUrl && (
                      <a
                        className="eagler-source"
                        href={version.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Source / archive ↗
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
          </section>

          <section className="eagler-info">
            <h2>How DigitBox loads a version</h2>
            <p>
              Put an authorized web build at
              <code> public/eaglercraft-builds/&lt;version&gt;/index.html </code>.
              This page checks that file automatically and turns the matching card
              into a launcher. The game files stay separate from the React/Next.js
              code, so adding or updating one version does not require changing the
              launcher.
            </p>
            <p>
              The repository does not bundle third-party Minecraft game binaries or
              assets. Only add builds and assets you have permission to redistribute.
            </p>
          </section>
        </div>
      </Layout>

      <style jsx global>{`
        .eagler-page {
          --eg-cyan: #72e8ff;
          --eg-violet: #aa91ff;
          --eg-green: #86f7b1;
          padding: 1rem 0 3rem;
        }
        .eagler-hero {
          position: relative;
          overflow: hidden;
          padding: clamp(1.6rem, 5vw, 4rem);
          border: 1px solid rgba(255,255,255,.16);
          border-radius: 32px;
          background:
            radial-gradient(circle at 15% 15%, rgba(88,224,255,.22), transparent 34%),
            radial-gradient(circle at 88% 18%, rgba(170,120,255,.23), transparent 32%),
            linear-gradient(145deg, rgba(12,29,54,.88), rgba(17,15,45,.9));
          box-shadow: 0 28px 70px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.12);
        }
        .eagler-hero h1 {
          margin: .35rem 0 .75rem;
          max-width: 850px;
          font-size: clamp(2.2rem, 6vw, 4.8rem);
          line-height: .96;
          letter-spacing: -.05em;
        }
        .eagler-hero p {
          max-width: 760px;
          color: rgba(238,247,255,.82);
          font-size: 1.02rem;
          line-height: 1.7;
        }
        .eagler-kicker {
          color: var(--eg-cyan);
          font-size: .72rem;
          font-weight: 850;
          letter-spacing: .17em;
        }
        .eagler-stats {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: .8rem;
          margin-top: 1.6rem;
          max-width: 650px;
        }
        .eagler-stats div {
          padding: .95rem 1rem;
          border: 1px solid rgba(255,255,255,.14);
          border-radius: 18px;
          background: rgba(255,255,255,.065);
          backdrop-filter: blur(16px);
        }
        .eagler-stats strong { display:block; font-size:1.55rem; }
        .eagler-stats span { color:rgba(238,247,255,.65); font-size:.78rem; }
        .eagler-toolbar {
          display:flex;
          flex-wrap:wrap;
          gap:.55rem;
          margin:1.2rem 0;
        }
        .eagler-toolbar button {
          appearance:none;
          border:1px solid rgba(255,255,255,.15);
          border-radius:999px;
          padding:.62rem .95rem;
          color:#eef7ff;
          background:rgba(255,255,255,.055);
          cursor:pointer;
          font-weight:750;
        }
        .eagler-toolbar button:hover,
        .eagler-toolbar button.active {
          background:rgba(114,232,255,.14);
          border-color:rgba(114,232,255,.42);
        }
        .eagler-grid {
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:1rem;
        }
        .eagler-card {
          min-width:0;
          padding:1.25rem;
          border:1px solid rgba(255,255,255,.14);
          border-radius:24px;
          background:linear-gradient(145deg,rgba(255,255,255,.085),rgba(255,255,255,.035));
          box-shadow:0 18px 50px rgba(0,0,0,.2), inset 0 1px 0 rgba(255,255,255,.1);
          backdrop-filter:blur(18px) saturate(140%);
        }
        .eagler-card-top { display:flex;justify-content:space-between;align-items:center;gap:.65rem; }
        .eagler-channel,.eagler-status {
          display:inline-flex;
          align-items:center;
          min-height:27px;
          padding:.32rem .55rem;
          border-radius:999px;
          font-size:.64rem;
          font-weight:850;
          letter-spacing:.09em;
        }
        .eagler-channel.major { color:#b7f5ff;background:rgba(88,220,255,.13); }
        .eagler-channel.community { color:#d9ccff;background:rgba(167,126,255,.13); }
        .eagler-status.checking { color:#ffe6a0;background:rgba(255,205,82,.11); }
        .eagler-status.installed { color:#b9ffd1;background:rgba(74,220,128,.12); }
        .eagler-status.missing { color:#cad6e6;background:rgba(255,255,255,.07); }
        .eagler-card h2 { margin:1rem 0 .25rem;font-size:1.5rem; }
        .eagler-version { margin:0;color:var(--eg-cyan);font-weight:800; }
        .eagler-note { min-height:3.1rem;color:rgba(238,247,255,.72);line-height:1.55; }
        .eagler-path {
          display:grid;
          gap:.35rem;
          margin-top:1rem;
          padding:.8rem;
          border-radius:14px;
          background:rgba(0,0,0,.18);
          border:1px solid rgba(255,255,255,.08);
        }
        .eagler-path span { color:rgba(238,247,255,.52);font-size:.68rem;text-transform:uppercase;letter-spacing:.1em; }
        .eagler-path code { overflow-wrap:anywhere;color:#dff9ff;font-size:.78rem; }
        .eagler-actions { display:flex;flex-wrap:wrap;gap:.6rem;margin-top:1rem; }
        .eagler-play,.eagler-source {
          display:inline-flex;
          align-items:center;
          justify-content:center;
          min-height:40px;
          padding:.62rem .9rem;
          border-radius:12px;
          text-decoration:none;
          font-weight:800;
        }
        .eagler-play { color:#07111f;background:linear-gradient(135deg,var(--eg-cyan),#9cfdc0); }
        .eagler-play.disabled { color:rgba(238,247,255,.46);background:rgba(255,255,255,.065);cursor:not-allowed; }
        .eagler-source { color:#eef7ff;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.055); }
        .eagler-info {
          margin-top:1.2rem;
          padding:1.4rem;
          border:1px solid rgba(255,255,255,.13);
          border-radius:24px;
          background:rgba(255,255,255,.045);
        }
        .eagler-info h2 { margin-top:0; }
        .eagler-info p { color:rgba(238,247,255,.72);line-height:1.65; }
        .eagler-info code { color:#c8f6ff; }
        @media (max-width: 760px) {
          .eagler-grid { grid-template-columns:1fr; }
          .eagler-stats { grid-template-columns:1fr; }
          .eagler-note { min-height:0; }
        }
      `}</style>
    </>
  );
}
