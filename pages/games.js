import Head from "next/head";
import Link from "next/link";
import { useMemo, useState } from "react";
import Icon from "../components/Icon";
import { GameCard, GameCover, SkeletonGrid } from "../components/Cards";
import { gameTags, likeKey } from "../lib/catalog";
import { useGameCatalog } from "../lib/useHubProjects";
import { useLikes } from "../lib/useLikes";

export default function CloudGamesPage() {
  const [likes, toggleLike] = useLikes();
  const [chip, setChip] = useState("All");
  const [search, setSearch] = useState("");
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
        <div className="dg-search-wrap" role="search" aria-label="Search DigitBox games">
          <div className="dg-search-field">
            <span className="dg-search-icon" aria-hidden="true">⌕</span>
            <input
              id="dg-game-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={ready ? `Search ${allGames.length} games...` : "Search games..."}
              aria-label="Search games by name or category"
              autoComplete="off"
              spellCheck={false}
            />
            {search.length > 0 && (
              <button
                className="dg-search-clear"
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear game search"
              >
                Clear ✕
              </button>
            )}
          </div>
          <span className="dg-search-hint">Find games instantly by title or category</span>
        </div>
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
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          margin: 0 0 22px;
        }
        .dg-search-field {
          display: flex;
          align-items: center;
          gap: 8px;
          width: min(100%, 620px);
          min-height: 52px;
          padding: 0 14px;
          border: 1px solid #4b5a84;
          border-radius: 14px;
          background: #171f38;
          color: #fff;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .dg-search-field:focus-within {
          border-color: #a6baff;
          box-shadow: 0 0 0 3px rgba(115, 144, 255, 0.18);
        }
        .dg-search-icon {
          color: #a6baff;
          font-size: 32px;
          line-height: 1;
          user-select: none;
        }
        .dg-search-field input {
          flex: 1;
          width: 100%;
          min-width: 0;
          height: 46px;
          border: none;
          outline: none;
          background: transparent;
          color: white;
          font: inherit;
          font-size: 16px;
        }
        .dg-search-field input::placeholder { color: #aebbd5; opacity: 1; }
        .dg-search-field input::-webkit-search-cancel-button { display: none; }
        .dg-search-clear {
          flex-shrink: 0;
          padding: 7px 9px;
          border: 0;
          border-radius: 8px;
          background: #303c60;
          color: #dce7ff;
          font: inherit;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .dg-search-clear:hover { background: #445480; }
        .dg-search-clear:focus-visible { outline: 2px solid #a6baff; outline-offset: 2px; }
        .dg-search-hint { color: #abb9d4; font-size: 13px; }
        @media (max-width: 640px) {
          .dg-search-wrap { margin-bottom: 16px; }
          .dg-search-field { width: 100%; }
          .dg-search-hint { font-size: 12px; }
        }
      `}</style>
    </>
  );
}
