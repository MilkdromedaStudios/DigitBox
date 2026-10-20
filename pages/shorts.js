import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "../components/Icon";
import { isVideoId, likeKey, normalizeVideo, uniqueVideos } from "../lib/catalog";
import { formatViews } from "../lib/format";
import { recordHistory } from "../lib/history";
import { shareLink } from "../lib/share";
import { useLikes } from "../lib/useLikes";
import { useVideos } from "../lib/useVideos";
import { lookupYouTube, useYouTubeFeed } from "../lib/useYouTube";
import { YouTubeAttribution } from "../components/YouTubeLogo";

// Each extra page of YouTube Shorts is a 100-unit search, so stop paging here.
const MAX_YOUTUBE_SHORTS = 72;

export default function ShortsPage() {
  const router = useRouter();
  const ownVideos = useVideos();
  const ytShorts = useYouTubeFeed("shorts");
  const [likes, toggleLike] = useLikes();
  const [activeId, setActiveId] = useState("");
  // Players only load after the first tap, so they can start with sound.
  const [started, setStarted] = useState(false);
  const [copiedId, setCopiedId] = useState("");
  // A Short opened by link that isn't in the feed (from search, a share…).
  const [linked, setLinked] = useState(null);
  const feedRef = useRef(null);
  const jumpedRef = useRef(false);

  const requested = typeof router.query.v === "string" && isVideoId(router.query.v) ? router.query.v : "";
  const ownShorts = useMemo(() => ownVideos.filter((video) => video.short), [ownVideos]);
  const shorts = useMemo(() => uniqueVideos(linked ? [linked] : [], ytShorts.videos, ownShorts), [linked, ytShorts.videos, ownShorts]);
  // Settled once the first response is in (configured stays set while more load).
  const ready = router.isReady && (ytShorts.configured !== null || !ytShorts.loading);

  useEffect(() => {
    if (!ready || !requested || linked || shorts.some((video) => video.id === requested)) return;
    setLinked(normalizeVideo({ id: requested, title: "Short", short: true }));
    lookupYouTube([requested]).then((found) => {
      const video = found.get(requested);
      if (video) setLinked({ ...video, short: true });
    });
  }, [ready, requested, linked, shorts]);

  // Open at the requested Short once the feed has settled.
  useEffect(() => {
    if (jumpedRef.current || !ready || !shorts.length) return;
    if (requested && !shorts.some((video) => video.id === requested)) return; // wait for `linked`
    const target = requested && feedRef.current?.querySelector('[data-id="' + requested + '"]');
    if (target) target.scrollIntoView({ block: "start" });
    setActiveId(target ? requested : shorts[0].id);
    jumpedRef.current = true;
  }, [ready, requested, shorts]);

  useEffect(() => {
    const feed = feedRef.current;
    if (!feed) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.getAttribute("data-id"));
        }
      },
      { root: feed, threshold: 0.6 }
    );
    feed.querySelectorAll("[data-id]").forEach((slide) => observer.observe(slide));
    return () => observer.disconnect();
  }, [ready, shorts]);

  // Fetch the next page of YouTube Shorts when nearing the end.
  const { hasMore, loading, loadMore } = ytShorts;
  useEffect(() => {
    const index = shorts.findIndex((video) => video.id === activeId);
    if (index >= 0 && index >= shorts.length - 3 && hasMore && !loading && ytShorts.videos.length < MAX_YOUTUBE_SHORTS) loadMore();
  }, [activeId, shorts, hasMore, loading, loadMore, ytShorts.videos.length]);

  useEffect(() => {
    const video = shorts.find((item) => item.id === activeId);
    if (started && video) recordHistory(video.key, video.title);
  }, [started, activeId, shorts]);

  async function onShare(video) {
    const result = await shareLink("/shorts?v=" + video.id, video.title);
    if (result === "copied") {
      setCopiedId(video.id);
      window.setTimeout(() => setCopiedId(""), 2200);
    }
  }

  return (
    <>
      <Head>
        <title>Shorts - DigitBox</title>
        <meta name="description" content="Swipe through popular Shorts, plus Shorts from the DigitBox channel." />
      </Head>

      {/* Wait for the YouTube feed so the order doesn't change under the viewer. */}
      {!ready || shorts.length === 0 ? (
        <div className="shorts-empty">
          {!ready ? (
            <div className="short-slide"><div className="short-stage skeleton" /></div>
          ) : (
            <div className="hub-empty">
              <Icon name="shorts" />
              <h2>No Shorts yet</h2>
              <p>New Shorts show up here automatically.</p>
              <Link href="/videos" className="hub-pill-btn is-primary">Watch videos instead</Link>
            </div>
          )}
        </div>
      ) : (
        <div className="shorts-page" ref={feedRef}>
          {shorts.map((video) => {
            const active = video.id === activeId;
            const liked = likes.includes(likeKey(video));
            return (
              <section key={video.key} className="short-slide" data-id={video.id} aria-label={video.title}>
                <div className="short-stage">
                  {active && started && !video.embeddable ? (
                    // The owner turned off playback on other sites for this Short.
                    <div className="watch-blocked">
                      <img src={video.thumb} alt="" />
                      <div>
                        <p>This Short can only be played on YouTube.</p>
                        <a className="hub-pill-btn is-primary" href={"https://www.youtube.com/shorts/" + video.id} target="_blank" rel="noopener noreferrer">
                          <Icon name="external" size={18} />Watch on YouTube
                        </a>
                      </div>
                    </div>
                  ) : active && started ? (
                    <iframe
                      src={"https://www.youtube-nocookie.com/embed/" + video.id + "?autoplay=1&playsinline=1&loop=1&playlist=" + video.id + "&rel=0"}
                      title={video.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  ) : (
                    <>
                      <img src={video.thumb} alt="" loading="lazy" decoding="async" />
                      <button
                        type="button"
                        className="short-poster"
                        aria-label={"Play " + video.title}
                        onClick={() => {
                          setStarted(true);
                          setActiveId(video.id);
                        }}
                      >
                        <span><Icon name="play" size={30} /></span>
                        <span className="short-poster-info">
                          <b>{video.title}</b>
                          <small>{video.channel}{video.views != null ? " • " + formatViews(video.views) : ""}</small>
                        </span>
                      </button>
                    </>
                  )}
                </div>

                <div className="short-actions">
                  <button
                    type="button"
                    className={"short-action" + (liked ? " is-liked" : "")}
                    aria-pressed={liked}
                    onClick={() => toggleLike(video)}
                  >
                    <span className="short-action-icon"><Icon name={liked ? "heartFill" : "heart"} /></span>
                    {liked ? "Saved" : "Save"}
                  </button>
                  <button type="button" className="short-action" onClick={() => onShare(video)}>
                    <span className="short-action-icon"><Icon name="share" /></span>
                    {copiedId === video.id ? "Copied" : "Share"}
                  </button>
                  <YouTubeAttribution href={"https://www.youtube.com/shorts/" + video.id} label="Watch on" />
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
