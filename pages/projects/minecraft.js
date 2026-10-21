import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

const SOURCE = "https://github.com/MilkdromedaStudios/all-of-eaglercraft";
const CATEGORIES = ["All", "Vanilla", "WASM", "Clients", "Modpacks", "Classic"];
const FEATURED = [
  { needle: "EaglercraftX 1.8 EN", title: "EAGLERCRAFT 1.8", sub: "THE CLASSIC", art: "classic" },
  { needle: "Eaglercraft 1.12.2 WASM", title: "EAGLERCRAFT 1.12", sub: "THE ADVENTURE", art: "adventure" },
  { needle: "Eaglercraft 26.2 Modded", title: "EAGLERCRAFT 26.2", sub: "THE NEW ERA", art: "future" }
];

function cleanName(filename) {
  return filename.replace(/__[a-f0-9]{12,}\.html$/i, "").replace(/\.html$/i, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
}
function classify(filename) {
  const s = filename.toLowerCase();
  if (/alpha|beta|v1\.0|1\.2\.5|1\.5\.2|1\.11|classic/.test(s)) return "Classic";
  if (/skyfactory|magic|explore|lite|tech|ultimate|modpack|modded|engineering|biomes/.test(s)) return "Modpacks";
  if (/client|astra|dragon|wurst|zeta|prism|camo|demon|hacked|gx|solar|reborn|archimedes/.test(s)) return "Clients";
  if (/wasm|jspi/.test(s)) return "WASM";
  return "Vanilla";
}
function prettySize(bytes) {
  return bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB";
}
function VersionCard({ game, onPlay, number }) {
  return (
    <article className="mc-version-card" style={{ "--mc-delay": String(Math.min(number, 16) * 38) + "ms" }}>
      <div className="mc-card-art" data-kind={game.category}>
        <span className="mc-card-glyph" aria-hidden="true">{game.category === "Clients" ? "⚔" : game.category === "WASM" ? "✦" : game.category === "Modpacks" ? "⛏" : game.category === "Classic" ? "▣" : "◆"}</span>
        <span className="mc-card-art-tag">{game.category}</span>
      </div>
      <div className="mc-version-body">
        <h3 title={game.name}>{game.name}</h3>
        <div className="mc-version-meta"><span>HTML EDITION</span><span>{prettySize(game.size)}</span></div>
        <div className="mc-version-actions">
          <button type="button" className="mc-block-button mc-small" onClick={() => onPlay(game)}><span>▶</span> PLAY</button>
          <a className="mc-text-link" href={SOURCE + "/blob/main/" + encodeURIComponent(game.file)} target="_blank" rel="noreferrer" aria-label={"View " + game.name + " on GitHub"}>SOURCE ↗</a>
        </div>
      </div>
    </article>
  );
}

export default function MinecraftPage() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(null);
  const [frameKey, setFrameKey] = useState(0);
  const [gameLoading, setGameLoading] = useState(false);
  const playRef = useRef(null);
  const searchRef = useRef(null);
  const controller = useRef(null);

  useEffect(() => {
    controller.current = new AbortController();
    let live = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/minecraft/catalog", { signal: controller.current.signal });
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.files)) throw new Error(data.error || "Could not read the game repository.");
        if (live) setGames(data.files.map((f) => ({
          ...f,
          name: cleanName(f.name),
          file: f.name,
          category: classify(f.name)
        })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })));
      } catch (err) {
        if (live && err.name !== "AbortError") setError(err.message || "Could not load games.");
      } finally {
        if (live) setLoading(false);
      }
    }
    load();
    return () => { live = false; controller.current?.abort(); };
  }, []);

  useEffect(() => {
    if (!active) return;
    const onKey = (event) => { if (event.key === "Escape") setActive(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  useEffect(() => {
    document.body.classList.toggle("mc-modal-open", Boolean(active));
    return () => document.body.classList.remove("mc-modal-open");
  }, [active]);

  const filtered = useMemo(() => games.filter((game) => (category === "All" || game.category === category) && (!query.trim() || game.name.toLowerCase().includes(query.trim().toLowerCase()))), [games, category, query]);
  const featured = useMemo(() => FEATURED.map((card) => ({ ...card, game: games.find((g) => g.file.includes(card.needle)) || games.find((g) => g.file.toLowerCase().includes(card.needle.toLowerCase())) })).filter((card) => card.game), [games]);

  function play(game) {
    if (!game) {
      document.getElementById("mc-library")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    setActive(game);
    setFrameKey((n) => n + 1);
    setGameLoading(true);
  }
  function filterTo(name) {
    setCategory(name);
    document.getElementById("mc-library")?.scrollIntoView({ behavior: "smooth" });
  }
  function fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else playRef.current?.requestFullscreen?.().catch(() => {});
  }
  const gameUrl = active ? "/api/minecraft/play?file=" + encodeURIComponent(active.file) : "";

  return (
    <>
      <Head>
        <title>Minecraft — DigitBox</title>
        <meta name="description" content="Play Eaglercraft Minecraft editions, clients, and modpacks straight from DigitBox. Browse versions and launch a game in your browser." />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet" />
      </Head>
      <div className="mc-root" id="mc-home">
        <header className="mc-nav">
          <div className="mc-nav-left"><Link className="mc-brand" href="/games" aria-label="Back to DigitBox games">eaglercraft <span className="mc-creeper" aria-hidden="true">▦</span></Link>
            <nav className="mc-links" aria-label="Minecraft navigation">
              <a className="mc-link mc-selected" href="#mc-home">Home</a>
              <a className="mc-link" href="#mc-library">Play</a>
              <button className="mc-link" type="button" onClick={() => filterTo("Clients")}>Clients</button>
              <button className="mc-link" type="button" onClick={() => filterTo("Modpacks")}>Modpacks</button>
            </nav>
          </div>
          <div className="mc-nav-right"><span className="mc-nav-edition">JAVA · BROWSER EDITION</span><Link href="/games" className="mc-nav-back">← DIGITBOX</Link><a href="#mc-library" className="mc-block-button mc-top-play">▶ PLAY NOW</a></div>
        </header>

        <main>
          <section className="mc-hero" aria-labelledby="mc-hero-title">
            <div className="mc-world-bg" aria-hidden="true"><i className="mc-star mc-star-a" /><i className="mc-star mc-star-b" /><i className="mc-star mc-star-c" /><i className="mc-hill mc-hill-a" /><i className="mc-hill mc-hill-b" /><i className="mc-hill mc-hill-c" /></div>
            <div className="mc-hero-content">
              <div className="mc-eyebrow"><span className="mc-live-dot" /> MINECRAFT IN YOUR BROWSER</div>
              <h1 id="mc-hero-title">PLAY<br /><span>MINECRAFT</span><br />ANYWHERE.</h1>
              <p className="mc-hero-copy">Explore blocky worlds, survive adventures, and try community-made clients. No installation. Just pick a build and play.</p>
              <div className="mc-hero-actions"><a href="#mc-library" className="mc-block-button mc-hero-play">▶ PLAY NOW <span>↗</span></a><button type="button" onClick={() => filterTo("All")} className="mc-outline-button">▦ BROWSE EDITIONS</button></div>
              <div className="mc-hero-stats"><span>◈ <strong>{loading ? "..." : games.length}</strong> builds available</span><span>✦ Instant browser play</span><span>⌘ Powered by GitHub</span></div>
            </div>
            <div className="mc-feature-stack" aria-label="Featured Minecraft versions">
              {(featured.length ? featured : FEATURED).map((card, i) => (
                <button type="button" onClick={() => play(card.game)} className={"mc-feature mc-feature-" + i} key={card.title} aria-label={"Play " + card.title}>
                  <div className={"mc-feature-image mc-feature-" + card.art} />
                  <div className="mc-feature-sheen" />
                  <span className="mc-feature-type">{card.sub}</span>
                  <span className="mc-feature-footer"><span>{card.title}</span><b className="mc-feature-play">▶</b></span>
                </button>
              ))}
            </div>
            <div className="mc-scroll-cue">SCROLL TO EXPLORE <span>↓</span></div>
          </section>

          <section id="mc-library" className="mc-library">
            <div className="mc-section-overline">▰ CHOOSE YOUR ADVENTURE</div>
            <div className="mc-library-heading"><div><h2>GAME <span>LIBRARY</span></h2><p>Every available HTML build from the public <a href={SOURCE} target="_blank" rel="noreferrer">all-of-eaglercraft ↗</a> repository. The catalog refreshes automatically.</p></div><div className="mc-total"><strong>{loading ? "…" : games.length}</strong><span>AVAILABLE BUILDS</span></div></div>
            <div className="mc-toolbar">
              <div className="mc-filters" role="group" aria-label="Filter Minecraft games">
                {CATEGORIES.map((name) => <button key={name} className={"mc-filter" + (category === name ? " mc-filter-on" : "")} type="button" onClick={() => setCategory(name)} aria-pressed={category === name}>{name}</button>)}
              </div>
              <div className="mc-search"><span aria-hidden="true">⌕</span><input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search builds..." aria-label="Search builds" type="search" />{query && <button type="button" onClick={() => { setQuery(""); searchRef.current?.focus(); }} aria-label="Clear search">×</button>}</div>
            </div>
            <div className="mc-results-line"><span>{loading ? "CONNECTING TO GAME REPOSITORY..." : error ? "CONNECTION ERROR" : "SHOWING " + filtered.length + " OF " + games.length + " BUILDS"}</span><span className="mc-green">● {error ? "OFFLINE" : "GITHUB SOURCE"}</span></div>
            {loading ? <div className="mc-status"><span className="mc-spinner" /> Fetching Minecraft builds from GitHub...</div> :
             error ? <div className="mc-status mc-error"><span>⚠ {error}</span><button onClick={() => window.location.reload()} className="mc-block-button" type="button">↻ RETRY</button></div> :
             filtered.length ? <div className="mc-version-grid">{filtered.map((game, index) => <VersionCard game={game} onPlay={play} number={index} key={game.file} />)}</div> :
             <div className="mc-status">No builds match your search. <button type="button" onClick={() => { setQuery(""); setCategory("All"); }}>Show all editions</button></div>}
          </section>
        </main>
        <footer className="mc-footer"><div><span className="mc-footer-brand">DIGITBOX<span> × </span>MINECRAFT</span><p>Unofficial browser launcher. Community game builds retain their respective authorship.</p></div><a href={SOURCE} target="_blank" rel="noreferrer">VIEW GAME REPOSITORY ↗</a></footer>
      </div>

      {active && <div className="mc-player-backdrop" role="presentation">
        <div className="mc-player" ref={playRef} role="dialog" aria-modal="true" aria-label={"Playing " + active.name}>
          <div className="mc-player-toolbar"><div className="mc-player-title"><span>▣</span><div><strong>{active.name}</strong><small>PLAYING FROM GITHUB · {prettySize(active.size)}</small></div></div><div className="mc-player-buttons"><button type="button" onClick={() => { setFrameKey((k) => k + 1); setGameLoading(true); }} title="Restart build">↻ <span>RESTART</span></button><button type="button" onClick={fullscreen} title="Fullscreen">⛶ <span>FULLSCREEN</span></button><a href={gameUrl} target="_blank" rel="noopener noreferrer" title="Open game in another tab">↗ <span>NEW TAB</span></a><button type="button" onClick={() => { if (document.fullscreenElement) document.exitFullscreen?.(); setActive(null); }} title="Exit game" className="mc-close">✕ <span>EXIT</span></button></div></div>
          <div className="mc-player-stage">{gameLoading && <div className="mc-game-wait"><span className="mc-spinner" /><strong>LOADING WORLD...</strong><small>Larger builds may take a moment to load.</small></div>}
            <iframe key={frameKey} title={"Minecraft: " + active.name} src={gameUrl} onLoad={() => setGameLoading(false)} allow="autoplay; fullscreen; gamepad" allowFullScreen sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-downloads allow-forms allow-modals" />
          </div>
        </div>
      </div>}
    </>
  );
}
