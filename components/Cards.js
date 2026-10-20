import Link from "next/link";
import Icon from "./Icon";
import { formatViews, timeAgo } from "../lib/format";

function initials(text) {
  const words = String(text || "?").replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/);
  return (words.slice(0, 2).map((word) => word[0]).join("") || "?").toUpperCase();
}

export function Avatar({ label, hue = 262, size = 36, children }) {
  return (
    <span className="hub-avatar" style={{ "--h": hue, width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">
      {children || initials(label)}
    </span>
  );
}

// Generated cover art: each game gets a gradient from its hue plus its icon,
// so cloud games read like video thumbnails without needing image files.
export function GameCover({ game, size = "md" }) {
  return (
    <span className={"game-cover game-cover-" + size} style={{ "--h": game.hue }} aria-hidden="true">
      <span className="game-cover-icon">{game.icon}</span>
      <span className="game-cover-title">{game.title}</span>
    </span>
  );
}

function VideoMeta({ video }) {
  return (
    <>
      {formatViews(video.views)}
      {video.views != null && video.published ? " • " : ""}
      <span suppressHydrationWarning>{timeAgo(video.published)}</span>
    </>
  );
}

export function VideoCard({ video, layout = "grid" }) {
  return (
    <Link href={video.href} className={"media-card media-" + layout}>
      <span className="media-thumb">
        <img src={video.thumb} alt="" loading="lazy" decoding="async" />
        {video.short && <span className="media-badge">SHORT</span>}
        <span className="media-hover" aria-hidden="true"><Icon name="play" size={34} /></span>
      </span>
      <span className="media-meta">
        {layout === "grid" && <Avatar label={video.channel} hue={262} />}
        <span className="media-text">
          <span className="media-title">{video.title}</span>
          <span className="media-sub">{video.channel}</span>
          <span className="media-sub"><VideoMeta video={video} /></span>
          {layout === "row" && video.description && <span className="media-desc">{video.description}</span>}
        </span>
      </span>
    </Link>
  );
}

export function ShortCard({ video }) {
  return (
    <Link href={"/shorts?v=" + video.id} className="short-card">
      <img src={video.thumb} alt="" loading="lazy" decoding="async" />
      <span className="short-card-info">
        <span className="short-card-title">{video.title}</span>
        <span className="short-card-views">{formatViews(video.views)}</span>
      </span>
    </Link>
  );
}

export function GameCard({ game, layout = "grid", liked = false, onToggleLike }) {
  return (
    <div className={"media-card media-" + layout + " is-game"}>
      <Link href={game.href} className="media-thumb" aria-label={"Play " + game.title}>
        <GameCover game={game} size={layout === "grid" ? "md" : "sm"} />
        <span className="media-badge media-badge-cloud"><Icon name="cloud" size={13} strokeWidth={2.2} />CLOUD</span>
        <span className="media-hover" aria-hidden="true"><span className="media-play-pill"><Icon name="play" size={16} />Play</span></span>
      </Link>
      <span className="media-meta">
        {layout === "grid" && <Avatar hue={game.hue}>{game.icon}</Avatar>}
        <span className="media-text">
          <Link href={game.href} className="media-title">{game.title}</Link>
          <span className="media-sub">{game.studio}</span>
          <span className="media-sub">{game.genre} • Cloud game</span>
          {layout === "row" && <span className="media-desc">{game.excerpt}</span>}
        </span>
        {onToggleLike && (
          <button
            type="button"
            className={"media-like" + (liked ? " is-liked" : "")}
            onClick={() => onToggleLike(game)}
            aria-pressed={liked}
            aria-label={(liked ? "Unlike " : "Like ") + game.title}
            title={liked ? "Remove from Liked" : "Save to Liked"}
          >
            <Icon name={liked ? "heartFill" : "heart"} size={20} />
          </button>
        )}
      </span>
    </div>
  );
}

export function PostCard({ post, layout = "grid" }) {
  return (
    <Link href={post.href} className={"post-tile post-tile-" + layout}>
      <span className="post-tile-head">
        <Avatar label="DigitBox" hue={200} size={32} />
        <span>
          <b>DigitBox</b>
          <small>Community post</small>
        </span>
      </span>
      <span className="post-tile-title">{post.title}</span>
      {post.excerpt && <span className="post-tile-excerpt">{post.excerpt}</span>}
      <span className="post-tile-cta">Read post <Icon name="chevron" size={16} /></span>
    </Link>
  );
}

export function CatalogCard({ item, layout, liked, onToggleLike }) {
  if (item.kind === "video") return <VideoCard video={item} layout={layout} />;
  if (item.kind === "game") return <GameCard game={item} layout={layout} liked={liked} onToggleLike={onToggleLike} />;
  return <PostCard post={item} layout={layout} />;
}
