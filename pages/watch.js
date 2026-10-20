import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import Icon from "../components/Icon";
import { Avatar, GameCard, VideoCard } from "../components/Cards";
import { GAMES, channelUrl, isVideoId, likeKey, normalizeVideo, uniqueVideos } from "../lib/catalog";
import { formatDate, formatViews } from "../lib/format";
import { recordHistory } from "../lib/history";
import { shareLink } from "../lib/share";
import { useLikes } from "../lib/useLikes";
import { useVideos } from "../lib/useVideos";
import { findLoadedVideo, lookupYouTube, useYouTubeFeed } from "../lib/useYouTube";
import { YouTubeAttribution } from "../components/YouTubeLogo";

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
  const ownVideos = useVideos();
  const recommended = useYouTubeFeed("recommended");
  const [likes, toggleLike] = useLikes();
  const [expanded, setExpanded] = useState(false);
  const [shareState, setShareState] = useState("");
  const [lookedUp, setLookedUp] = useState(null);
  // The player loads on the viewer's click, so nothing is sent to YouTube
  // (and no YouTube cookies are set) until they choose to watch.
  const [playing, setPlaying] = useState(false);

  const id = typeof router.query.v === "string" ? router.query.v : "";
  const validId = isVideoId(id);

  // The channel's own videos and anything a YouTube feed already loaded show
  // instantly; any other video id is looked up (1 quota unit, cached).
  const known = useMemo(
    () => (validId ? ownVideos.find((item) => item.id === id) || findLoadedVideo(id) : null),
    // recommended.videos: findLoadedVideo reads the feed cache it fills.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ownVideos, id, validId, recommended.videos]
  );
  const video = validId ? known || (lookedUp?.id === id ? lookedUp : normalizeVideo({ id, title: "YouTube video" })) : null;

  useEffect(() => {
    if (!validId || known) return undefined;
    let active = true;
    lookupYouTube([id]).then((found) => {
      if (active && found.get(id)) setLookedUp(found.get(id));
    });
    return () => {
      active = false;
    };
  }, [id, validId, known]);

  useEffect(() => {
    setExpanded(false);
    setShareState("");
    setPlaying(false);
  }, [id]);

  const historyKey = video?.key;
  const historyTitle = video?.title;
  useEffect(() => {
    if (historyKey) recordHistory(historyKey, historyTitle);
  }, [historyKey, historyTitle]);

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
  const upNext = uniqueVideos(recommended.videos, ownVideos).filter((item) => item.id !== video.id).slice(0, 20);
  const games = [...GAMES].sort((a, b) => Number(b.featured) - Number(a.featured) || a.order - b.order).slice(0, 4);
  const description = video.description.trim();
  const isLong = description.length > LONG_DESCRIPTION || description.split("\n").length > 3;
  const youtubeUrl = "https://www.youtube.com/watch?v=" + video.id;
  const embedUrl = "https://www.youtube-nocookie.com/embed/" + video.id + "?autoplay=1&rel=0&playsinline=1";

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
            {video.embeddable && !playing ? (
              <button type="button" className="watch-poster" onClick={() => setPlaying(true)} aria-label={"Play " + video.title}>
                <img src={video.thumb} alt="" />
                <span className="hub-spotlight-play"><span><Icon name="play" size={34} /></span></span>
              </button>
            ) : video.embeddable ? (
              <iframe
                key={video.id}
                src={embedUrl}
                title={video.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            ) : (
              // The owner turned off playback on other sites for this video.
              <div className="watch-blocked">
                <img src={video.thumb} alt="" />
                <div>
                  <p>This video can only be played on YouTube.</p>
                  <a className="hub-pill-btn is-primary" href={youtubeUrl} target="_blank" rel="noopener noreferrer">
                    <Icon name="external" size={18} />Watch on YouTube
                  </a>
                </div>
              </div>
            )}
          </div>

          <div className="watch-body">
            <h1>{video.title}</h1>

            <div className="watch-bar">
              <div className="watch-channel">
                <Avatar label={video.channel} src={video.channelAvatar} size={40} />
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
                  {liked ? "Saved" : "Save"}
                </button>
                <button type="button" className="hub-pill-btn" onClick={onShare}>
                  <Icon name="share" size={18} />
                  {shareState || "Share"}
                </button>
                <YouTubeAttribution href={youtubeUrl} label="Watch on" />
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
