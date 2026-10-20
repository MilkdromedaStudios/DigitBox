import Head from "next/head";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";
import Icon from "../components/Icon";
import { CatalogCard, SkeletonGrid } from "../components/Cards";
import { likeKey, searchCatalog, uniqueVideos } from "../lib/catalog";
import { useLikes } from "../lib/useLikes";
import { useVideos } from "../lib/useVideos";
import { useYouTubeFeed } from "../lib/useYouTube";
import { YouTubeAttribution } from "../components/YouTubeLogo";

const FILTERS = [
  ["all", "All"],
  ["video", "Videos"],
  ["game", "Games"],
  ["post", "Posts"],
];

// Every YouTube results page is a 100-unit search; three pages is plenty.
const MAX_YOUTUBE_RESULTS = 60;

export default function SearchPage() {
  const router = useRouter();
  const ownVideos = useVideos();
  const [likes, toggleLike] = useLikes();
  const [kind, setKind] = useState("all");
  const query = typeof router.query.q === "string" ? router.query.q.trim() : "";
  const youtube = useYouTubeFeed("search", { q: query }, { enabled: Boolean(query) });

  // YouTube's policies don't allow other content to be mixed into YouTube
  // results, so DigitBox's games and posts get their own section and every
  // video (the channel's own uploads included) goes under the YouTube one.
  const matches = useMemo(() => searchCatalog(query, ownVideos), [query, ownVideos]);
  const local = matches.filter((item) => item.kind !== "video");
  const localShown = kind === "all" ? local : local.filter((item) => item.kind === kind);
  const ownMatches = matches.filter((item) => item.kind === "video");
  const youtubeShown = kind === "all" || kind === "video" ? uniqueVideos(ownMatches, youtube.videos) : [];
  const youtubeOn = youtube.configured !== false;
  const total = localShown.length + youtubeShown.length;

  const card = (item) => (
    <CatalogCard key={item.key} item={item} layout="row" liked={likes.includes(likeKey(item))} onToggleLike={toggleLike} />
  );

  return (
    <>
      <Head>
        <title>{(query ? query + " - " : "") + "Search - DigitBox"}</title>
        <meta name="robots" content="noindex" />
      </Head>

      <div className="hub-page">
        <div className="hub-chips" role="tablist" aria-label="Filter results">
          {FILTERS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={kind === value}
              className={"hub-chip" + (kind === value ? " is-active" : "")}
              onClick={() => setKind(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="hub-page-head">
          <div>
            <span className="hub-kicker">SEARCH</span>
            <h1>{query ? "Results for “" + query + "”" : "Search DigitBox"}</h1>
          </div>
        </div>

        {!router.isReady ? null : !query ? (
          <div className="hub-empty"><Icon name="search" /><h3>What do you want to watch or play?</h3><p>Search YouTube videos, games and posts using the bar at the top.</p></div>
        ) : (
          <>
            {localShown.length > 0 && (
              <section className="hub-shelf">
                <div className="hub-shelf-head"><h2><Icon name="home" />On DigitBox</h2></div>
                <div className="hub-list">{localShown.map(card)}</div>
              </section>
            )}

            {(youtubeOn || youtubeShown.length > 0) && (kind === "all" || kind === "video") && (
              <section className="hub-shelf">
                <div className="hub-shelf-head">
                  <h2><Icon name="videos" />From YouTube</h2>
                  <YouTubeAttribution href={"https://www.youtube.com/results?search_query=" + encodeURIComponent(query)} label="Results from" />
                </div>
                {youtubeOn && youtube.loading && !youtubeShown.length ? (
                  <SkeletonGrid count={4} />
                ) : youtubeOn && youtube.error && !youtubeShown.length ? (
                  <p className="hub-count">YouTube search isn&apos;t available right now. Try again in a little while.</p>
                ) : youtubeShown.length ? (
                  <>
                    <div className="hub-list">{youtubeShown.map(card)}</div>
                    {youtube.hasMore && youtube.videos.length < MAX_YOUTUBE_RESULTS && (
                      <div className="hub-more">
                        <button type="button" className="hub-pill-btn" onClick={youtube.loadMore} disabled={youtube.loading}>
                          {youtube.loading ? "Loading…" : "More results"}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="hub-count">No YouTube videos matched.</p>
                )}
              </section>
            )}

            {total === 0 && !youtube.loading && !(youtubeOn && youtube.error) && (
              <div className="hub-empty"><Icon name="search" /><h3>No results</h3><p>Try a different word, or check the spelling.</p></div>
            )}
          </>
        )}
      </div>
    </>
  );
}
