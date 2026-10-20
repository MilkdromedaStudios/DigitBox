import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "../components/Icon";
import { isVideoId, likeKey } from "../lib/catalog";
import { formatViews } from "../lib/format";
import { recordHistory } from "../lib/history";
import { shareLink } from "../lib/share";
import { useLikes } from "../lib/useLikes";
import { useVideos } from "../lib/useVideos";

export default function ShortsPage() {
  const router = useRouter();
  const videos = useVideos();
  const [likes, toggleLike] = useLikes();
  const [activeId, setActiveId] = useState("");
  // Players only load after the first tap, so they can start with sound.
  const [started, setStarted] = useState(false);
  const [copiedId, setCopiedId] = useState("");
  const feedRef = useRef(null);
  const jumpedRef = useRef(false);

  const shorts = useMemo(() => videos.filter((video) => video.short), [videos]);
  const requested = typeof router.query.v === "string" && isVideoId(router.query.v) ? router.query.v : "";

  // Open at the short from ?v= (e.g. a shared link or a Shorts shelf card).
  useEffect(() => {
    if (jumpedRef.current || !router.isReady || !shorts.length) return;
    const target = requested && feedRef.current?.querySelector('[data-id="' + requested + '"]');
    if (target) target.scrollIntoView({ block: "start" });
    setActiveId(target ? requested : shorts[0].id);
    jumpedRef.current = true;
  }, [router.isReady, requested, shorts]);

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
  }, [shorts]);

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
        <meta name="description" content="Quick vertical videos on DigitBox. Swipe through Shorts from the channel." />
      </Head>

      {shorts.length === 0 ? (
        <div className="shorts-empty">
          <div className="hub-empty">
            <Icon name="shorts" />
            <h2>No Shorts yet</h2>
            <p>New Shorts from the channel show up here automatically.</p>
            <Link href="/videos" className="hub-pill-btn is-primary">Watch videos instead</Link>
          </div>
        </div>
      ) : (
        <div className="shorts-page" ref={feedRef}>
          {shorts.map((video) => {
            const active = video.id === activeId;
            const liked = likes.includes(likeKey(video));
            return (
              <section key={video.key} className="short-slide" data-id={video.id} aria-label={video.title}>
                <div className="short-stage">
                  {active && started ? (
                    <iframe
                      src={"https://www.youtube-nocookie.com/embed/" + video.id + "?autoplay=1&playsinline=1&loop=1&playlist=" + video.id + "&rel=0&modestbranding=1"}
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
                    {liked ? "Liked" : "Like"}
                  </button>
                  <button type="button" className="short-action" onClick={() => onShare(video)}>
                    <span className="short-action-icon"><Icon name="share" /></span>
                    {copiedId === video.id ? "Copied" : "Share"}
                  </button>
                  <a
                    className="short-action"
                    href={"https://www.youtube.com/shorts/" + video.id}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span className="short-action-icon"><Icon name="external" /></span>
                    YouTube
                  </a>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
