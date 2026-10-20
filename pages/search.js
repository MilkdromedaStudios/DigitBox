import Head from "next/head";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";
import Icon from "../components/Icon";
import { CatalogCard } from "../components/Cards";
import { likeKey, searchCatalog } from "../lib/catalog";
import { useLikes } from "../lib/useLikes";
import { useVideos } from "../lib/useVideos";

const FILTERS = [
  ["all", "All"],
  ["video", "Videos"],
  ["game", "Cloud Games"],
  ["post", "Posts"],
];

export default function SearchPage() {
  const router = useRouter();
  const videos = useVideos();
  const [likes, toggleLike] = useLikes();
  const [kind, setKind] = useState("all");
  const query = typeof router.query.q === "string" ? router.query.q.trim() : "";

  const results = useMemo(() => searchCatalog(query, videos), [query, videos]);
  const shown = kind === "all" ? results : results.filter((item) => item.kind === kind);

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
            {query && <p>{shown.length} {shown.length === 1 ? "result" : "results"}</p>}
          </div>
        </div>

        {!router.isReady ? null : !query ? (
          <div className="hub-empty"><Icon name="search" /><h3>What do you want to watch or play?</h3><p>Search for videos, Shorts, cloud games and posts using the bar at the top.</p></div>
        ) : shown.length === 0 ? (
          <div className="hub-empty"><Icon name="search" /><h3>No results</h3><p>Try a different word, or check the spelling.</p></div>
        ) : (
          <div className="hub-list">
            {shown.map((item) => (
              <CatalogCard key={item.key} item={item} layout="row" liked={likes.includes(likeKey(item))} onToggleLike={toggleLike} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
