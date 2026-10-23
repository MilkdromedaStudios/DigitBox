import Head from "next/head";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import Icon from "../components/Icon";
import { GameCard, GameCover, SkeletonGrid } from "../components/Cards";
import { gameTags, likeKey } from "../lib/catalog";
import { useGameCatalog } from "../lib/useHubProjects";
import { useLikes } from "../lib/useLikes";

export default function CloudGamesPage() {
  const [likes, toggleLike] = useLikes();
  const [chip, setChip] = useState("All");
  const [search, setSearch] = useState("");
  const searchInputRef = useRef(null);
  const query = search.trim().toLowerCase();
  const { games: allGames, ready } = useGameCatalog();
  // "All" and "Saved" are fixed chips, so a genre with those names isn't one.
  const tags = useMemo(() => gameTags(allGames).filter((tag) => tag !== "All" && tag !== "Saved"), [allGames]);
  // From the catalog as edited, so a hidden or deleted game is never featured.
  const FEATURED = useMemo(() => allGames.find((game) => game.featured) || allGames.find((game) => !game.custom) || null, [allGames]);

  const games = useMemo(() => {
    // Apply the selected category and the search together.
    const filtered = allGames.filter((game) => (
      chip === "All" ||
      (chip === "Saved" ? likes.includes(likeKey(game)) : game.tags.includes(chip))
    ));
    if (!query) return filtered;
    const words = query.split(/\s+/);
    return filtered.filter((game) => {
      const searchable = [game.title, game.genre, ...(game.tags || [])].join(" ").toLowerCase();
      return words.every((word) => searchable.includes(word));
    });
  }, [allGames, chip, likes, query]);

  const featuredLiked = FEATURED ? likes.includes(likeKey(FEATURED)) : false;

  return (
    <>
      <Head>
        <title>Cloud Games - DigitBox</title>
        <meta name="description" content="Play DigitBox cloud games instantly in your browser, from 3D adventures to Scratch games. No downloads." />
      </Head>

      <div className="hub-page">
        <div className="hub-chips" role="tablist" aria-label="Filter games">
          {["All", "Saved", ...tags].map((label) => (
            <button
              key={label}
              type="button"
              role="tab"
              aria-selected={chip === label}
              className={"hub-chip" + (chip === label ? " is-active" : "")}
              onClick={() => setChip(label)}
            >
              {label === "Saved" ? "♥ Saved" : label}
            </button>
          ))}
        </div>

        <div className="dg-search-wrap" role="search" aria-label="Search DigitBox games">
          <label className="dg-search-label" htmlFor="dg-game-search">Find a game</label>
          <div className="dg-search-row">
            <div className="dg-search-field">
              <span className="dg-search-icon" aria-hidden="true">
                <Icon name="search" size={20} />
              </span>
              <input
                id="dg-game-search"
                ref={searchInputRef}
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setSearch("");
                }}
                placeholder={ready ? `Search ${allGames.length} games...` : "Search games..."}
                aria-label="Search games by name or category"
                autoComplete="off"
                spellCheck={false}
              />
              {search.length > 0 && (
                <button
                  className="dg-search-clear"
                  type="button"
                  onClick={() => {
                    setSearch("");
                    searchInputRef.current?.focus();
                  }}
                  aria-label="Clear game search"
                  title="Clear search"
                >
                  <Icon name="close" size={16} />
                </button>
              )}
            </div>
            <span className="dg-search-hint">
              {ready ? (query ? `${games.length} ${games.length === 1 ? "match" : "matches"}` : "Search by title or genre") : "Loading games..."}
            </span>
          </div>
        </div>

        {FEATURED && chip === "All" && !query && (
          <section className="hub-spotlight is-game" style={{ "--h": FEATURED.hue }} aria-label="Featured game">
            <div className="hub-spotlight-copy">
              <span className="hub-kicker">FEATURED CLOUD GAME</span>
              <h1>{FEATURED.title}</h1>
              <div className="hub-spotlight-meta">{FEATURED.genre} • {FEATURED.studio}</div>
              <p>{FEATURED.excerpt}</p>
              <div className="hub-spotlight-actions">
                <Link href={FEATURED.href} className="hub-pill-btn is-primary"><Icon name="play" size={18} />Play now</Link>
                <button type="button" className={"hub-pill-btn" + (featuredLiked ? " is-liked" : "")} aria-pressed={featuredLiked} onClick={() => toggleLike(FEATURED)}>
                  <Icon name={featuredLiked ? "heartFill" : "heart"} size={18} />
                  {featuredLiked ? "Saved" : "Save"}
                </button>
              </div>
            </div>
            <Link href={FEATURED.href} className="hub-spotlight-media" aria-label={"Play " + FEATURED.title}>
              <GameCover game={FEATURED} size="lg" />
              <span className="hub-spotlight-play"><span><Icon name="play" size={30} /></span></span>
            </Link>
          </section>
        )}

        <div className="hub-page-head">
          <div>
            <span className="hub-kicker">CLOUD GAMES</span>
            <h1>{query ? "Search results" : chip === "All" ? "Play instantly" : chip === "Saved" ? "Your saved games" : chip + " games"}</h1>
            <p>Every game loads from the DigitBox cloud and runs right in your browser. No downloads or installs, and most games can autosave on this device.</p>
          </div>
          {ready && <span className="hub-count" aria-live="polite">{games.length} {games.length === 1 ? "game" : "games"}{query ? " found" : ""}</span>}
        </div>

        {!ready ? (
          <SkeletonGrid count={8} />
        ) : games.length > 0 ? (
          <div className="hub-grid">
            {games.map((game) => (
              <GameCard key={game.key} game={game} liked={likes.includes(likeKey(game))} onToggleLike={toggleLike} />
            ))}
          </div>
        ) : (
          <div className="hub-empty">
            <Icon name={query ? "games" : "heart"} />
            <h3>{query ? "No games found" : chip === "Saved" ? "No saved games yet" : "No games in this category"}</h3>
            <p>{query
              ? "Try a different name or clear the search to see all games."
              : chip === "Saved"
                ? "Tap the heart on any game to keep it here."
                : "Choose another category to explore more games."}</p>
            {query && <button type="button" className="hub-pill-btn" onClick={() => setSearch("")}>Clear search</button>}
          </div>
        )}
      </div>
      <style jsx>{`
        .dg-search-wrap {
          margin: 4px 0 28px;
        }
        .dg-search-label {
          display: block;
          margin: 0 0 10px 2px;
          color: var(--muted);
          font-size: .72rem;
          font-weight: 800;
          letter-spacing: .1em;
          text-transform: uppercase;
        }
        .dg-search-row {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px 18px;
        }
        .dg-search-field {
          display: flex;
          align-items: center;
          gap: 12px;
          width: min(100%, 600px);
          min-height: 52px;
          padding: 0 10px 0 17px;
          border: 1px solid var(--hub-line);
          border-radius: 15px;
          background: color-mix(in srgb, var(--surface) 76%, var(--bg));
          box-shadow: 0 6px 24px rgba(0, 0, 0, .1);
          color: var(--text);
          transition: border-color .18s ease, box-shadow .18s ease, background .18s ease;
        }
        .dg-search-field:hover {
          border-color: color-mix(in srgb, var(--text) 22%, transparent);
        }
        .dg-search-field:focus-within {
          border-color: color-mix(in srgb, var(--accent-2) 60%, var(--accent));
          background: var(--surface);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent),
            0 8px 28px rgba(0, 0, 0, .13);
        }
        .dg-search-icon {
          flex: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--muted);
        }
        .dg-search-field:focus-within .dg-search-icon {
          color: var(--accent-2);
        }
        .dg-search-field input {
          flex: 1;
          min-width: 0;
          height: 50px;
          padding: 0;
          border: 0;
          outline: none;
          background: transparent;
          color: var(--text);
          font: inherit;
          font-size: .95rem;
          font-weight: 500;
          appearance: none;
          -webkit-appearance: none;
        }
        .dg-search-field input::placeholder {
          color: var(--muted);
          opacity: .85;
        }
        .dg-search-field input::-webkit-search-cancel-button {
          display: none;
        }
        .dg-search-clear {
          flex: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          padding: 0;
          border: 0;
          border-radius: 9px;
          background: var(--hub-soft);
          color: var(--muted);
          cursor: pointer;
          transition: background .15s ease, color .15s ease;
        }
        .dg-search-clear:hover {
          background: var(--hub-hover);
          color: var(--text);
        }
        .dg-search-clear:focus-visible {
          outline: 2px solid var(--accent-2);
          outline-offset: 2px;
        }
        .dg-search-hint {
          color: var(--muted);
          font-size: .82rem;
          font-weight: 550;
          white-space: nowrap;
        }
        @media (max-width: 640px) {
          .dg-search-wrap { margin-bottom: 20px; }
          .dg-search-field { width: 100%; }
          .dg-search-hint { padding-left: 2px; font-size: .78rem; }
        }
      `}</style>
    </>
  );
}
