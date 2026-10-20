import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import Icon from "../components/Icon";
import { SkeletonGrid, VideoCard } from "../components/Cards";
import { CHANNELS, YOUTUBE_CATEGORIES, channelUrl } from "../lib/catalog";
import { useVideos } from "../lib/useVideos";
import { useYouTubeFeed } from "../lib/useYouTube";
import { YouTubeAttribution } from "../components/YouTubeLogo";

const CHANNEL = CHANNELS[0];
const CHANNEL_CHIP = "channel";
const POPULAR = { id: "", label: "Popular" };

// Only categories YouTube currently has a chart for (they vary by country).
let categoryCache = null;
function useCategories() {
  const [categories, setCategories] = useState(categoryCache || []);
  useEffect(() => {
    if (categoryCache) return undefined;
    let active = true;
    fetch("/api/youtube?feed=categories")
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        const ids = new Set((body?.categories || []).map((category) => category.id));
        const found = YOUTUBE_CATEGORIES.filter((category) => ids.has(category.id));
        // Only a real answer is kept for the session; a failure is retried next visit.
        if (found.length) categoryCache = found;
        if (active) setCategories(found);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return categories;
}

export default function VideosPage() {
  const [chip, setChip] = useState("");
  const categories = useCategories();
  const chips = [POPULAR, ...categories, ...(CHANNEL ? [{ id: CHANNEL_CHIP, label: CHANNEL.name }] : [])];
  const ownVideos = useVideos();
  const onChannel = chip === CHANNEL_CHIP;
  const feed = useYouTubeFeed("videos", { category: chip }, { enabled: !onChannel });

  const ownLong = useMemo(() => ownVideos.filter((video) => !video.short), [ownVideos]);
  // Before the API key is set up (or if YouTube is unavailable) the page
  // shows the channel's uploads instead of an empty grid.
  const youtubeOff = feed.configured === false || (Boolean(feed.error) && !feed.videos.length && !feed.loading);
  const showChannel = onChannel || youtubeOff;
  const list = showChannel ? ownLong : feed.videos.filter((video) => !video.short);
  const label = showChannel ? (CHANNEL ? CHANNEL.name : "Videos") : chips.find((item) => item.id === chip)?.label || "Popular";

  return (
    <>
      <Head>
        <title>Videos - DigitBox</title>
        <meta name="description" content="Popular videos across gaming, music, movies and more, plus uploads from the DigitBox channel." />
      </Head>

      <div className="hub-page">
        {feed.configured !== false && (
          <div className="hub-chips" role="tablist" aria-label="Video categories">
            {chips.map((item) => (
              <button
                key={item.id || "popular"}
                type="button"
                role="tab"
                aria-selected={chip === item.id}
                className={"hub-chip" + (chip === item.id ? " is-active" : "")}
                onClick={() => setChip(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

        <div className="hub-page-head">
          <div>
            <span className="hub-kicker">VIDEOS</span>
            <h1>{label}</h1>
            <p>{showChannel ? "Uploads from DigitBox's own channel." : "What's popular on YouTube right now."}</p>
          </div>
          <div className="hub-shelf-actions">
            <YouTubeAttribution href={showChannel && CHANNEL ? channelUrl(CHANNEL.id) : undefined} />
            {showChannel && CHANNEL && (
              <a className="hub-pill-btn is-inverse" href={channelUrl(CHANNEL.id) + "?sub_confirmation=1"} target="_blank" rel="noopener noreferrer">
                Subscribe
              </a>
            )}
          </div>
        </div>

        {!showChannel && feed.loading && !feed.videos.length ? (
          <SkeletonGrid count={12} />
        ) : list.length === 0 ? (
          <div className="hub-empty"><Icon name="videos" /><h3>Nothing here right now</h3><p>Try another category.</p></div>
        ) : (
          <>
            <div className="hub-grid">{list.map((video) => <VideoCard key={video.key} video={video} />)}</div>
            {!showChannel && feed.hasMore && (
              <div className="hub-more">
                <button type="button" className="hub-pill-btn" onClick={feed.loadMore} disabled={feed.loading}>
                  {feed.loading ? "Loading…" : "Show more"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
