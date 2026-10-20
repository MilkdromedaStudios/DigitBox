import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "../components/Icon";
import { CatalogCard } from "../components/Cards";
import { GAMES, likeKey, normalizeVideo } from "../lib/catalog";
import { HISTORY_UPDATED_EVENT, clearHistory, readHistory } from "../lib/history";
import { readNotes, writeNotes } from "../lib/notes";
import { useLikes } from "../lib/useLikes";
import { useVideos } from "../lib/useVideos";

// Resolve a stored "video:<id>" / "game:<slug>" key back to a catalog item.
function resolve(key, title, videos) {
  const [kind, ...rest] = String(key).split(":");
  const id = rest.join(":");
  if (kind === "video") return videos.find((video) => video.id === id) || normalizeVideo({ id, title });
  if (kind === "game") return GAMES.find((game) => game.slug === id) || null;
  return GAMES.find((game) => game.slug === key) || null;
}

function Section({ id, icon, title, action, children }) {
  return (
    <section className="library-section" id={id}>
      <div className="hub-shelf-head">
        <h2><Icon name={icon} />{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function LibraryPage() {
  const videos = useVideos();
  const [likes, toggleLike] = useLikes();
  const [history, setHistory] = useState([]);
  const [notes, setNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState(true);
  const hydratedRef = useRef(false);

  useEffect(() => {
    const sync = () => setHistory(readHistory());
    sync();
    setNotes(readNotes());
    hydratedRef.current = true;
    window.addEventListener(HISTORY_UPDATED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(HISTORY_UPDATED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return undefined;
    const timer = setTimeout(() => {
      writeNotes(notes);
      setNotesSaved(true);
    }, 400);
    return () => clearTimeout(timer);
  }, [notes]);

  const historyItems = useMemo(
    () => history.map((entry) => resolve(entry.key, entry.title, videos)).filter(Boolean),
    [history, videos]
  );
  const likedItems = useMemo(
    () => likes.map((key) => resolve(key, "", videos)).filter(Boolean),
    [likes, videos]
  );

  const card = (item) => (
    <CatalogCard key={item.key} item={item} layout="grid" liked={likes.includes(likeKey(item))} onToggleLike={toggleLike} />
  );

  return (
    <>
      <Head>
        <title>Library - DigitBox</title>
        <meta name="robots" content="noindex" />
      </Head>

      <div className="hub-page">
        <div className="hub-page-head">
          <div>
            <span className="hub-kicker">YOU</span>
            <h1>Library</h1>
            <p>Your history, likes and notes. They&apos;re saved in this browser, so they stay private to this device.</p>
          </div>
        </div>

        <Section
          id="history"
          icon="history"
          title="History"
          action={historyItems.length > 0 && (
            <button type="button" className="hub-pill-btn" onClick={clearHistory}>
              <Icon name="trash" size={16} />Clear history
            </button>
          )}
        >
          {historyItems.length > 0 ? (
            <div className="hub-grid">{historyItems.slice(0, 24).map(card)}</div>
          ) : (
            <div className="hub-empty"><Icon name="history" /><h3>Nothing watched yet</h3><p>Videos you watch and games you play will show up here.</p></div>
          )}
        </Section>

        <Section id="liked" icon="heart" title="Liked">
          {likedItems.length > 0 ? (
            <div className="hub-grid">{likedItems.map(card)}</div>
          ) : (
            <div className="hub-empty">
              <Icon name="heart" />
              <h3>No likes yet</h3>
              <p>Tap the heart on a video or game to save it here.</p>
              <Link href="/games" className="hub-pill-btn is-primary">Find a game</Link>
            </div>
          )}
        </Section>

        <Section id="notes" icon="list" title="Jot things down" action={<span className="hub-count">{notesSaved ? "Saved on this device" : "Saving…"}</span>}>
          <textarea
            className="auth-input notes-area"
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value);
              setNotesSaved(false);
            }}
            placeholder="A scratchpad for anything: game codes, video ideas, to-dos… kept on this device."
            rows={6}
            aria-label="Personal notes"
          />
        </Section>
      </div>
    </>
  );
}
