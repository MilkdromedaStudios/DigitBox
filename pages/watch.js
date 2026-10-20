import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import Icon from "../components/Icon";
import { Avatar, GameCard, VideoCard } from "../components/Cards";
import { GAMES, channelUrl, isVideoId, likeKey } from "../lib/catalog";
import { formatDate, formatViews } from "../lib/format";
import { recordHistory } from "../lib/history";
import { shareLink } from "../lib/share";
import { useLikes } from "../lib/useLikes";
import { useVideos } from "../lib/useVideos";

const LONG_DESCRIPTION = 220;
const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/g;

// Plain-text description with its URLs turned into links (React escapes the rest).
function Linkified({ text }) {
  return String(text)
    .split(URL_PATTERN)
    .map((part, index) =>
      index % 2 === 1 ? (
        <a key={index} href={part} target="_blank" rel="noopener noreferrer nofollow">{part}</a>
      ) : (
        part
      )
    );
}

export default function WatchPage() {
  const router = useRouter();
  const videos = useVideos();
  const [likes, toggleLike] = useLikes();
  const [expanded, setExpanded] = useState(false);
  const [shareState, setShareState] = useState("");

  const id = typeof router.query.v === "string" ? router.query.v : "";
  const validId = isVideoId(id);

  const video = useMemo(() => {
    if (!validId) return null;
    return (
      videos.find((item) => item.id === id) || {
        kind: "video",
        key: "video:" + id,
        id,
        title: "YouTube video",
        channel: "YouTube",
        channelId: "",
        published: null,
        description: "",
        views: null,
        short: false,
        href: "/watch?v=" + id,
      }
    );
  }, [videos, id, validId]);

  useEffect(() => {
    setExpanded(false);
    setShareState("");
  }, [id]);

  useEffect(() => {
    if (video) recordHistory(video.key, video.title);
  }, [video]);

  if (!router.isReady) return <div className="watch" aria-busy="true"><div className="watch-player" /></div>;

  if (!video) {
    return (
      <div className="hub-page">
        <div className="hub-empty">
          <Icon name="videos" />
          <h2>Video not found</h2>
          <p>That link doesn&apos;t point to a video. Pick something from the Videos page instead.</p>
          <Link href="/videos" className="hub-pill-btn is-primary">Browse videos</Link>
        </div>
      </div>
    );
  }

  const liked = likes.includes(likeKey(video));
  const upNext = videos.filter((item) => item.id !== video.id);
  const games = [...GAMES].sort((a, b) => Number(b.featured) - Number(a.featured) || a.order - b.order).slice(0, 4);
  const description = video.description.trim();
  const isLong = description.length > LONG_DESCRIPTION || description.split("\n").length > 3;
  const youtubeUrl = "https://www.youtube.com/watch?v=" + video.id;
  const embedUrl = "https://www.youtube-nocookie.com/embed/" + video.id + "?autoplay=1&rel=0&modestbranding=1&playsinline=1";

  async function onShare() {
    const result = await shareLink(video.href, video.title);
    setShareState(result === "copied" ? "Link copied" : result === "failed" ? "Couldn't copy" : "");
    if (result === "copied") window.setTimeout(() => setShareState(""), 2200);
  }

  return (
    <>
      <Head>
        <title>{video.title + " - DigitBox"}</title>
        <meta name="description" content={description.slice(0, 160) || "Watch " + video.title + " on DigitBox."} />
      </Head>

      <div className="watch">
        <div className="watch-primary">
          <div className={"watch-player" + (video.short ? " is-short" : "")}>
            <iframe
              key={video.id}
              src={embedUrl}
              title={video.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>

          <div className="watch-body">
            <h1>{video.title}</h1>

            <div className="watch-bar">
              <div className="watch-channel">
                <Avatar label={video.channel} size={40} />
                <div>
                  <b>{video.channel}</b>
                  <small>YouTube channel</small>
                </div>
                <a
                  className="hub-pill-btn is-inverse"
                  href={channelUrl(video.channelId) + "?sub_confirmation=1"}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Subscribe
                </a>
              </div>

              <div className="watch-actions">
                <button
                  type="button"
                  className={"hub-pill-btn" + (liked ? " is-liked" : "")}
                  aria-pressed={liked}
                  onClick={() => toggleLike(video)}
                >
                  <Icon name={liked ? "heartFill" : "heart"} size={18} />
                  {liked ? "Liked" : "Like"}
                </button>
                <button type="button" className="hub-pill-btn" onClick={onShare}>
                  <Icon name="share" size={18} />
                  {shareState || "Share"}
                </button>
                <a className="hub-pill-btn" href={youtubeUrl} target="_blank" rel="noopener noreferrer">
                  <Icon name="external" size={18} />
                  YouTube
                </a>
              </div>
            </div>

            <div className={"watch-desc" + (isLong && !expanded ? " is-collapsed" : "")}>
              <b>
                {[formatViews(video.views), formatDate(video.published)].filter(Boolean).join(" • ") || "On YouTube"}
              </b>
              {description && <p><Linkified text={description} /></p>}
              {isLong && (
                <button type="button" onClick={() => setExpanded((value) => !value)}>
                  {expanded ? "Show less" : "Show more"}
                </button>
              )}
            </div>

            <p className="watch-note">
              Comments live on YouTube.{" "}
              <a href={youtubeUrl} target="_blank" rel="noopener noreferrer">Join the conversation there</a>.
            </p>
          </div>
        </div>

        <aside className="watch-side" aria-label="Up next">
          {upNext.length > 0 && <h2>Up next</h2>}
          {upNext.map((item) => <VideoCard key={item.key} video={item} layout="compact" />)}
          <h2>Cloud games</h2>
          {games.map((game) => <GameCard key={game.key} game={game} layout="compact" />)}
          <Link href="/games" className="hub-pill-btn">All cloud games <Icon name="chevron" size={16} /></Link>
        </aside>
      </div>
    </>
  );
}
