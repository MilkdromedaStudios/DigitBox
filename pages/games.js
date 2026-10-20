import Head from "next/head";
import Link from "next/link";
import { useMemo, useState } from "react";
import Icon from "../components/Icon";
import { GameCard, GameCover } from "../components/Cards";
import { GAMES, GAME_TAGS, likeKey } from "../lib/catalog";
import { useLikes } from "../lib/useLikes";

const FEATURED = GAMES.find((game) => game.featured) || GAMES[0];

export default function CloudGamesPage() {
  const [likes, toggleLike] = useLikes();
  const [chip, setChip] = useState("All");

  const games = useMemo(() => {
    if (chip === "Saved") return GAMES.filter((game) => likes.includes(likeKey(game)));
    if (chip === "All") return GAMES;
    return GAMES.filter((game) => game.tags.includes(chip));
  }, [chip, likes]);

  const featuredLiked = FEATURED ? likes.includes(likeKey(FEATURED)) : false;

  return (
    <>
      <Head>
        <title>Cloud Games - DigitBox</title>
        <meta name="description" content="Play DigitBox cloud games instantly in your browser: Eaglercraft, Bedwars, 3D Scratch games and more. No downloads." />
      </Head>

      <div className="hub-page">
        <div className="hub-chips" role="tablist" aria-label="Filter games">
          {["All", "Saved", ...GAME_TAGS].map((label) => (
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

        {FEATURED && chip === "All" && (
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
            <h1>{chip === "All" ? "Play instantly" : chip === "Saved" ? "Your saved games" : chip + " games"}</h1>
            <p>Every game loads from the DigitBox cloud and runs right in your browser. No downloads or installs, and most games can autosave on this device.</p>
          </div>
          <span className="hub-count" aria-live="polite">{games.length} {games.length === 1 ? "game" : "games"}</span>
        </div>

        {games.length > 0 ? (
          <div className="hub-grid">
            {games.map((game) => (
              <GameCard key={game.key} game={game} liked={likes.includes(likeKey(game))} onToggleLike={toggleLike} />
            ))}
          </div>
        ) : (
          <div className="hub-empty">
            <Icon name="heart" />
            <h3>No saved games yet</h3>
            <p>Tap the heart on any game to keep it here.</p>
          </div>
        )}
      </div>
    </>
  );
}
