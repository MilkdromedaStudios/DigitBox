import Head from "next/head";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ARCHIVE_GAMES, ARCHIVE_GAMES_BY_SLUG } from "../../../lib/archiveGames";
import { extractGameHtml } from "../../../lib/zipGame";

export default function ArchiveGamePage({ game }) {
  const frame = useRef(null);
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setHtml("");
    setError("");
    setLoading(true);

    async function load() {
      try {
        // The uploaded launcher only contained links. Get just the chosen game.
        const response = await fetch(game.url, {
          signal: controller.signal,
          mode: "cors",
          credentials: "omit",
        });
        if (!response.ok) throw new Error("Game host returned HTTP " + response.status + ".");
        const size = Number(response.headers.get("content-length") || 0);
        if (size > 180 * 1024 * 1024) throw new Error("This game is too large to load safely.");
        const blob = await response.arrayBuffer();
        const extracted = await extractGameHtml(blob, game.filename);
        if (!cancelled) {
          setHtml(extracted);
          setLoading(false);
        }
      } catch (cause) {
        if (!cancelled) {
          setLoading(false);
          const message = cause instanceof Error ? cause.message : "Unknown error";
          setError(
            cause instanceof TypeError
              ? "The original game host cannot be reached from this browser (possibly a CORS or network restriction)."
              : message
          );
        }
      }
    }
    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [game.url, game.filename, attempt]);

  const fullscreen = () => {
    const element = frame.current;
    if (element?.requestFullscreen) element.requestFullscreen().catch(() => {});
  };

  return (
    <>
      <Head>
        <title>{game.title} | DigitBox Games</title>
        <meta name="description" content={"Play " + game.title + " on DigitBox."} />
      </Head>
      <main className="archive-shell">
        <div className="archive-bar">
          <Link href="/games" className="archive-back">← All games</Link>
          <span className="archive-title">{game.title}</span>
          <div className="archive-actions">
            {html && <button type="button" onClick={fullscreen}>⛶ Fullscreen</button>}
            <button type="button" onClick={() => setAttempt((n) => n + 1)}>↻ Reload</button>
          </div>
        </div>

        {html ? (
          <iframe
            ref={frame}
            title={game.title}
            srcDoc={html}
            className="archive-frame"
            // Remote, unreviewed HTML must not gain the DigitBox origin.
            // Without allow-same-origin it cannot reach your login or cookies.
            sandbox="allow-scripts allow-forms allow-pointer-lock allow-modals allow-popups allow-downloads"
            allow="fullscreen; autoplay; gamepad"
            allowFullScreen
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="archive-status" role="status">
            {loading ? (
              <>
                <div className="archive-spinner" aria-hidden="true" />
                <h1>Loading {game.title}…</h1>
                <p>Downloading and unpacking this game from its original host.</p>
              </>
            ) : (
              <>
                <h1>Couldn't load this game</h1>
                <p>{error}</p>
                <button type="button" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
                <p className="archive-note">This game is hosted externally, not stored in the DigitBox repository. The external host may remove it or block access.</p>
              </>
            )}
          </div>
        )}
      </main>
      <style jsx>{`
        .archive-shell{height:calc(100dvh - 56px);min-height:400px;background:#080c18;color:#fff;display:flex;flex-direction:column}
        .archive-bar{min-height:58px;display:flex;align-items:center;gap:14px;padding:8px 16px;background:#161c35;border-bottom:1px solid #344065}
        .archive-back{color:#b6dcff;white-space:nowrap;text-decoration:none;font-weight:700}
        .archive-title{font-weight:800;font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .archive-actions{margin-left:auto;display:flex;gap:8px}
        .archive-bar button,.archive-status button{padding:9px 13px;border:1px solid #536da1;border-radius:9px;background:#24375e;color:white;cursor:pointer;font-weight:700}
        .archive-frame{flex:1;width:100%;border:0;background:white;min-height:0}
        .archive-status{flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:28px}
        .archive-status h1{font-size:clamp(20px,4vw,30px);margin:12px 0}
        .archive-status p{max-width:630px;color:#c7d2e9;line-height:1.6}
        .archive-status .archive-note{font-size:12px;margin-top:28px}
        .archive-spinner{width:42px;height:42px;border:4px solid #4d628a;border-top-color:#abdbff;border-radius:50%;animation:archive-spin 1s linear infinite}
        @keyframes archive-spin{to{transform:rotate(360deg)}}
        @media(max-width:650px){.archive-bar{gap:8px;padding:8px}.archive-title{font-size:13px}.archive-bar button{padding:8px;font-size:12px}}
      `}</style>
    </>
  );
}

export async function getStaticPaths() {
  return { paths: ARCHIVE_GAMES.map(({ slug }) => ({ params: { slug } })), fallback: false };
}

export async function getStaticProps({ params }) {
  const game = ARCHIVE_GAMES_BY_SLUG[params.slug];
  if (!game) return { notFound: true };
  return { props: { game } };
}
